"""Native OCI checks that make the ECC-2:2024 workbook's FULL-automation rows fully automated.

Read-only. Policy inputs (the workbook says "approved"/"configured") come from environment variables; when a
required allow-list is not configured the check reports MANUAL (with the facts collected) rather than guessing:

    NCA_APPROVED_ADMINS          comma-separated user names/e-mails allowed to hold tenancy-admin privileges
    NCA_APPROVED_PUBLIC_PORTS    ports allowed to be open to the internet (default "80,443")
    NCA_SCAN_MAX_AGE_DAYS        maximum age of the latest vulnerability scan (default 30)
    NCA_VULN_SLA_CRITICAL_DAYS   remediation SLA for CRITICAL Cloud Guard problems (default 15)
    NCA_VULN_SLA_HIGH_DAYS       remediation SLA for HIGH Cloud Guard problems (default 30)
    NCA_LOG_RETENTION_DAYS       required security-log retention (default 365)
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone

import oci

from .aggregate import FAIL, MANUAL, PASS
from .native_checks import NATIVE_CHECKS, NativeContext
from .native_checks_extra import _PRINCIPAL_CONDITION, _all, _each_comp_region, _res, _rrset, _spec, is_unrestricted_any_user


def _env_list(name: str) -> list[str]:
    return [x.strip().lower() for x in os.getenv(name, "").split(",") if x.strip()]


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _not_found(exc: Exception) -> bool:
    return isinstance(exc, oci.exceptions.ServiceError) and exc.status == 404 and exc.code != "NotAuthorizedOrNotFound"


# --------------------------------------------------------------------------- privileged identities

_POLICY_ADMIN = re.compile(r"^\s*allow\s+group\s+(.+?)\s+to\s+manage\s+all-resources\s+in\s+tenancy\s*$", re.I)


def _privileged_users(ctx: NativeContext):
    """Members of Administrators and of any group granted 'manage all-resources in tenancy'. Returns [(user, groups)]."""
    cache = getattr(ctx.provider, "_nca_priv_cache", None)
    if cache is not None:
        return cache
    home, tenancy = ctx.provider.home_region, ctx.provider.identity.tenancy_id
    out = []
    try:
        groups = {g.id: g for g in _all(ctx, oci.identity.IdentityClient, "list_groups", home, compartment_id=tenancy)}
        admin_names = {"administrators"}
        for p in _all(ctx, oci.identity.IdentityClient, "list_policies", home, compartment_id=tenancy):
            for st in p.statements or []:
                m = _POLICY_ADMIN.match(st)
                if m:
                    admin_names.add(m.group(1).strip("'\"").split("/")[-1].strip("'\"").lower())
        users = {u.id: u for u in _all(ctx, oci.identity.IdentityClient, "list_users", home, compartment_id=tenancy)}
        members: dict[str, set[str]] = {}
        for gid, g in groups.items():
            if g.name.lower() not in admin_names:
                continue
            for m in _all(ctx, oci.identity.IdentityClient, "list_user_group_memberships", home, compartment_id=tenancy, group_id=gid):
                members.setdefault(m.user_id, set()).add(g.name)
        out = [(users[uid], sorted(gs)) for uid, gs in members.items() if uid in users and users[uid].lifecycle_state == "ACTIVE"]
    except Exception as exc:  # noqa: BLE001
        ctx.add_error(exc, "Privileged identities")
        out = None
    ctx.provider._nca_priv_cache = out
    return out


def oci_privileged_users_mfa_enabled(ctx):
    users = _privileged_users(ctx)
    tenancy = ctx.provider.identity.tenancy_id
    out = []
    for u, groups in users or []:
        caps = getattr(u, "capabilities", None)
        if caps is not None and caps.can_use_console_password is False and not u.identity_provider_id:
            continue  # service identity without console access
        if u.identity_provider_id:
            out.append(_res(MANUAL, u.id, u.name, "User", ctx.provider.home_region, tenancy,
                            f"Privileged user {u.name} is federated; MFA is enforced by the identity provider and must be verified there.", groups=groups))
            continue
        out.append(_res(PASS if u.is_mfa_activated else FAIL, u.id, u.name, "User", ctx.provider.home_region, tenancy,
                        f"Privileged user {u.name} ({', '.join(groups)}) " + ("has MFA enabled." if u.is_mfa_activated else "does not have MFA enabled."), groups=groups))
    return out


def oci_admin_population_approved(ctx):
    users = _privileged_users(ctx)
    approved = _env_list("NCA_APPROVED_ADMINS")
    tenancy = ctx.provider.identity.tenancy_id
    out = []
    for u, groups in users or []:
        ids = {u.name.lower(), (u.email or "").lower()}
        if not approved:
            out.append(_res(MANUAL, u.id, u.name, "User", ctx.provider.home_region, tenancy,
                            f"{u.name} holds tenancy-admin privileges via {', '.join(groups)}; the approved admin population is not configured (NCA_APPROVED_ADMINS).", groups=groups))
        else:
            ok = bool(ids & set(approved))
            out.append(_res(PASS if ok else FAIL, u.id, u.name, "User", ctx.provider.home_region, tenancy,
                            f"{u.name} ({', '.join(groups)}) " + ("is in the approved admin population." if ok else "holds tenancy-admin privileges but is not in the approved admin population."), groups=groups))
    return out


def oci_admin_not_used_for_routine_operations(ctx):
    users = _privileged_users(ctx)
    if not users:
        return []
    home, tenancy = ctx.provider.home_region, ctx.provider.identity.tenancy_id
    names = {u.name.lower(): u for u, _ in users}
    approved = _env_list("NCA_APPROVED_ADMINS")
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=7)
    writes: dict[str, int] = {}
    try:
        client = ctx.client(oci.audit.AuditClient, home)
        resp = oci.pagination.list_call_get_all_results_generator(
            client.list_events, "record", compartment_id=tenancy, start_time=start, end_time=end)
        for i, ev in enumerate(resp):
            if i >= 20000:
                break
            data = getattr(ev, "data", None)
            ident = getattr(data, "identity", None)
            pn = (getattr(ident, "principal_name", None) or "").lower()
            action = (getattr(getattr(data, "request", None), "action", None) or "").upper()
            if pn in names and action in ("POST", "PUT", "DELETE", "PATCH"):
                writes[pn] = writes.get(pn, 0) + 1
    except Exception as exc:  # noqa: BLE001
        ctx.add_error(exc, "Audit events (7 days)")
        return []
    out = []
    for pn, u in names.items():
        n = writes.get(pn, 0)
        if n == 0:
            st, msg = PASS, f"Admin {u.name} made no change operations in the last 7 days."
        elif approved:
            ok = pn in approved or (u.email or "").lower() in approved
            st = PASS if ok else FAIL
            msg = f"Admin {u.name} made {n} change operations in the last 7 days" + (" (approved admin)." if ok else " and is not in the approved admin population.")
        else:
            st, msg = MANUAL, f"Admin {u.name} made {n} change operations in the last 7 days; approved break-glass/admin users are not configured (NCA_APPROVED_ADMINS)."
        out.append(_res(st, u.id, u.name, "User", home, tenancy, msg, change_operations_7d=n))
    return out


# --------------------------------------------------------------------------- IAM grants / trust

_PUBLIC_GRANT = re.compile(r"^\s*allow\s+any-user\b", re.I)
_CROSS_TENANCY = re.compile(r"^\s*(endorse|admit|define)\b", re.I)


def oci_iam_no_public_or_cross_tenancy_grants(ctx):
    home = ctx.provider.home_region
    out = []
    for comp in ctx.compartments:
        try:
            policies = _all(ctx, oci.identity.IdentityClient, "list_policies", home, compartment_id=comp.id)
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"Policies {getattr(comp, 'name', comp.id)}")
            continue
        for p in policies:
            bad = [s for s in (p.statements or []) if is_unrestricted_any_user(s)
                   or (_CROSS_TENANCY.match(s) and not re.match(r"^\s*define\s+(tenancy|group|dynamic-group|service)\b", s, re.I)
                       and not _PRINCIPAL_CONDITION.search(s))]  # endorse/admit limited to a service principal is not open access
            out.append(_res(FAIL if bad else PASS, p.id, p.name, "Policy", home, comp.id,
                            f"Policy {p.name} grants public (any-user) or cross-tenancy (endorse/admit) access: {' | '.join(bad)[:300]}" if bad
                            else f"Policy {p.name} grants no public or cross-tenancy access.", statements=bad))
    return out


def oci_iam_dynamic_groups_scoped(ctx):
    home, tenancy = ctx.provider.home_region, ctx.provider.identity.tenancy_id
    try:
        groups = _all(ctx, oci.identity.IdentityClient, "list_dynamic_groups", home, compartment_id=tenancy)
    except Exception as exc:  # noqa: BLE001
        ctx.add_error(exc, "Dynamic groups")
        return []
    out = []
    for g in groups:
        if g.lifecycle_state != "ACTIVE":
            continue
        if not (g.matching_rule or "").strip():
            out.append(_res(MANUAL, g.id, g.name, "DynamicGroup", home, tenancy,
                            f"Dynamic group {g.name}: the legacy IAM API returned no matching rule (tenancies using Identity Domains keep dynamic groups in the domain); verify the rule in the domain."))
            continue
        rule = (g.matching_rule or "").lower()
        scoped = any(k in rule for k in ("compartment.id", "tag.", "instance.id", "resource.id", "fnfunc.id", "application.id", "databaseid", "cluster.id"))
        broad = not scoped
        out.append(_res(FAIL if broad else PASS, g.id, g.name, "DynamicGroup", home, tenancy,
                        f"Dynamic group {g.name} matching rule is not scoped to a compartment, tag or specific resource: {(g.matching_rule or "")[:200]}" if broad
                        else f"Dynamic group {g.name} matching rule is scoped.", matching_rule=g.matching_rule or ""))
    return out


# --------------------------------------------------------------------------- network

_DB_PORTS = {1521, 1522, 1433, 3306, 5432, 27017, 6379, 1158, 2484, 3050, 50000}


def _ports_of(protocol, opts):
    """Return (lo, hi) of destination ports, or None for all ports / non-port protocols."""
    if protocol in ("6", "17"):
        pr = getattr(opts, "destination_port_range", None) if opts else None
        return (pr.min, pr.max) if pr else (1, 65535)
    return None


def _ingress(ctx: NativeContext):
    """[(region, comp, kind, id, name, [(source, protocol, lo_hi)])] for security lists and NSGs."""
    cache = getattr(ctx.provider, "_nca_net_cache", None)
    if cache is not None:
        return cache
    out = []
    for region, comp, sl in _each_comp_region(ctx, oci.core.VirtualNetworkClient, "list_security_lists", "Security lists"):
        rules = [(r.source, str(r.protocol), _ports_of(str(r.protocol), r.tcp_options if str(r.protocol) == "6" else r.udp_options))
                 for r in sl.ingress_security_rules or []]
        out.append((region, comp, "SecurityList", sl.id, sl.display_name, rules))
    for region, comp, nsg in _each_comp_region(ctx, oci.core.VirtualNetworkClient, "list_network_security_groups", "NSGs"):
        try:
            raw = _all(ctx, oci.core.VirtualNetworkClient, "list_network_security_group_security_rules", region,
                       network_security_group_id=nsg.id, direction="INGRESS")
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"NSG rules {nsg.display_name}")
            continue
        rules = [(r.source, str(r.protocol), _ports_of(str(r.protocol), r.tcp_options if str(r.protocol) == "6" else r.udp_options)) for r in raw]
        out.append((region, comp, "NetworkSecurityGroup", nsg.id, nsg.display_name, rules))
    ctx.provider._nca_net_cache = out
    return out


def _is_public(src) -> bool:
    return str(src) in ("0.0.0.0/0", "::/0")


def oci_network_no_unrestricted_ingress(ctx):
    approved = {int(p) for p in os.getenv("NCA_APPROVED_PUBLIC_PORTS", "80,443").split(",") if p.strip().isdigit()}
    out = []
    for region, comp, kind, rid, name, rules in _ingress(ctx):
        bad = []
        for src, proto, ports in rules:
            if not _is_public(src):
                continue
            if proto == "all":
                bad.append("all protocols/ports")
            elif ports is not None:
                lo, hi = ports
                if not (lo == hi and lo in approved) and not (all(p in approved for p in range(lo, hi + 1)) if hi - lo < 64 else False):
                    bad.append(f"{'TCP' if proto == '6' else 'UDP'} {lo}" + (f"-{hi}" if hi != lo else ""))
            elif proto not in ("1", "58"):
                bad.append(f"protocol {proto}")
        out.append(_res(FAIL if bad else PASS, rid, name, kind, region, comp.id,
                        f"{kind} {name} allows unapproved internet ingress: {', '.join(sorted(set(bad)))}." if bad
                        else f"{kind} {name} allows only approved public ingress (ports {sorted(approved)}).", violations=sorted(set(bad))))
    return out


def oci_network_no_public_database_ports(ctx):
    out = []
    for region, comp, kind, rid, name, rules in _ingress(ctx):
        bad = []
        for src, proto, ports in rules:
            if not _is_public(src):
                continue
            if proto == "all" or (ports and any(lo <= p <= hi for p in _DB_PORTS for lo, hi in [ports])):
                bad.append("all ports" if proto == "all" else f"{ports[0]}-{ports[1]}")
        out.append(_res(FAIL if bad else PASS, rid, name, kind, region, comp.id,
                        f"{kind} {name} exposes database port(s) to the internet: {', '.join(bad)}." if bad
                        else f"{kind} {name} does not expose database ports to the internet.", violations=bad))
    return out


# --------------------------------------------------------------------------- DNS

def oci_dns_security_configuration(ctx):
    home = ctx.provider.home_region
    out = []
    for comp in ctx.compartments:
        try:
            zones = _all(ctx, oci.dns.DnsClient, "list_zones", home, compartment_id=comp.id, scope="GLOBAL")
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"DNS zones {getattr(comp, 'name', comp.id)}")
            continue
        for z in zones:
            if z.lifecycle_state != "ACTIVE":
                continue
            on = str(z.dnssec_state).upper() == "ENABLED"
            out.append(_res(PASS if on else FAIL, z.id, z.name, "DnsZone", home, comp.id,
                            f"DNS zone {z.name} has DNSSEC " + ("enabled." if on else "disabled."), dnssec_state=str(z.dnssec_state)))
    return out


_DKIM_SELECTORS = ["default", "selector1", "selector2", "google", "k1", "k2", "s1", "s2", "dkim", "mail", "mandrill", "mxvault", "smtp", "zoho"]


def oci_dns_dkim_records(ctx):
    home = ctx.provider.home_region
    out = []
    for comp in ctx.compartments:
        try:
            zones = _all(ctx, oci.dns.DnsClient, "list_zones", home, compartment_id=comp.id, scope="GLOBAL")
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"DNS zones {getattr(comp, 'name', comp.id)}")
            continue
        client = ctx.client(oci.dns.DnsClient, home)
        for z in zones:
            if z.lifecycle_state != "ACTIVE":
                continue
            try:
                if not _rrset(client, z.id, z.name, "MX", comp.id):
                    continue
                found = [s for s in _DKIM_SELECTORS if _rrset(client, z.id, f"{s}._domainkey.{z.name}", "TXT", comp.id)
                         or _rrset(client, z.id, f"{s}._domainkey.{z.name}", "CNAME", comp.id)]
            except Exception as exc:  # noqa: BLE001
                ctx.add_error(exc, f"DKIM lookup {z.name}")
                continue
            out.append(_res(PASS if found else MANUAL, z.id, z.name, "DnsZone", home, comp.id,
                            f"Mail domain {z.name} publishes DKIM selector(s): {', '.join(found)}." if found
                            else f"Mail domain {z.name}: none of {len(_DKIM_SELECTORS)} common DKIM selectors found in OCI DNS; the selector is provider-specific, verify with the mail provider.",
                            selectors=found))
    return out


# --------------------------------------------------------------------------- encryption / keys

def oci_data_stores_encrypted_at_rest(ctx):
    """OCI encrypts every Object Storage bucket, block/boot volume and file system at rest; this records the key type."""
    from prowler.providers.oraclecloud.services.blockstorage.blockstorage_client import blockstorage_client
    from prowler.providers.oraclecloud.services.objectstorage.objectstorage_client import objectstorage_client

    out = []
    items = [("Bucket", b) for b in getattr(objectstorage_client, "buckets", [])] + \
            [("Volume", v) for v in getattr(blockstorage_client, "volumes", [])] + \
            [("BootVolume", v) for v in getattr(blockstorage_client, "boot_volumes", [])]
    for rtype, r in items:
        cmk = bool(getattr(r, "kms_key_id", None))
        out.append(_res(PASS, r.id, r.name, rtype, r.region, r.compartment_id,
                        f"{rtype} {r.name} is encrypted at rest with " + ("a customer-managed key." if cmk else "an Oracle-managed key (OCI encrypts all storage at rest)."),
                        customer_managed_key=cmk))
    return out


def oci_kms_key_lifecycle_managed(ctx):
    out = []
    for region, comp, vault in _each_comp_region(ctx, oci.key_management.KmsVaultClient, "list_vaults", "Vaults"):
        if vault.lifecycle_state != "ACTIVE":
            continue
        try:
            cfg = {**ctx.provider.session.config, "region": region}
            mgmt = oci.key_management.KmsManagementClient(cfg, service_endpoint=vault.management_endpoint,
                                                          **({"signer": ctx.provider.session.signer} if ctx.provider.session.signer else {}))
            keys = oci.pagination.list_call_get_all_results(mgmt.list_keys, compartment_id=comp.id).data
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"Keys in vault {vault.display_name}")
            continue
        for k in keys:
            tags = {t.lower() for t in (k.freeform_tags or {})} | {t.lower() for ns in (k.defined_tags or {}).values() for t in ns}
            has_owner = bool(tags & {"owner", "createdby", "created_by", "keyowner"})
            problems = []
            if k.lifecycle_state not in ("ENABLED",):
                problems.append(f"state {k.lifecycle_state}")
            if not k.is_auto_rotation_enabled:
                problems.append("automatic rotation disabled")
            if not has_owner:
                problems.append("no owner tag")
            out.append(_res(FAIL if problems else PASS, k.id, k.display_name, "Key", region, comp.id,
                            f"Key {k.display_name}: " + ("; ".join(problems) + "." if problems else "enabled, rotating and has an owner tag."),
                            problems=problems))
    return out


# --------------------------------------------------------------------------- logging

def oci_lb_logging_enabled(ctx):
    out = []
    lbs = list(_each_comp_region(ctx, oci.load_balancer.LoadBalancerClient, "list_load_balancers", "Load balancers"))
    if not lbs:
        return []
    covered: dict[str, set[str]] = {}
    for region in {r for r, _, _ in lbs}:
        for comp in ctx.compartments:
            try:
                for lg in _all(ctx, oci.logging.LoggingManagementClient, "list_log_groups", region, compartment_id=comp.id):
                    for log in _all(ctx, oci.logging.LoggingManagementClient, "list_logs", region, log_group_id=lg.id):
                        src = getattr(getattr(log, "configuration", None), "source", None)
                        if log.is_enabled and src and getattr(src, "service", "") == "loadbalancer":
                            covered.setdefault(region, set()).add(getattr(src, "resource", ""))
            except Exception as exc:  # noqa: BLE001
                ctx.add_error(exc, f"Logging {getattr(comp, 'name', comp.id)} ({region})")
    for region, comp, lb in lbs:
        ok = lb.id in covered.get(region, set())
        out.append(_res(PASS if ok else FAIL, lb.id, lb.display_name, "LoadBalancer", region, comp.id,
                        f"Load balancer {lb.display_name} has an enabled access/error log." if ok else f"Load balancer {lb.display_name} has no enabled Logging service log."))
    return out


def _connectors(ctx):
    """[(region, comp, connector)] for service connectors exporting Logging data to Object Storage."""
    out = []
    for region, comp, c in _each_comp_region(ctx, oci.sch.ServiceConnectorClient, "list_service_connectors", "Service connectors"):
        if c.lifecycle_state != "ACTIVE":
            continue
        try:
            full = ctx.client(oci.sch.ServiceConnectorClient, region).get_service_connector(c.id).data
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"Service connector {c.display_name}")
            continue
        if getattr(full.source, "kind", "") == "logging" and getattr(full.target, "kind", "") == "objectStorage":
            out.append((region, comp, full))
    return out


def _bucket_rules(ctx, region, ns, bucket):
    client = ctx.client(oci.object_storage.ObjectStorageClient, region)
    return oci.pagination.list_call_get_all_results(client.list_retention_rules, ns, bucket).data


def oci_log_retention_12_months(ctx):
    need = _env_int("NCA_LOG_RETENTION_DAYS", 365)
    logs = []
    for region in ctx.regions:
        for comp in ctx.compartments:
            try:
                for lg in _all(ctx, oci.logging.LoggingManagementClient, "list_log_groups", region, compartment_id=comp.id):
                    for log in _all(ctx, oci.logging.LoggingManagementClient, "list_logs", region, log_group_id=lg.id):
                        if log.is_enabled:
                            logs.append((region, comp, log))
            except Exception as exc:  # noqa: BLE001
                ctx.add_error(exc, f"Logging {getattr(comp, 'name', comp.id)} ({region})")
    if not logs:
        return []
    archive = {}
    try:
        for region, comp, c in _connectors(ctx):
            ns = getattr(c.target, "namespace", None) or ctx.client(oci.object_storage.ObjectStorageClient, region).get_namespace().data
            rules = _bucket_rules(ctx, region, ns, c.target.bucket_name)
            archive[region] = archive.get(region, False) or any((r.duration is None) or _dur_days(r.duration) >= need for r in rules)
    except Exception as exc:  # noqa: BLE001
        ctx.add_error(exc, "Log archive retention")
    out = []
    for region, comp, log in logs:
        days = log.retention_duration
        ok = (days is not None and days >= need) or archive.get(region, False)
        out.append(_res(PASS if ok else FAIL, log.id, log.display_name, "Log", region, comp.id,
                        f"Log {log.display_name}: " + (f"retained {days} days or archived to a bucket with >= {need}-day retention." if ok
                        else f"service retention {days} days (< {need}) and not archived to Object Storage with a long retention rule."),
                        retention_days=days))
    return out


def _dur_days(d) -> int:
    unit = str(getattr(d, "time_unit", "")).upper()
    amt = getattr(d, "time_amount", 0) or 0
    return amt * {"DAYS": 1, "YEARS": 365}.get(unit, 1)


def oci_log_bucket_retention_locked(ctx):
    out = []
    for region, comp, c in _connectors(ctx):
        try:
            ns = getattr(c.target, "namespace", None) or ctx.client(oci.object_storage.ObjectStorageClient, region).get_namespace().data
            rules = _bucket_rules(ctx, region, ns, c.target.bucket_name)
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"Retention rules {c.target.bucket_name}")
            continue
        locked = [r for r in rules if r.time_rule_locked]
        out.append(_res(PASS if locked else FAIL, f"{ns}/{c.target.bucket_name}", c.target.bucket_name, "Bucket", region, comp.id,
                        f"Log archive bucket {c.target.bucket_name} has a locked retention rule (immutable)." if locked
                        else f"Log archive bucket {c.target.bucket_name} has no locked retention rule; logs can be modified or deleted."))
    return out


# --------------------------------------------------------------------------- patching / vulnerabilities

def oci_os_patch_compliance(ctx):
    insts = [x for x in _each_comp_region(ctx, oci.core.ComputeClient, "list_instances", "Instances")
             if x[2].lifecycle_state not in ("TERMINATED", "TERMINATING")]
    if not insts:
        return []
    managed: dict[tuple[str, str], dict] = {}
    for region in {r for r, _, _ in insts}:
        for comp in ctx.compartments:
            try:
                for mi in _all(ctx, oci.os_management_hub.ManagedInstanceClient, "list_managed_instances", region, compartment_id=comp.id):
                    managed[(region, mi.display_name)] = mi
            except Exception as exc:  # noqa: BLE001
                ctx.add_error(exc, f"OS Management Hub {getattr(comp, 'name', comp.id)} ({region})")
    out = []
    for region, comp, i in insts:
        mi = managed.get((region, i.display_name))
        if mi is None:
            out.append(_res(FAIL, i.id, i.display_name, "Instance", region, comp.id,
                            f"Instance {i.display_name} is not registered with OS Management Hub, so patch compliance cannot be demonstrated."))
        else:
            n = mi.updates_available or 0
            out.append(_res(FAIL if n else PASS, i.id, i.display_name, "Instance", region, comp.id,
                            f"Instance {i.display_name} has {n} pending update(s)." if n else f"Instance {i.display_name} is fully patched per OS Management Hub.",
                            updates_available=n))
    return out


def oci_vss_scans_recent(ctx):
    max_age = timedelta(days=_env_int("NCA_SCAN_MAX_AGE_DAYS", 30))
    insts = [x for x in _each_comp_region(ctx, oci.core.ComputeClient, "list_instances", "Instances")
             if x[2].lifecycle_state not in ("TERMINATED", "TERMINATING")]
    if not insts:
        return []
    latest: dict[str, datetime] = {}
    for region, comp in {(r, c.id): (r, c) for r, c, _ in insts}.values():
        try:
            for res in _all(ctx, oci.vulnerability_scanning.VulnerabilityScanningClient, "list_host_agent_scan_results", region, compartment_id=comp.id):
                t = res.time_finished or res.time_started
                if t and (res.instance_id not in latest or t > latest[res.instance_id]):
                    latest[res.instance_id] = t
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"VSS scan results {getattr(comp, 'name', comp.id)} ({region})")
    now = datetime.now(timezone.utc)
    out = []
    for region, comp, i in insts:
        t = latest.get(i.id)
        ok = bool(t) and now - t <= max_age
        out.append(_res(PASS if ok else FAIL, i.id, i.display_name, "Instance", region, comp.id,
                        f"Instance {i.display_name} last scanned {t:%Y-%m-%d}." if ok else
                        (f"Instance {i.display_name} last scanned {t:%Y-%m-%d}, older than {max_age.days} days." if t else f"Instance {i.display_name} has never been vulnerability-scanned."),
                        last_scan=str(t)))
    return out


def oci_vss_findings_severity_classified(ctx):
    out = []
    for region in ctx.regions:
        for comp in ctx.compartments:
            try:
                vulns = _all(ctx, oci.vulnerability_scanning.VulnerabilityScanningClient, "list_host_vulnerabilities", region, compartment_id=comp.id)
            except Exception as exc:  # noqa: BLE001
                ctx.add_error(exc, f"VSS vulnerabilities {getattr(comp, 'name', comp.id)} ({region})")
                continue
            if not vulns:
                continue
            bad = [v for v in vulns if str(v.severity).upper() in ("", "NONE", "UNKNOWN", "NONE")]
            out.append(_res(FAIL if bad else PASS, comp.id, getattr(comp, "name", comp.id), "Compartment", region, comp.id,
                            f"{len(bad)} of {len(vulns)} host vulnerabilities have no severity classification." if bad
                            else f"All {len(vulns)} host vulnerabilities are severity-classified."))
    return out


def _cg_problems(ctx):
    cache = getattr(ctx.provider, "_nca_cg_cache", None)
    if cache is not None:
        return cache
    tenancy, home = ctx.provider.identity.tenancy_id, ctx.provider.home_region
    try:
        reporting = ctx.client(oci.cloud_guard.CloudGuardClient, home).get_configuration(tenancy).data.reporting_region or home
        client = ctx.client(oci.cloud_guard.CloudGuardClient, reporting)
        probs = oci.pagination.list_call_get_all_results(client.list_problems, compartment_id=tenancy, compartment_id_in_subtree=True,
                                                         access_level="ACCESSIBLE", lifecycle_state="ACTIVE").data
    except Exception as exc:  # noqa: BLE001
        ctx.add_error(exc, "Cloud Guard problems")
        probs = None
    ctx.provider._nca_cg_cache = probs
    return probs


def oci_cloudguard_problems_classified(ctx):
    probs = _cg_problems(ctx)
    if not probs:
        return []
    bad = [p for p in probs if str(p.risk_level).upper() not in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "MINOR")]
    tid = ctx.provider.identity.tenancy_id
    return [_res(FAIL if bad else PASS, tid, "Cloud Guard problems", "CloudGuard", ctx.provider.home_region, tid,
                 f"{len(bad)} of {len(probs)} Cloud Guard problems have no risk level." if bad else f"All {len(probs)} active Cloud Guard problems carry a risk level.")]


def oci_cloudguard_critical_high_sla(ctx):
    probs = _cg_problems(ctx)
    if not probs:
        return []
    sla = {"CRITICAL": _env_int("NCA_VULN_SLA_CRITICAL_DAYS", 15), "HIGH": _env_int("NCA_VULN_SLA_HIGH_DAYS", 30)}
    now = datetime.now(timezone.utc)
    rows, relevant = [], 0
    for p in probs:
        lvl = str(p.risk_level).upper()
        if lvl not in sla:
            continue
        relevant += 1
        age = (now - p.time_first_detected).days
        if age > sla[lvl]:
            rows.append(_res(FAIL, p.id, p.resource_name or p.id, p.resource_type or "Problem", ctx.provider.home_region, p.compartment_id,
                             f"{lvl} Cloud Guard problem on {p.resource_name} open for {age} days (SLA {sla[lvl]}).", age_days=age, sla_days=sla[lvl]))
    if not rows and relevant:
        tid = ctx.provider.identity.tenancy_id
        rows.append(_res(PASS, tid, "Cloud Guard critical/high problems", "CloudGuard", ctx.provider.home_region, tid,
                         f"All {relevant} open critical/high problems are within SLA."))
    return rows


# --------------------------------------------------------------------------- API gateway

def oci_api_gateway_https_only(ctx):
    out = []
    for region, comp, gw in _each_comp_region(ctx, oci.apigateway.GatewayClient, "list_gateways", "API gateways"):
        if gw.lifecycle_state != "ACTIVE" or str(gw.endpoint_type).upper() != "PUBLIC":
            continue
        out.append(_res(PASS, gw.id, gw.display_name, "ApiGateway", region, comp.id,
                        f"Public API gateway {gw.display_name} serves HTTPS only (TLS 1.2+); plain HTTP and legacy TLS are not offered by the service."))
    return out


NATIVE_CHECKS.update({
    "oci_privileged_users_mfa_enabled": _spec(oci_privileged_users_mfa_enabled, "identity", "critical", "Privileged users have MFA enabled",
        "Members of Administrators and of groups with 'manage all-resources in tenancy' must have MFA (federated users are verified at the IdP).", "Enable MFA for every privileged user.", "", ()),
    "oci_admin_population_approved": _spec(oci_admin_population_approved, "identity", "high", "Tenancy-admin privileges are limited to the approved admin population",
        "Compares tenancy administrators with NCA_APPROVED_ADMINS; MANUAL when the allow-list is not configured.", "Remove admin privileges from users outside the approved population."),
    "oci_admin_not_used_for_routine_operations": _spec(oci_admin_not_used_for_routine_operations, "identity", "high", "Tenancy admins are not used for routine operations",
        "Looks at 7 days of Audit change events performed by tenancy administrators.", "Use least-privileged identities for routine work; reserve admins for approved break-glass."),
    "oci_iam_no_public_or_cross_tenancy_grants": _spec(oci_iam_no_public_or_cross_tenancy_grants, "identity", "critical", "No public (any-user) or cross-tenancy IAM grants",
        "Flags 'allow any-user' and endorse/admit statements.", "Remove or scope the statement."),
    "oci_iam_dynamic_groups_scoped": _spec(oci_iam_dynamic_groups_scoped, "identity", "medium", "Dynamic group matching rules are scoped",
        "Dynamic groups must be limited by compartment, tag or specific resource.", "Add a compartment or tag condition to the matching rule."),
    "oci_network_no_unrestricted_ingress": _spec(oci_network_no_unrestricted_ingress, "network", "high", "No unapproved internet ingress in security lists / NSGs",
        "Any rule open to 0.0.0.0/0 or ::/0 other than approved ports (NCA_APPROVED_PUBLIC_PORTS, default 80,443) fails.", "Restrict the source CIDR or remove the rule."),
    "oci_network_no_public_database_ports": _spec(oci_network_no_public_database_ports, "network", "critical", "Database ports are not exposed to the internet",
        "Detects internet-open rules covering common database ports.", "Restrict database ingress to private CIDRs."),
    "oci_dns_security_configuration": _spec(oci_dns_security_configuration, "dns", "medium", "Public DNS zones have DNSSEC enabled",
        "Evaluates DNSSEC state of public zones.", "Enable DNSSEC on the zone."),
    "oci_dns_dkim_records": _spec(oci_dns_dkim_records, "dns", "medium", "Mail domains publish DKIM records",
        "Probes common DKIM selectors; MANUAL if none found because selectors are provider-specific.", "Publish the DKIM TXT/CNAME record supplied by the mail provider."),
    "oci_data_stores_encrypted_at_rest": _spec(oci_data_stores_encrypted_at_rest, "storage", "medium", "Storage resources are encrypted at rest",
        "Buckets, block and boot volumes; OCI encrypts all of them, the evidence records Oracle-managed vs customer-managed key.", "No action required."),
    "oci_kms_key_lifecycle_managed": _spec(oci_kms_key_lifecycle_managed, "kms", "medium", "Vault keys are enabled, rotating and owned",
        "Keys must be ENABLED, auto-rotating and carry an owner tag.", "Enable rotation and tag the key with an owner."),
    "oci_lb_logging_enabled": _spec(oci_lb_logging_enabled, "logging", "medium", "Load balancers have access/error logs enabled",
        "Each load balancer must have an enabled Logging service log.", "Enable access and error logs for the load balancer."),
    "oci_log_retention_12_months": _spec(oci_log_retention_12_months, "logging", "high", "Security logs are retained for at least 12 months",
        "Logging service retention is capped at 180 days; longer retention requires archival to Object Storage with a retention rule.", "Export logs through Service Connector Hub to a bucket with a >=365-day retention rule."),
    "oci_log_bucket_retention_locked": _spec(oci_log_bucket_retention_locked, "logging", "high", "Log archive buckets are immutable (locked retention rule)",
        "Log archive buckets targeted by service connectors need a locked retention rule.", "Add a retention rule and lock it."),
    "oci_os_patch_compliance": _spec(oci_os_patch_compliance, "compute", "high", "Compute instances are registered and patched in OS Management Hub",
        "Instances must be managed by OS Management Hub with no pending updates (matched by name and region).", "Register the instance and apply pending updates."),
    "oci_vss_scans_recent": _spec(oci_vss_scans_recent, "vulnerability_scanning", "high", "Instances were vulnerability-scanned recently",
        "Latest host scan result must be within NCA_SCAN_MAX_AGE_DAYS (default 30).", "Schedule a recurring host scan recipe."),
    "oci_vss_findings_severity_classified": _spec(oci_vss_findings_severity_classified, "vulnerability_scanning", "medium", "Host vulnerabilities are severity-classified",
        "Every VSS host vulnerability must carry a severity.", "Review unclassified findings."),
    "oci_cloudguard_problems_classified": _spec(oci_cloudguard_problems_classified, "cloudguard", "medium", "Cloud Guard problems are risk-classified",
        "Every active problem must carry a risk level.", "Review Cloud Guard detector configuration."),
    "oci_cloudguard_critical_high_sla": _spec(oci_cloudguard_critical_high_sla, "cloudguard", "high", "Critical/high Cloud Guard problems are remediated within SLA",
        "CRITICAL problems within NCA_VULN_SLA_CRITICAL_DAYS (15) and HIGH within NCA_VULN_SLA_HIGH_DAYS (30).", "Remediate or formally accept the problem."),
    "oci_api_gateway_https_only": _spec(oci_api_gateway_https_only, "apigateway", "medium", "Public API gateways serve HTTPS only",
        "OCI API Gateway endpoints are HTTPS-only with TLS 1.2+; recorded per public gateway.", "No action required."),
})


# --------------------------------------------------------------------------- multi-tier (ECC 2-15-3)

def oci_backend_tiers_not_publicly_addressable(ctx):
    """Multi-tier web architecture: application/database tiers must not be directly internet-addressable
    (public IP on a compute VNIC, or a database reachable from any IP). Web-tier exposure is through a load balancer."""
    out = []
    for region, comp, i in _each_comp_region(ctx, oci.core.ComputeClient, "list_instances", "Instances"):
        if i.lifecycle_state in ("TERMINATED", "TERMINATING"):
            continue
        try:
            atts = _all(ctx, oci.core.ComputeClient, "list_vnic_attachments", region, compartment_id=comp.id, instance_id=i.id)
            vnet = ctx.client(oci.core.VirtualNetworkClient, region)
            public = [v.public_ip for v in (vnet.get_vnic(a.vnic_id).data for a in atts if a.lifecycle_state == "ATTACHED") if v.public_ip]
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"VNICs of {i.display_name}")
            continue
        out.append(_res(FAIL if public else PASS, i.id, i.display_name, "Instance", region, comp.id,
                        f"Instance {i.display_name} has public IP {', '.join(public)}: it is directly internet-addressable instead of sitting in a private tier behind a load balancer." if public
                        else f"Instance {i.display_name} has no public IP (private tier).", public_ips=public))
    for region, comp, d in _each_comp_region(ctx, oci.database.DatabaseClient, "list_autonomous_databases", "Autonomous DBs"):
        if d.lifecycle_state in ("TERMINATED", "TERMINATING"):
            continue
        private = bool(d.private_endpoint) or bool(d.is_access_control_enabled and d.whitelisted_ips)
        out.append(_res(PASS if private else FAIL, d.id, d.display_name, "AutonomousDatabase", region, comp.id,
                        f"Autonomous Database {d.display_name} is " + ("private or IP-restricted." if private else "reachable from any IP.")))
    return out


NATIVE_CHECKS["oci_backend_tiers_not_publicly_addressable"] = _spec(
    oci_backend_tiers_not_publicly_addressable, "network", "high", "Application and database tiers are not directly internet-addressable",
    "Compute instances must not hold public IPs and databases must be private or IP-restricted (web tier is exposed via load balancers).",
    "Move the instance to a private subnet and publish it through a load balancer / WAF.")


# --------------------------------------------------------------------------- classification / labelling (ECC 2-1-5, 2-7-3)

_CLASS_TAGS = ("classif", "sensitiv", "data-class", "dataclass", "confidential")


def oci_storage_classification_labels(ctx):
    """Object Storage buckets must carry an information-classification label (free-form or defined tag)."""
    from prowler.providers.oraclecloud.services.objectstorage.objectstorage_client import objectstorage_client

    out = []
    clients: dict[str, object] = {}
    for b in getattr(objectstorage_client, "buckets", []):
        try:
            cl = clients.get(b.region) or clients.setdefault(b.region, ctx.client(oci.object_storage.ObjectStorageClient, b.region))
            data = cl.get_bucket(b.namespace, b.name).data
        except Exception as exc:  # noqa: BLE001
            ctx.add_error(exc, f"Bucket {b.name}")
            continue
        keys = [k.lower() for k in (data.freeform_tags or {})] + [k.lower() for ns in (data.defined_tags or {}).values() for k in ns]
        labelled = any(any(t in k for t in _CLASS_TAGS) for k in keys)
        out.append(_res(PASS if labelled else FAIL, b.id, b.name, "Bucket", b.region, b.compartment_id,
                        f"Bucket {b.name} carries a classification label." if labelled
                        else f"Bucket {b.name} has no information-classification tag (expected a tag containing 'classification' or 'sensitivity').", tags=keys))
    return out


NATIVE_CHECKS["oci_storage_classification_labels"] = _spec(
    oci_storage_classification_labels, "objectstorage", "medium", "Storage resources carry an information-classification label",
    "Buckets must have a classification/sensitivity tag so handling rules can be applied.",
    "Add a freeform or defined tag such as classification=confidential to the bucket.",
    "oci os bucket update --bucket-name <NAME> --freeform-tags '{\"classification\": \"confidential\"}'")
