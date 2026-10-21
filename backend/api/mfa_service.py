import os
import random
import time
import logging
import json
import urllib.request
import urllib.error
from django.core.cache import cache

logger = logging.getLogger(__name__)

OTP_TTL_SECONDS = 300  # 5 minutes validity


def is_mfa_enabled() -> bool:
    """Check if MFA enforcement is enabled (default: True / enabled unless explicitly disabled)."""
    val = os.environ.get("ENABLE_MFA")
    if val is not None:
        return val.strip().lower() in ("true", "1", "yes", "on")
    try:
        from django.conf import settings
        if hasattr(settings, "ENABLE_MFA"):
            return bool(settings.ENABLE_MFA)
    except Exception:
        pass
    return True


def get_sendgrid_config():
    """Retrieve SendGrid API key and from email dynamically."""
    api_key = os.environ.get("SENDGRID_API_KEY", "")
    from_email = os.environ.get("DEFAULT_FROM_EMAIL", "")
    
    if not api_key or not from_email:
        try:
            from config.env import env
            if not api_key:
                api_key = env("SENDGRID_API_KEY", default="")
            if not from_email:
                from_email = env("DEFAULT_FROM_EMAIL", default="mails@eflight.aero")
        except Exception:
            pass

    if not from_email:
        from_email = "mails@eflight.aero"
    return api_key, from_email


def send_mfa_otp_email(to_email: str, otp_code: str) -> bool:
    """Send a 6-digit MFA OTP email via SendGrid API from mails@eflight.aero."""
    api_key, from_email = get_sendgrid_config()
    
    if not api_key:
        logger.error("SENDGRID_API_KEY is not configured in environment or .env file.")
        return False

    url = "https://api.sendgrid.com/v3/mail/send"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 40px 20px; }}
        .container {{ max-width: 520px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }}
        .header {{ background: linear-gradient(135deg, #06b6d4, #2563eb); padding: 28px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }}
        .header p {{ margin: 4px 0 0 0; font-size: 12px; color: #e0f2fe; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; }}
        .body {{ padding: 32px 28px; text-align: center; }}
        .otp-box {{ background: #0f172a; border: 2px solid #06b6d4; border-radius: 12px; padding: 18px 24px; display: inline-block; margin: 24px 0; letter-spacing: 10px; font-family: monospace; font-size: 32px; font-weight: 900; color: #38bdf8; text-shadow: 0 0 12px rgba(56,189,248,0.4); }}
        .footer {{ border-top: 1px solid #334155; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; background: #0f172a; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>DIGITAL CISO PLATFORM</h1>
          <p>Multi-Factor Authentication (MFA)</p>
        </div>
        <div class="body">
          <p style="font-size: 14px; color: #cbd5e1; margin-top: 0;">
            Use the following 6-digit verification code to complete your secure login:
          </p>
          <div class="otp-box">{otp_code}</div>
          <p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">
            ⏱️ This code is valid for <strong>5 minutes</strong>. Do not share this code with anyone.
          </p>
        </div>
        <div class="footer">
          Sent by <strong>Digital CISO Platform</strong><br/>
          &copy; 2026 Eflight. All rights reserved. Zero-Trust Security Enforcement.
        </div>
      </div>
    </body>
    </html>
    """

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {
            "email": from_email,
            "name": "Digital CISO Security"
        },
        "subject": f"[{otp_code}] Your Digital CISO MFA Verification Code",
        "content": [
            {
                "type": "text/html",
                "value": html_content
            }
        ]
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status in (200, 201, 202):
                logger.info("MFA OTP email sent successfully to %s via SendGrid", to_email)
                return True
            else:
                logger.warning("SendGrid API returned status %s for %s", resp.status, to_email)
                return False
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        logger.error("SendGrid HTTPError %s for %s: %s", e.code, to_email, err_body)
        return False
    except Exception as e:
        logger.error("Failed to send SendGrid MFA email to %s: %s", to_email, e)
        return False


import hmac
import secrets

MAX_OTP_ATTEMPTS = 5
_GLOBAL_OTP_STORE = {}


def generate_and_store_otp(email: str) -> str:
    """Generate a 6-digit random OTP and store it in Django cache for 5 minutes."""
    clean_email = email.strip().lower()
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    cache_key = f"mfa_otp:{clean_email}"
    attempts_key = f"mfa_otp_attempts:{clean_email}"
    expires_at = time.time() + OTP_TTL_SECONDS

    # Store in Django cache with TTL and reset failed attempt count
    cache.set(cache_key, otp_code, timeout=OTP_TTL_SECONDS)
    cache.set(attempts_key, 0, timeout=OTP_TTL_SECONDS)
    _GLOBAL_OTP_STORE[clean_email] = (otp_code, expires_at)

    logger.info("Generated MFA OTP challenge for %s (valid for %ds)", clean_email, OTP_TTL_SECONDS)

    # Dispatch verification email via SendGrid
    send_mfa_otp_email(clean_email, otp_code)
    return otp_code


def verify_otp(email: str, submitted_otp: str) -> bool:
    """Verify if the submitted OTP matches the cached value.
    Enforces brute-force defense: locks and discards the OTP after 5 failed attempts.
    """
    if not submitted_otp:
        return False

    clean_email = email.strip().lower()
    clean_otp = submitted_otp.strip()
    cache_key = f"mfa_otp:{clean_email}"
    attempts_key = f"mfa_otp_attempts:{clean_email}"

    # Check brute-force lockout
    failed_attempts = int(cache.get(attempts_key) or 0)
    if failed_attempts >= MAX_OTP_ATTEMPTS:
        cache.delete(cache_key)
        _GLOBAL_OTP_STORE.pop(clean_email, None)
        logger.warning(
            "MFA verification blocked for %s: exceeded maximum allowed attempts (%d)",
            clean_email,
            MAX_OTP_ATTEMPTS,
        )
        return False

    cached_code = cache.get(cache_key)
    valid_code = None

    if cached_code:
        valid_code = str(cached_code).strip()
        logger.debug("OTP for %s found in shared Django cache", clean_email)
    elif clean_email in _GLOBAL_OTP_STORE:
        code, expires_at = _GLOBAL_OTP_STORE[clean_email]
        if time.time() <= expires_at:
            valid_code = str(code).strip()
            logger.debug("OTP for %s found in per-process fallback store", clean_email)
        else:
            _GLOBAL_OTP_STORE.pop(clean_email, None)

    if not valid_code:
        logger.warning("No valid OTP found for %s in cache or memory (process %d)", clean_email, os.getpid())
        return False

    # Constant-time comparison to prevent side-channel timing attacks
    if hmac.compare_digest(valid_code, clean_otp):
        cache.delete(cache_key)
        cache.delete(attempts_key)
        _GLOBAL_OTP_STORE.pop(clean_email, None)
        logger.info("MFA verification successful for %s", clean_email)
        return True

    # Failed attempt: increment counter
    failed_attempts += 1
    cache.set(attempts_key, failed_attempts, timeout=OTP_TTL_SECONDS)
    logger.warning(
        "Invalid MFA OTP attempt %d/%d for %s",
        failed_attempts,
        MAX_OTP_ATTEMPTS,
        clean_email,
    )

    if failed_attempts >= MAX_OTP_ATTEMPTS:
        cache.delete(cache_key)
        _GLOBAL_OTP_STORE.pop(clean_email, None)
        logger.warning(
            "MFA OTP locked and invalidated for %s after %d failed attempts",
            clean_email,
            MAX_OTP_ATTEMPTS,
        )

    return False

