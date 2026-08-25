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


import tempfile

_GLOBAL_OTP_STORE = {}


def _get_otp_filepath() -> str:
    return os.path.join(tempfile.gettempdir(), "ciso_mfa_otps.json")


def _save_file_otp(clean_email: str, otp_code: str, expires_at: float):
    try:
        fp = _get_otp_filepath()
        data = {}
        if os.path.exists(fp):
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                data = {}
        data[clean_email] = {"code": str(otp_code), "expires_at": expires_at}
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception as e:
        logger.warning("Could not persist OTP to temp file: %s", e)


def _verify_and_clear_file_otp(clean_email: str, submitted_otp: str) -> bool:
    try:
        fp = _get_otp_filepath()
        if not os.path.exists(fp):
            return False
        with open(fp, "r", encoding="utf-8") as f:
            data = json.load(f)
        entry = data.get(clean_email)
        if entry:
            code = str(entry.get("code", "")).strip()
            expires_at = float(entry.get("expires_at", 0))
            if time.time() <= expires_at and code == submitted_otp:
                data.pop(clean_email, None)
                with open(fp, "w", encoding="utf-8") as f:
                    json.dump(data, f)
                return True
    except Exception as e:
        logger.warning("Error reading OTP from temp file: %s", e)
    return False


def generate_and_store_otp(email: str) -> str:
    """Generate a 6-digit random OTP and store it in Django cache, global store, and file store for 5 minutes."""
    clean_email = email.strip().lower()
    otp_code = f"{random.randint(100000, 999999)}"
    cache_key = f"mfa_otp:{clean_email}"
    expires_at = time.time() + OTP_TTL_SECONDS

    cache.set(cache_key, otp_code, timeout=OTP_TTL_SECONDS)
    _GLOBAL_OTP_STORE[clean_email] = (otp_code, expires_at)
    _save_file_otp(clean_email, otp_code, expires_at)

    print(f"\n==============================================", flush=True)
    print(f"CISO MFA OTP CODE FOR [{clean_email}]: {otp_code}", flush=True)
    print(f"==============================================\n", flush=True)
    logger.info("Generated MFA OTP %s for %s", otp_code, clean_email)

    # Send via SendGrid
    send_mfa_otp_email(clean_email, otp_code)
    return otp_code


def verify_otp(email: str, submitted_otp: str) -> bool:
    """Verify if the submitted OTP matches the cached value, global store, or file store."""
    if not submitted_otp:
        return False

    clean_email = email.strip().lower()
    clean_otp = submitted_otp.strip()
    cache_key = f"mfa_otp:{clean_email}"

    cached_code = cache.get(cache_key)
    if cached_code and str(cached_code).strip() == clean_otp:
        cache.delete(cache_key)
        _GLOBAL_OTP_STORE.pop(clean_email, None)
        return True

    # Fallback to global store if multi-worker cache mismatch occurs
    if clean_email in _GLOBAL_OTP_STORE:
        code, expires_at = _GLOBAL_OTP_STORE[clean_email]
        if time.time() <= expires_at and str(code).strip() == clean_otp:
            _GLOBAL_OTP_STORE.pop(clean_email, None)
            cache.delete(cache_key)
            return True

    # Fallback to file-backed cross-process store
    if _verify_and_clear_file_otp(clean_email, clean_otp):
        cache.delete(cache_key)
        _GLOBAL_OTP_STORE.pop(clean_email, None)
        return True

    return False
