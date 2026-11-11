import json
import logging
import os
import urllib.request
import urllib.error
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


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
    return api_key.strip('"\' '), from_email.strip('"\' ')


def send_welcome_user_email(to_email: str, name: str, password: str, request=None) -> bool:
    """
    Send first-time account creation welcome email via SendGrid.
    Uses simple, clean plain text with no fancy colors or bloated HTML.
    """
    api_key, from_email = get_sendgrid_config()

    if not api_key:
        logger.warning("SENDGRID_API_KEY not configured. Welcome email not sent to %s", to_email)
        return False

    # Derive portal URL dynamically
    sign_in_url = os.environ.get("FRONTEND_SIGNIN_URL", "")
    if not sign_in_url and request:
        origin = request.headers.get("Origin") or request.headers.get("Referer")
        if origin:
            parsed = urlparse(origin)
            sign_in_url = f"{parsed.scheme}://{parsed.netloc}/sign-in"
    if not sign_in_url:
        sign_in_url = "http://localhost:8080/sign-in"

    user_name = (name or "").strip() or to_email.split("@")[0]

    plain_text = f"""Hello {user_name},

Your Digital CISO platform account has been created.

Below are your login credentials and initial setup instructions:

Portal URL: {sign_in_url}
Username (Email): {to_email}
Password: {password}

First-Time Login Instructions:
1. Visit the portal URL above and sign in using your username and password.
2. You will be prompted to create your new password.
3. Scan the QR code using Google Authenticator or Microsoft Authenticator to configure Two-Factor Authentication (2FA).

For security reasons, do not share this password with anyone.

Best regards,
Digital CISO Security
"""

    url = "https://api.sendgrid.com/v3/mail/send"
    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {
            "email": from_email,
            "name": "Digital CISO Security"
        },
        "subject": "Welcome to Digital CISO - Account Credentials & Setup Instructions",
        "content": [
            {
                "type": "text/plain",
                "value": plain_text
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
                logger.info("Welcome email sent successfully to %s via SendGrid", to_email)
                return True
            else:
                logger.warning("SendGrid API returned status %s for welcome email to %s", resp.status, to_email)
                return False
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        logger.error("SendGrid HTTPError %s for welcome email to %s: %s", e.code, to_email, err_body)
        return False
    except Exception as e:
        logger.error("Failed to send welcome email to %s via SendGrid: %s", to_email, e)
        return False
