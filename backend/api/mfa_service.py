"""Reusable Django Multi-Factor Authentication (MFA) Service.

Provides:
1. RFC 6238 TOTP Engine for Authenticator Apps (Google Authenticator, Microsoft Authenticator).
2. Managed Key Cryptography: Uses Fernet authenticated symmetric encryption.
   (Fernet utilizes a 256-bit compound key: 128-bit AES in CBC mode with PKCS7 padding
    coupled with 128-bit HMAC-SHA256 for authenticated ciphertext integrity).
3. Explicit Initial OTP Verification Step: MFA is only activated after the user verifies
   a valid code from the enrolled authenticator app.
4. Atomic Replay Prevention: Multi-layered defense combining atomic distributed cache
   reservations and database row-level locking (select_for_update).
5. Multi-Tier Rate Limiting: Per-user sliding windows, per-IP throttling, and
   automated 15-minute brute-force account lockout.
6. Fallback SendGrid Email OTP generation and verification.
"""

import base64
import json
import logging
import os
import random
import secrets
import time
import urllib.error
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

OTP_TTL_SECONDS = 300  # 5 minutes validity


# =====================================================================
# 1. Managed Key Cryptography (Fernet: AES-128-CBC + HMAC-SHA256)
# =====================================================================

def get_mfa_fernet():
    """Retrieve managed MultiFernet instance for MFA secrets encryption at rest.
    
    Fernet Specification:
    - 128-bit AES encryption in CBC mode with PKCS7 padding
    - 128-bit HMAC-SHA256 for authenticated message integrity
    - Compound 256-bit key (32 bytes url-safe base64 encoded)
    
    Key Management:
    - Primary key: settings.MFA_ENCRYPTION_KEY or settings.SECRETS_ENCRYPTION_KEY
    - Zero-downtime key rotation: settings.MFA_ENCRYPTION_KEY_PREVIOUS / SECRETS_ENCRYPTION_KEY_PREVIOUS
    """
    from cryptography.fernet import Fernet, MultiFernet

    primary = getattr(settings, "MFA_ENCRYPTION_KEY", None) or getattr(settings, "SECRETS_ENCRYPTION_KEY", None)
    if not primary:
        from api.crypto import fernet as default_fernet
        return default_fernet

    previous = getattr(settings, "MFA_ENCRYPTION_KEY_PREVIOUS", None) or getattr(
        settings, "SECRETS_ENCRYPTION_KEY_PREVIOUS", []
    )
    keys = [primary, *previous]
    return MultiFernet([Fernet(k.encode() if isinstance(k, str) else k) for k in keys])


# =====================================================================
# 2. Reusable Django MFA Service Class
# =====================================================================

class DjangoMFAService:
    """Enterprise-grade, reusable Django Multi-Factor Authentication Service."""

    RATE_LIMIT_USER_WINDOW = 60      # seconds
    RATE_LIMIT_USER_MAX = 5          # max verification attempts per minute per user
    RATE_LIMIT_IP_WINDOW = 60        # seconds
    RATE_LIMIT_IP_MAX = 30           # max verification attempts per minute per IP
    MAX_CODE_FAILURES = 5            # consecutive failures before lockout
    CODE_LOCK_MINUTES = 15           # lockout duration in minutes

    def is_enabled(self) -> bool:
        """Check if MFA enforcement is enabled globally."""
        val = os.environ.get("ENABLE_MFA")
        if val is not None:
            return val.strip().lower() in ("true", "1", "yes", "on") or not settings.DEBUG
        try:
            if hasattr(settings, "ENABLE_MFA"):
                return bool(settings.ENABLE_MFA)
        except Exception:
            pass
        return True

    def get_or_create_pending_record(self, user):
        """Retrieve existing UserMfa or initialize a new pending enrollment record."""
        return _mfa_record(user)

    def get_decrypted_secret(self, record) -> str:
        """Decrypt the Base32 secret using the managed Fernet instance."""
        return _secret(record)

    def is_activated(self, user) -> bool:
        """Returns True if the user has completed the initial OTP verification step."""
        from api.db_router import MainRouter
        from api.models import UserMfa

        record = UserMfa.objects.using(MainRouter.admin_db).filter(user=user).first()
        return bool(record and record.confirmed_at)

    def generate_challenge(self, user) -> dict:
        """Generate the authentication challenge payload for step 1.
        
        - If unactivated: returns setup QR code and manual setup key.
        - If activated: returns generic prompt without leaking the secret or QR code.
        """
        import segno
        from api.totp import provisioning_uri

        record = self.get_or_create_pending_record(user)

        # Subsequent logins: do not expose QR code or secret
        if record.confirmed_at:
            return {
                "mfa_required": True,
                "email": user.email,
                "message": "Enter the 6-digit code from your authenticator app.",
            }

        # First-time enrollment: provide setup QR code and Base32 key
        secret = self.get_decrypted_secret(record)
        uri = provisioning_uri(secret, user.email)
        return {
            "mfa_required": True,
            "mfa_setup_required": True,
            "email": user.email,
            "secret": secret,
            "qr_code": segno.make(uri, error="m").svg_data_uri(scale=5),
            "message": "Scan this code with an authenticator app, then enter the 6-digit code.",
        }

    def check_rate_limits(self, user, client_ip: str | None = None) -> tuple[bool, str | None]:
        """Enforce per-user and per-IP rate limits using fast distributed cache."""
        user_key = f"mfa_rate_user:{user.pk}"
        user_attempts = int(cache.get(user_key) or 0)
        if user_attempts >= self.RATE_LIMIT_USER_MAX:
            logger.warning("MFA per-user rate limit exceeded: user=%s", user.pk)
            return False, "Too many MFA attempts for this account. Please wait 60 seconds."
        cache.set(user_key, user_attempts + 1, timeout=self.RATE_LIMIT_USER_WINDOW)

        if client_ip:
            ip_key = f"mfa_rate_ip:{client_ip}"
            ip_attempts = int(cache.get(ip_key) or 0)
            if ip_attempts >= self.RATE_LIMIT_IP_MAX:
                logger.warning("MFA per-IP rate limit exceeded: ip=%s", client_ip)
                return False, "Too many verification requests from this IP. Please wait 60 seconds."
            cache.set(ip_key, ip_attempts + 1, timeout=self.RATE_LIMIT_IP_WINDOW)

        return True, None

    def activate_mfa(self, user, code: str, client_ip: str | None = None) -> tuple[bool, str]:
        """Explicit Initial OTP Verification Step.
        
        Verifies that the user actually scanned the QR code and possesses the authenticator
        before activating MFA on the account.
        """
        record = self.get_or_create_pending_record(user)
        if record.confirmed_at:
            return True, "MFA is already active on this account."

        success, err = self.verify_totp(user, code, client_ip=client_ip, is_activation=True)
        if success:
            logger.info("MFA explicitly activated and confirmed for user %s", user.pk)
            return True, "MFA successfully activated."
        return False, err or "Invalid verification code. Please try again."

    def verify_totp(
        self, user, code: str, client_ip: str | None = None, is_activation: bool = False
    ) -> tuple[bool, str]:
        """Verify a 6-digit TOTP code with atomic replay prevention and rate limiting.
        
        Returns:
            (True, "Success message") or (False, "Error description")
        """
        from api.db_router import MainRouter
        from api.models import UserMfa
        from api.totp import matching_step

        clean_code = (code or "").strip()
        if not clean_code or not clean_code.isdigit() or len(clean_code) != 6:
            return False, "Invalid or expired 6-digit MFA verification code."

        # 1. Rate limiting check
        allowed, rate_err = self.check_rate_limits(user, client_ip)
        if not allowed:
            return False, rate_err

        record = self.get_or_create_pending_record(user)
        now = timezone.now()

        # 2. Check brute-force lockout status
        if record.locked_until and record.locked_until > now:
            logger.warning("Authenticator check blocked for locked user %s", user.pk)
            return False, "Account temporarily locked due to too many failed attempts. Try again in 15 minutes."

        # 3. Match code against secret
        secret = self.get_decrypted_secret(record)
        step = matching_step(secret, clean_code, after_step=record.last_step)

        if step is None:
            # Code failed: increment failure counter under DB lock
            with transaction.atomic(using=MainRouter.admin_db):
                try:
                    locked_rec = (
                        UserMfa.objects.using(MainRouter.admin_db)
                        .select_for_update()
                        .filter(user=user)
                        .first()
                    )
                except Exception:
                    locked_rec = record

                target = locked_rec or record
                target.failed_attempts += 1
                if target.failed_attempts >= self.MAX_CODE_FAILURES:
                    target.failed_attempts = 0
                    target.locked_until = now + timedelta(minutes=self.CODE_LOCK_MINUTES)
                    logger.warning(
                        "User %s locked out for %d minutes after %d failed attempts",
                        user.pk, self.CODE_LOCK_MINUTES, self.MAX_CODE_FAILURES,
                    )
                target.save(
                    using=MainRouter.admin_db,
                    update_fields=["failed_attempts", "locked_until"],
                )
            return False, "Invalid or expired 6-digit MFA verification code."

        # 4. Atomic Replay Prevention Layer 1: Distributed cache atomic reservation
        cache_claim_key = f"totp_step_consumed:{user.pk}:{step}"
        if not cache.add(cache_claim_key, 1, timeout=90):
            logger.warning("Replay attack blocked via cache reservation: user=%s step=%s", user.pk, step)
            return False, "This verification code has already been used. Please wait for the next code."

        # 5. Atomic Replay Prevention Layer 2: Database atomic row lock
        with transaction.atomic(using=MainRouter.admin_db):
            try:
                locked_rec = (
                    UserMfa.objects.using(MainRouter.admin_db)
                    .select_for_update()
                    .filter(user=user)
                    .first()
                )
            except Exception:
                locked_rec = record

            target = locked_rec or record
            if target.last_step is not None and step <= target.last_step:
                logger.warning(
                    "Replay attack blocked via DB lock: user=%s step=%s <= last_step=%s",
                    user.pk, step, target.last_step,
                )
                return False, "This verification code has already been used. Please wait for the next code."

            # Update atomically
            target.last_step = step
            target.failed_attempts = 0
            target.locked_until = None
            if not target.confirmed_at:
                target.confirmed_at = now
            target.save(
                using=MainRouter.admin_db,
                update_fields=["last_step", "failed_attempts", "locked_until", "confirmed_at"],
            )

        logger.info("TOTP verification successful for user %s at step %s", user.pk, step)
        return True, "Verification successful."

    def reset_user_mfa(self, user) -> bool:
        """Reset / de-enroll user MFA so they can re-enroll a new device."""
        from api.db_router import MainRouter
        from api.models import UserMfa
        from api.totp import new_secret

        cipher = get_mfa_fernet()
        UserMfa.objects.using(MainRouter.admin_db).filter(user=user).update(
            secret=cipher.encrypt(new_secret().encode()),
            confirmed_at=None,
            last_step=None,
            failed_attempts=0,
            locked_until=None,
        )
        logger.info("Reset MFA enrollment for user %s", user.pk)
        return True


# Global Singleton Instance for easy import
mfa_service = DjangoMFAService()


# =====================================================================
# 3. Backward-Compatible Functional Interface
# =====================================================================

def _mfa_record(user):
    """Retrieve or create pending UserMfa record for user."""
    from api.db_router import MainRouter
    from api.models import UserMfa
    from api.totp import new_secret

    record = UserMfa.objects.using(MainRouter.admin_db).filter(user=user).first()
    if record is None:
        cipher = get_mfa_fernet()
        record = UserMfa(user=user, secret=cipher.encrypt(new_secret().encode()))
        record.save(using=MainRouter.admin_db)
    return record


def _secret(record) -> str:
    """Decrypt the Base32 secret using the managed Fernet instance."""
    cipher = get_mfa_fernet()
    return cipher.decrypt(bytes(record.secret)).decode()


def is_mfa_enabled() -> bool:
    return mfa_service.is_enabled()


def mfa_challenge(user) -> dict:
    return mfa_service.generate_challenge(user)


def verify_login_code(user, code: str, client_ip: str | None = None) -> bool:
    success, _ = mfa_service.verify_totp(user, code, client_ip=client_ip)
    return success


def activate_user_mfa(user, code: str, client_ip: str | None = None) -> tuple[bool, str]:
    return mfa_service.activate_mfa(user, code, client_ip=client_ip)


# =====================================================================
# 4. Email OTP Fallback Service (SendGrid)
# =====================================================================

MAX_OTP_ATTEMPTS = 5
_GLOBAL_OTP_STORE = {}


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


def generate_and_store_otp(email: str) -> str:
    """Generate a 6-digit random OTP and store it in Django cache for 5 minutes."""
    clean_email = email.strip().lower()
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    cache_key = f"mfa_otp:{clean_email}"
    attempts_key = f"mfa_otp_attempts:{clean_email}"
    expires_at = time.time() + OTP_TTL_SECONDS

    cache.set(cache_key, otp_code, timeout=OTP_TTL_SECONDS)
    cache.set(attempts_key, 0, timeout=OTP_TTL_SECONDS)
    _GLOBAL_OTP_STORE[clean_email] = (otp_code, expires_at)

    logger.info("Generated MFA OTP challenge for %s (valid for %ds)", clean_email, OTP_TTL_SECONDS)
    send_mfa_otp_email(clean_email, otp_code)
    return otp_code


def verify_otp(email: str, submitted_otp: str) -> bool:
    """Verify submitted email OTP against cached value with constant-time comparison."""
    import hmac

    if not submitted_otp:
        return False

    clean_email = email.strip().lower()
    clean_otp = submitted_otp.strip()
    cache_key = f"mfa_otp:{clean_email}"
    attempts_key = f"mfa_otp_attempts:{clean_email}"

    failed_attempts = int(cache.get(attempts_key) or 0)
    if failed_attempts >= MAX_OTP_ATTEMPTS:
        cache.delete(cache_key)
        _GLOBAL_OTP_STORE.pop(clean_email, None)
        logger.warning("MFA verification blocked for %s: exceeded max attempts (%d)", clean_email, MAX_OTP_ATTEMPTS)
        return False

    cached_code = cache.get(cache_key)
    valid_code = None

    if cached_code:
        valid_code = str(cached_code).strip()
    elif clean_email in _GLOBAL_OTP_STORE:
        code, expires_at = _GLOBAL_OTP_STORE[clean_email]
        if time.time() <= expires_at:
            valid_code = str(code).strip()
        else:
            _GLOBAL_OTP_STORE.pop(clean_email, None)

    if not valid_code:
        return False

    if hmac.compare_digest(valid_code, clean_otp):
        cache.delete(cache_key)
        cache.delete(attempts_key)
        _GLOBAL_OTP_STORE.pop(clean_email, None)
        logger.info("MFA email verification successful for %s", clean_email)
        return True

    failed_attempts += 1
    cache.set(attempts_key, failed_attempts, timeout=OTP_TTL_SECONDS)
    if failed_attempts >= MAX_OTP_ATTEMPTS:
        cache.delete(cache_key)
        _GLOBAL_OTP_STORE.pop(clean_email, None)
        logger.warning("MFA OTP locked for %s after %d failed attempts", clean_email, MAX_OTP_ATTEMPTS)

    return False
