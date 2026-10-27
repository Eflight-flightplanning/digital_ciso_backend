"""Network perimeter helpers shared by CIS 2.1 and 2.2."""
import ipaddress

from .context import network_perimeters, rule_effect, rule_text, signon_policies

# A range with at least this many addresses (an IPv4 /8) is treated as wide open.
WIDE_OPEN_SIZE = 2**24


def range_size(entry):
    value = str(entry.get("value", "")).strip()
    try:
        if "-" in value:
            start, end = (ipaddress.ip_address(v.strip()) for v in value.split("-", 1))
            return int(end) - int(start) + 1
        return ipaddress.ip_network(value, strict=False).num_addresses
    except ValueError:
        return None


def perimeter_summary(api, ctx):
    perimeters, wide_open = [], []
    for p in network_perimeters(api, ctx):
        ranges = [str(e.get("value")) for e in p.get("ipAddresses") or []]
        perimeters.append({"id": p["id"], "name": p.get("name"), "ranges": ranges})
        for e in p.get("ipAddresses") or []:
            size = range_size(e)
            if size is not None and size >= WIDE_OPEN_SIZE:
                wide_open.append({"perimeter": p.get("name"), "range": str(e.get("value"))})
    return perimeters, wide_open


def referenced_perimeters(rule, perimeters):
    text = rule_text(rule)
    return [p["name"] for p in perimeters if p["id"].lower() in text or (p["name"] and p["name"].lower() in text)]


def mentions_network(rule, perimeters):
    text = rule_text(rule)
    return bool(referenced_perimeters(rule, perimeters)) or any(k in text for k in ("perimeter", "clientip", "networksource"))


def rules_with_perimeters(api, ctx, perimeters, policies=None):
    out = []
    for policy in policies if policies is not None else signon_policies(api, ctx):
        if not policy["active"]:
            continue
        for rule in policy["rules"]:
            if not rule["active"]:
                continue
            out.append(
                {
                    "policy": policy["name"],
                    "rule": rule["name"],
                    "effect": rule_effect(rule),
                    "perimeters": referenced_perimeters(rule, perimeters),
                    "mentions_network": mentions_network(rule, perimeters),
                    "condition_group": (rule.get("condition_group") or {}).get("value"),
                    "conditions": rule.get("condition_detail") or rule.get("condition"),
                }
            )
    return out
