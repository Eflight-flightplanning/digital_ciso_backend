"""Additional read-only native OCI checks implementing rows of the ECC-2:2024 Cloud API workbook.

Same contract as native_checks.py. Every API failure goes through ctx.add_error so it surfaces as ERROR
(never as PASS or "no resources").
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import oci

from .aggregate import FAIL, PASS
from .native_checks import NATIVE_CHECKS, NativeContext

PUBLIC = "0.0.0.0/0"


def _all(ctx: NativeContext, client_cls, method: str, region: str, **kw):
    client = ctx.client(client_cls, region)
    return oci.pagination.list_call_get_all_results(getattr(client, method), **kw).data


def _each_comp_region(ctx: NativeContext, client_cls, method: str, label: str, regions=None, **extra):
    """Yield (region, compartment, item) across audited regions/compartments; API errors are recorded."""
    for region in regions or ctx.regions:
        for comp in ctx.compartments:
            try:
                for item in _all(ctx, client_cls, method, region, compartment_id=comp.id, **extra):
                    yield region, comp, item
            except Exception as exc:  # noqa: BLE001
                ctx.add_error(exc, f"{label} {getattr(comp, 'name', comp.id)} ({region})")


def _rrset(client, zone_id, domain, rtype, comp_id):
    """Record-set items, or [] when the record set does not exist (OCI answers 404 for a missing name)."""
    try:
        return client.get_rr_set(zone_id, domain, rtype, compartment_id=comp_id).data.items or []
    except oci.exceptions.ServiceError as exc:
        if exc.status == 404 and exc.code != "NotAuthorizedOrNotFound":
            return []
        raise


def _res(status, rid, name, rtype, region, comp, msg, **evidence):
    return {"status": status, "resource_id": rid, "resource_name": name, "resource_type": rtype, "region": region,
            "compartment_id": comp, "status_extended": msg, "evidence": evidence}


# --------------------------------------------------------------- load balancers / WAF

def _public_lbs(ctx):
    out = []
    for region, comp, lb in _each_comp_region(ctx, oci.load_balancer.LoadBalancerClient, "list_load_balancers", "Load balancers"):
        if not lb.is_private and lb.lifecycle_state == "ACTIVE":
            out.append((region, comp, lb))
    return out


def oci_waf_protects_public_load_balancers(ctx):
    lbs = _public_lbs(ctx)
    if not lbs:
        return []
    protected: dict[str, set[str]] = {}
    for region in {r for r, _, _ in lbs}:
        for comp in ctx.compartments:
            try:
                for w in _all(ctx, oci.waf.WafClient, "list_web_app_firewalls", region, compartment_id=comp.id):
                    lb_id = getattr(w, "load_balancer_id", None)
                    if lb_id and w.lifecycle_state == "ACTIVE":
                        protected.setdefault(region, set()).add(lb_id)
            except Exception as exc:  # noqa: BLE001
                ctx.add_error(exc, f"WAF firewalls {getattr(comp, 'name', comp.id)} ({region})")
    return [_res(PASS if lb.id in protected.get(region, set()) else FAIL, lb.id, lb.display_name, "LoadBalancer", region, comp.id,
                 f"Public load balancer {lb.display_name} " + ("is" if lb.id in protected.get(region, set()) else "is not") + " protected by an active WAF.")
            for region, comp, lb in lbs]


def oci_lb_listeners_https_only(ctx):
    out = []
    for region, comp, lb in _public_lbs(ctx):
        plain = [n for n, ls in (lb.listeners or {}).items() if str(ls.protocol).upper() == "HTTP" and not ls.ssl_configuration]
        out.append(_res(FAIL if plain else PASS, lb.id, lb.display_name, "LoadBalancer", region, comp.id,
                        f"Public load balancer {lb.display_name} has plain-HTTP listener(s): {', '.join(plain)}." if plain
                        else f"Public load balancer {lb.display_name} exposes no plain-HTTP listener.", plain_http_listeners=plain))
    return out


_WEAK_PROTOCOLS = {"TLSV1", "TLSV1.1"}
_WEAK_SUITES = {"OCI-DEFAULT-SSL-CIPHER-SUITE-V1", "OCI-COMPATIBLE-SSL-CIPHER-SUITE-V1", "OCI-WAF-COMPATIBLE-SSL-CIPHER-SUITE-V1"}


def oci_lb_tls_policy_secure(ctx):
    out = []
    for region, comp, lb in _public_lbs(ctx):
        weak = []
        for n, ls in (lb.listeners or {}).items():
            ssl = ls.ssl_configuration
            if not ssl:
                continue
            if _WEAK_SUITES & {str(ssl.cipher_suite_name).upper()} or _WEAK_PROTOCOLS & {str(p).upper() for p in (ssl.protocols or [])}:
                weak.append(n)
        has_tls = any(ls.ssl_configuration for ls in (lb.listeners or {}).values())
        if not has_tls:
            continue  # nothing to evaluate for TLS; plain HTTP is reported by the HTTPS-only check
        out.append(_res(FAIL if weak else PASS, lb.id, lb.display_name, "LoadBalancer", region, comp.id,
                        f"Load balancer {lb.display_name} listener(s) allow TLS 1.0/1.1 or legacy cipher suites: {', '.join(weak)}." if weak
                        else f"Load balancer {lb.display_name} TLS listeners use modern protocols and cipher suites.", weak_listeners=weak))
    return out


# --------------------------------------------------------------- DNS mail records

def oci_dns_mail_domain_spf_dmarc(ctx):
    home = ctx.provider.home_region
    out = []
    seen = set()
    for comp in ctx.compartments:
        try:
            zones = _all(ctx, oci.dns.DnsClient, "list_zones", home, compartment_id=comp.id, scope="GLOBAL")
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"DNS zones {getattr(comp, 'name', comp.id)}")
            continue
        for z in zones:
            if z.id in seen or z.lifecycle_state != "ACTIVE":
                continue
            seen.add(z.id)
            client = ctx.client(oci.dns.DnsClient, home)

            def recs(domain, rtype):
                return _rrset(client, z.id, domain, rtype, comp.id)
            try:
                mx = recs(z.name, "MX")
                if not mx:
                    continue  # not a mail domain
                txt = " ".join(r.rdata for r in recs(z.name, "TXT"))
                dm = " ".join(r.rdata for r in recs(f"_dmarc.{z.name}", "TXT"))
            except Exception as exc:  # noqa: BLE001
                ctx.add_error(exc, f"DNS records {z.name}")
                continue
            spf, dmarc = "v=spf1" in txt.lower(), "v=dmarc1" in dm.lower()
            missing = [n for n, ok in (("SPF", spf), ("DMARC", dmarc)) if not ok]
            out.append(_res(FAIL if missing else PASS, z.id, z.name, "DnsZone", home, comp.id,
                            f"Mail domain {z.name} is missing: {', '.join(missing)}." if missing else f"Mail domain {z.name} publishes SPF and DMARC.",
                            spf=spf, dmarc=dmarc, dkim="not evaluated (selector unknown)"))
    return out


# --------------------------------------------------------------- databases

def oci_database_encryption_at_rest(ctx):
    out = []
    for region, comp, d in _each_comp_region(ctx, oci.database.DatabaseClient, "list_autonomous_databases", "Autonomous DBs"):
        if d.lifecycle_state in ("TERMINATED", "TERMINATING"):
            continue
        cmk = bool(getattr(d, "kms_key_id", None))
        out.append(_res(PASS, d.id, d.display_name, "AutonomousDatabase", region, comp.id,
                        f"Autonomous Database {d.display_name} is encrypted at rest (TDE, always on) with " + ("a customer-managed key." if cmk else "an Oracle-managed key."),
                        customer_managed_key=cmk))
    for region, comp, s in _each_comp_region(ctx, oci.database.DatabaseClient, "list_db_systems", "DB systems"):
        if s.lifecycle_state in ("TERMINATED", "TERMINATING"):
            continue
        out.append(_res(PASS, s.id, s.display_name, "DbSystem", region, comp.id,
                        f"DB system {s.display_name} uses Transparent Data Encryption (always on for OCI-managed databases)."))
    return out


def oci_database_backup_enabled(ctx):
    out = []
    for region, comp, d in _each_comp_region(ctx, oci.database.DatabaseClient, "list_autonomous_databases", "Autonomous DBs"):
        if d.lifecycle_state in ("TERMINATED", "TERMINATING"):
            continue
        out.append(_res(PASS, d.id, d.display_name, "AutonomousDatabase", region, comp.id,
                        f"Autonomous Database {d.display_name} has automatic backups (always on, point-in-time recovery supported)."))
    for region, comp, s in _each_comp_region(ctx, oci.database.DatabaseClient, "list_db_systems", "DB systems"):
        if s.lifecycle_state in ("TERMINATED", "TERMINATING"):
            continue
        try:
            dbs = _all(ctx, oci.database.DatabaseClient, "list_databases", region, compartment_id=comp.id, system_id=s.id)
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"Databases of {s.display_name}")
            continue
        for db in dbs:
            cfg = getattr(db, "db_backup_config", None)
            ok = bool(cfg and cfg.auto_backup_enabled)
            out.append(_res(PASS if ok else FAIL, db.id, db.db_name, "Database", region, comp.id,
                            f"Database {db.db_name} has automatic backups " + ("enabled." if ok else "disabled.")))
    return out


# --------------------------------------------------------------- compute patch agent

_OS_PLUGINS = {"OS MANAGEMENT SERVICE AGENT", "OS MANAGEMENT HUB AGENT"}


def oci_instance_os_management_agent_enabled(ctx):
    out = []
    for region, comp, i in _each_comp_region(ctx, oci.core.ComputeClient, "list_instances", "Instances"):
        if i.lifecycle_state in ("TERMINATED", "TERMINATING"):
            continue
        cfg = i.agent_config
        plugins = {str(p.name).upper(): str(p.desired_state).upper() for p in (getattr(cfg, "plugins_config", None) or [])}
        enabled = any(n in _OS_PLUGINS and s == "ENABLED" for n, s in plugins.items()) and not getattr(cfg, "is_management_disabled", False)
        out.append(_res(PASS if enabled else FAIL, i.id, i.display_name, "Instance", region, comp.id,
                        f"Instance {i.display_name} has the OS management agent plugin enabled (patch compliance can be reported)." if enabled
                        else f"Instance {i.display_name} does not have the OS Management / OS Management Hub agent plugin enabled.",
                        plugins=plugins))
    return out


# --------------------------------------------------------------- IAM

_ANY_USER = re.compile(r"^\s*allow\s+(any-user|dynamic-group\s+\S+\s+to\s+manage\s+all-resources)", re.I)
_ALL_RES_TENANCY = re.compile(r"^\s*allow\s+group\s+(\S+)\s+to\s+manage\s+all-resources\s+in\s+tenancy\s*$", re.I)


def oci_iam_policy_no_overly_broad_statements(ctx):
    home = ctx.provider.home_region
    out = []
    for comp in ctx.compartments:
        try:
            policies = _all(ctx, oci.identity.IdentityClient, "list_policies", home, compartment_id=comp.id)
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"Policies {getattr(comp, 'name', comp.id)}")
            continue
        for p in policies:
            bad = []
            for st in p.statements or []:
                m = _ALL_RES_TENANCY.match(st)
                if _ANY_USER.match(st) or (m and m.group(1).lower() not in ("administrators", "'default'/administrators")):
                    bad.append(st)
            out.append(_res(FAIL if bad else PASS, p.id, p.name, "Policy", home, comp.id,
                            f"Policy {p.name} has overly broad statement(s): {' | '.join(bad)[:300]}" if bad
                            else f"Policy {p.name} has no any-user or non-Administrators manage-all-resources statements.", statements=bad))
    return out


def oci_iam_users_inactive_90_days(ctx):
    home = ctx.provider.home_region
    tenancy = ctx.provider.identity.tenancy_id
    try:
        users = _all(ctx, oci.identity.IdentityClient, "list_users", home, compartment_id=tenancy)
    except Exception as exc:  # noqa: BLE001
        ctx.add_error(exc, "Users")
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    out = []
    for u in users:
        if u.lifecycle_state != "ACTIVE":
            continue
        last = u.last_successful_login_time
        ref = last or u.time_created
        stale = ref < cutoff
        out.append(_res(FAIL if stale else PASS, u.id, u.name, "User", home, tenancy,
                        f"User {u.name} " + (f"last signed in {last:%Y-%m-%d}" if last else f"has never signed in (created {u.time_created:%Y-%m-%d})")
                        + (" — inactive for over 90 days." if stale else "."), last_login=str(last)))
    return out


# --------------------------------------------------------------- inventory / network firewall

def oci_resource_inventory_available(ctx):
    home = ctx.provider.home_region
    try:
        client = ctx.client(oci.resource_search.ResourceSearchClient, home)
        details = oci.resource_search.models.StructuredSearchDetails(query="query all resources", type="Structured")
        items = oci.pagination.list_call_get_all_results(client.search_resources, details, limit=1000).data
    except Exception as exc:  # noqa: BLE001
        ctx.add_error(exc, "Resource search")
        return []
    types: dict[str, int] = {}
    for it in items:
        types[it.resource_type] = types.get(it.resource_type, 0) + 1
    tid = ctx.provider.identity.tenancy_id
    return [_res(PASS if items else FAIL, tid, "Tenancy resource inventory", "Inventory", home, tid,
                 f"OCI Search returned an inventory of {len(items)} resources across {len(types)} resource types." if items
                 else "OCI Search returned no resources; an asset inventory could not be produced.", by_type=dict(sorted(types.items())))]


def oci_network_firewall_deployed(ctx):
    exposed = []
    for region, comp, igw in _each_comp_region(ctx, oci.core.VirtualNetworkClient, "list_internet_gateways", "Internet gateways"):
        if igw.lifecycle_state == "AVAILABLE" and igw.is_enabled:
            exposed.append((region, comp, igw))
    if not exposed:
        return []
    fw_regions = set()
    for region in {r for r, _, _ in exposed}:
        for comp in ctx.compartments:
            try:
                if _all(ctx, oci.network_firewall.NetworkFirewallClient, "list_network_firewalls", region, compartment_id=comp.id):
                    fw_regions.add(region)
            except Exception as exc:  # noqa: BLE001
                ctx.add_error(exc, f"Network firewalls {getattr(comp, 'name', comp.id)} ({region})")
    return [_res(PASS if region in fw_regions else FAIL, igw.id, igw.display_name, "InternetGateway", region, comp.id,
                 f"Internet gateway {igw.display_name}: a Network Firewall (IPS) is " + ("deployed in the region." if region in fw_regions else "not deployed in the region."))
            for region, comp, igw in exposed]


def _spec(fn, service, severity, title, desc, rem, cli="", clients=()):
    return {"fn": fn, "service": service, "severity": severity, "title": title, "description": desc,
            "remediation_text": rem, "remediation_cli": cli, "uses_clients": list(clients)}


NATIVE_CHECKS.update({
    "oci_waf_protects_public_load_balancers": _spec(oci_waf_protects_public_load_balancers, "waf", "high",
        "Public load balancers are protected by an OCI WAF", "Each public load balancer must have an active Web Application Firewall attached.",
        "Create a WAF policy and a web application firewall for each public load balancer."),
    "oci_lb_listeners_https_only": _spec(oci_lb_listeners_https_only, "loadbalancer", "high",
        "Public load balancers expose HTTPS only", "Public load balancers must not expose plain-HTTP listeners.",
        "Add an SSL configuration to listeners or replace HTTP listeners with an HTTPS redirect rule set."),
    "oci_lb_tls_policy_secure": _spec(oci_lb_tls_policy_secure, "loadbalancer", "medium",
        "Load balancer TLS listeners use TLS 1.2+ and modern ciphers", "TLS listeners must not allow TLS 1.0/1.1 or legacy cipher suites.",
        "Use a custom SSL cipher suite and protocols TLSv1.2/TLSv1.3 on every TLS listener."),
    "oci_dns_mail_domain_spf_dmarc": _spec(oci_dns_mail_domain_spf_dmarc, "dns", "medium",
        "Mail domains in OCI DNS publish SPF and DMARC", "Zones with MX records must publish SPF (apex TXT) and DMARC (_dmarc TXT). DKIM selectors cannot be enumerated and are not evaluated.",
        "Add TXT records 'v=spf1 ... -all' at the apex and 'v=DMARC1; p=quarantine; ...' at _dmarc."),
    "oci_database_encryption_at_rest": _spec(oci_database_encryption_at_rest, "database", "medium",
        "OCI databases are encrypted at rest", "Autonomous Databases and DB systems; TDE is always on, the evidence records whether a customer-managed key is used.", "No action required; consider a customer-managed key."),
    "oci_database_backup_enabled": _spec(oci_database_backup_enabled, "database", "high",
        "OCI databases have automatic backups / point-in-time recovery", "Autonomous DBs back up automatically; DB systems must have automatic backup enabled.",
        "Enable automatic backups in the database backup configuration.", "oci db database update --database-id <OCID> --db-backup-config '{\"autoBackupEnabled\": true}'"),
    "oci_instance_os_management_agent_enabled": _spec(oci_instance_os_management_agent_enabled, "compute", "medium",
        "Compute instances run the OS Management agent for patch compliance", "Instances need the OS Management (Hub) Oracle Cloud Agent plugin enabled.",
        "Enable the OS Management Hub Agent plugin on the instance and register it with OS Management Hub."),
    "oci_iam_policy_no_overly_broad_statements": _spec(oci_iam_policy_no_overly_broad_statements, "identity", "high",
        "IAM policies avoid any-user and wildcard administrator grants", "Flags 'allow any-user ...' and 'manage all-resources in tenancy' for groups other than Administrators.",
        "Replace the statement with least-privilege grants scoped to a compartment."),
    "oci_iam_users_inactive_90_days": _spec(oci_iam_users_inactive_90_days, "identity", "medium",
        "No active IAM user is inactive for more than 90 days", "Active users must have signed in within 90 days.",
        "Disable or delete inactive users.", "oci iam user update-user-state --user-id <OCID> --blocked true"),
    "oci_resource_inventory_available": _spec(oci_resource_inventory_available, "search", "low",
        "A tenancy-wide resource inventory can be produced", "OCI Search must return the tenancy resources (asset inventory).",
        "Grant the assessment user inspect access via the Search service."),
    "oci_network_firewall_deployed": _spec(oci_network_firewall_deployed, "network_firewall", "medium",
        "Internet-facing VCNs have an OCI Network Firewall (IPS)", "Regions with an enabled internet gateway should deploy an OCI Network Firewall.",
        "Deploy an OCI Network Firewall with an IPS policy in the VCN's region."),
})
