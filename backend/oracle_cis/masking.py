"""Masks usernames and IP addresses in evidence before it leaves the API.

Masking is by key: checks put personal data under the keys below. E-mail addresses are also
masked wherever they appear in a string. Network perimeter ranges are configuration, not
personal data, so they are left alone.
"""
import ipaddress
import re

USER_KEYS = {"user", "username", "user_name", "actor", "actorname", "actor_name", "principal", "email"}
IP_KEYS = {"client_ip", "clientip", "ip", "source_ip", "sourceip"}
EMAIL_RE = re.compile(r"\b([A-Za-z0-9._%+-]{1,64})@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b")


def mask_user(value):
    if not isinstance(value, str) or not value:
        return value
    if "@" in value:
        local, _, domain = value.partition("@")
        return f"{local[:2]}***@{domain[:1]}***"
    return f"{value[:2]}***"


def mask_ip(value):
    if not isinstance(value, str) or not value:
        return value
    try:
        addr = ipaddress.ip_address(value.strip())
    except ValueError:
        return "***"
    if addr.version == 4:
        a, b, _, _ = str(addr).split(".")
        return f"{a}.{b}.x.x"
    return ":".join(addr.exploded.split(":")[:2]) + ":x:x:x:x:x:x"


def _mask_emails(text):
    return EMAIL_RE.sub(lambda m: mask_user(m.group(0)), text)


def mask(value, key=None):
    k = (key or "").lower()
    if isinstance(value, dict):
        return {kk: mask(vv, kk) for kk, vv in value.items()}
    if isinstance(value, list):
        return [mask(v, key) for v in value]
    if k in USER_KEYS:
        return mask_user(value)
    if k in IP_KEYS:
        return mask_ip(value)
    if isinstance(value, str):
        return _mask_emails(value)
    return value
