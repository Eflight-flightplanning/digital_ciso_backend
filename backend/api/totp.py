"""Authenticator-app codes (RFC 6238): the six-digit code that changes every 30 seconds."""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

STEP_SECONDS = 30
DIGITS = 6
ISSUER = "Digital CISO"


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode()


def code_at(secret: str, step: int) -> str:
    digest = hmac.new(base64.b32decode(secret), struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10 ** DIGITS).zfill(DIGITS)


def matching_step(secret: str, code: str, after_step: int | None = None, now: float | None = None) -> int | None:
    """Which time step this code belongs to, allowing one step of clock drift.

    Steps at or before after_step are refused, so a code cannot be used twice.
    """
    if not (code.isascii() and code.isdigit() and len(code) == DIGITS):
        return None
    current = int((time.time() if now is None else now) // STEP_SECONDS)
    for step in (current - 1, current, current + 1):
        if after_step is not None and step <= after_step:
            continue
        if hmac.compare_digest(code_at(secret, step), code):
            return step
    return None


def provisioning_uri(secret: str, email: str) -> str:
    label = quote(f"{ISSUER}:{email}")
    query = urlencode({"secret": secret, "issuer": ISSUER, "digits": DIGITS, "period": STEP_SECONDS})
    return f"otpauth://totp/{label}?{query}"
