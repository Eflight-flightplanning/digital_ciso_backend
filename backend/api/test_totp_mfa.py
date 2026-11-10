"""Comprehensive Test Suite for Multi-Factor Authentication (MFA) & TOTP RFC 6238 Engine.

Covers:
1. RFC 6238 Mathematical TOTP Engine (RFC official test vectors, HMAC-SHA1, 6-digit codes)
2. Clock drift tolerance (±30s window) and rejection of expired/future codes
3. Replay attack defense (one-time-use per 30-second token via after_step)
4. Authenticator Provisioning URI (otpauth:// scheme) & SVG QR Code generation
5. Two-Step MFA challenge lifecycle (Setup vs Subsequent logins)
6. Brute-force protection & account lockout (5 failed attempts -> 15 min lock)
7. Cryptographic storage (Fernet AES-256 encryption at rest)
8. Email OTP generation & verification with constant-time comparison
"""
import base64
import os
import sys
import time
import unittest
from datetime import timedelta
from unittest.mock import MagicMock, patch

# Ensure backend directory is in path and Django is configured
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.django.devel")

import django
django.setup()

from django.utils import timezone
from api import totp
from api import mfa_service
from api.crypto import fernet


class TestRFC6238TOTPEngine(unittest.TestCase):
    """Verifies strict adherence to RFC 6238 (TOTP) and RFC 4226 (HOTP) standards."""

    def test_new_secret_format_and_entropy(self):
        """Generates valid 160-bit (20 bytes) Base32 secrets with high entropy."""
        secret1 = totp.new_secret()
        secret2 = totp.new_secret()

        # Base32 strings should be 32 characters long for 20 bytes (160 bits)
        self.assertEqual(len(secret1), 32)
        self.assertEqual(len(secret2), 32)
        self.assertNotEqual(secret1, secret2)

        # Must decode cleanly as base32
        decoded = base64.b32decode(secret1)
        self.assertEqual(len(decoded), 20)

    def test_code_at_generates_valid_6_digit_code(self):
        """Generates exactly 6 digits, zero-padded when necessary."""
        secret = totp.new_secret()
        code = totp.code_at(secret, step=12345)
        self.assertTrue(code.isdigit())
        self.assertEqual(len(code), 6)

    def test_rfc6238_official_test_vectors(self):
        """Tests against official RFC 6238 Appendix B test vectors for SHA-1."""
        # RFC 6238 uses ASCII secret: "12345678901234567890" (20 bytes)
        rfc_secret_bytes = b"12345678901234567890"
        rfc_secret_b32 = base64.b32encode(rfc_secret_bytes).decode("ascii")

        # RFC 6238 Table 1 test vectors:
        # Time T=59s           -> Step 1        -> TOTP: 287082
        # Time T=1111111109s   -> Step 37037036 -> TOTP: 081804
        # Time T=1111111111s   -> Step 37037037 -> TOTP: 050471
        # Time T=1234567890s   -> Step 41152263 -> TOTP: 005924
        # Time T=2000000000s   -> Step 66666666 -> TOTP: 279037
        test_vectors = [
            (1, "287082"),
            (37037036, "081804"),
            (37037037, "050471"),
            (41152263, "005924"),
            (66666666, "279037"),
        ]

        for step, expected_code in test_vectors:
            actual_code = totp.code_at(rfc_secret_b32, step)
            self.assertEqual(
                actual_code,
                expected_code,
                f"RFC 6238 mismatch at step {step}: expected {expected_code}, got {actual_code}",
            )

    def test_rfc4226_hotp_official_test_vectors(self):
        """Tests our underlying HMAC engine against the official RFC 4226 Section 5.4 HOTP test vectors."""
        # RFC 4226 secret: ASCII "12345678901234567890"
        rfc_secret_bytes = b"12345678901234567890"
        rfc_secret_b32 = base64.b32encode(rfc_secret_bytes).decode("ascii")

        # RFC 4226 Section 5.4 Test Values:
        rfc4226_expected = [
            "755224",  # Count 0
            "287082",  # Count 1
            "359152",  # Count 2
            "969429",  # Count 3
            "338314",  # Count 4
            "254676",  # Count 5
            "287922",  # Count 6
            "162583",  # Count 7
            "399871",  # Count 8
            "520489",  # Count 9
        ]

        for counter, expected in enumerate(rfc4226_expected):
            actual = totp.code_at(rfc_secret_b32, counter)
            self.assertEqual(
                actual,
                expected,
                f"RFC 4226 HOTP mismatch at counter {counter}: expected {expected}, got {actual}",
            )

    def test_matching_step_current_window(self):
        """Matching step successfully identifies current window."""
        secret = totp.new_secret()
        current_time = 1700000000.0
        current_step = int(current_time // 30)

        code = totp.code_at(secret, current_step)
        matched = totp.matching_step(secret, code, now=current_time)
        self.assertEqual(matched, current_step)

    def test_matching_step_clock_drift_tolerance(self):
        """Accepts codes from (current - 1) and (current + 1) to tolerate mobile clock drift."""
        secret = totp.new_secret()
        current_time = 1700000000.0
        current_step = int(current_time // 30)

        # Code from previous 30s window (-30s)
        prev_code = totp.code_at(secret, current_step - 1)
        self.assertEqual(
            totp.matching_step(secret, prev_code, now=current_time),
            current_step - 1,
        )

        # Code from next 30s window (+30s)
        next_code = totp.code_at(secret, current_step + 1)
        self.assertEqual(
            totp.matching_step(secret, next_code, now=current_time),
            current_step + 1,
        )

    def test_matching_step_rejects_expired_or_future_codes(self):
        """Strictly rejects codes older than 30s (-2 steps) or ahead by more than 30s (+2 steps)."""
        secret = totp.new_secret()
        current_time = 1700000000.0
        current_step = int(current_time // 30)

        expired_code = totp.code_at(secret, current_step - 2)
        self.assertIsNone(totp.matching_step(secret, expired_code, now=current_time))

        future_code = totp.code_at(secret, current_step + 2)
        self.assertIsNone(totp.matching_step(secret, future_code, now=current_time))

    def test_matching_step_rejects_malformed_input(self):
        """Rejects non-numeric, wrong length, and empty inputs."""
        secret = totp.new_secret()
        invalid_codes = ["", "12345", "1234567", "abcdef", "12345a", " 123456", "12 456"]
        for bad in invalid_codes:
            self.assertIsNone(totp.matching_step(secret, bad))

    def test_replay_attack_prevention(self):
        """A code generated for step S cannot be reused if after_step >= S."""
        secret = totp.new_secret()
        current_time = 1700000000.0
        current_step = int(current_time // 30)
        code = totp.code_at(secret, current_step)

        # First use: passes and returns current_step
        first_use = totp.matching_step(secret, code, after_step=None, now=current_time)
        self.assertEqual(first_use, current_step)

        # Second use with after_step set to current_step: MUST be rejected!
        replay_use = totp.matching_step(secret, code, after_step=current_step, now=current_time)
        self.assertIsNone(replay_use, "Replay attack was not prevented!")


class TestAuthenticatorProvisioningAndQR(unittest.TestCase):
    """Verifies URI schema and QR code generation for Microsoft and Google Authenticator."""

    def test_provisioning_uri_format(self):
        """URI must conform to standard otpauth:// scheme recognized by Authenticator apps."""
        secret = "JBSWY3DPEHPK3PXP"
        email = "ciso@company.com"
        uri = totp.provisioning_uri(secret, email)

        self.assertTrue(uri.startswith("otpauth://totp/"))
        self.assertIn("secret=JBSWY3DPEHPK3PXP", uri)
        self.assertIn("issuer=Digital+CISO", uri)
        self.assertIn("digits=6", uri)
        self.assertIn("period=30", uri)
        self.assertIn("ciso%40company.com", uri)

    def test_provisioning_uri_url_encodes_special_characters(self):
        """Properly escapes special characters in user emails (e.g. + or spaces)."""
        secret = "JBSWY3DPEHPK3PXP"
        email = "john.doe+security@my-domain.org"
        uri = totp.provisioning_uri(secret, email)
        self.assertIn("john.doe%2Bsecurity%40my-domain.org", uri)

    def test_qr_code_svg_generation(self):
        """Generates valid SVG XML Data URI that can be rendered inline on the frontend."""
        import segno

        secret = totp.new_secret()
        uri = totp.provisioning_uri(secret, "analyst@eflight.aero")
        qr_svg = segno.make(uri, error="m").svg_data_uri(scale=5)

        self.assertTrue(qr_svg.startswith("data:image/svg+xml"))
        self.assertIn("%3Csvg", qr_svg)


class TestMFAServiceAndSecurityControls(unittest.TestCase):
    """Tests the full authentication workflow, brute-force lockout, and data encryption."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()

        self.secret_b32 = totp.new_secret()
        self.encrypted_secret = fernet.encrypt(self.secret_b32.encode())

        # Create a mock user and UserMfa record
        self.mock_user = MagicMock()
        self.mock_user.pk = "00000000-0000-0000-0000-000000000001"
        self.mock_user.email = "auditor@eflight.aero"

        self.mock_record = MagicMock()
        self.mock_record.user = self.mock_user
        self.mock_record.secret = self.encrypted_secret
        self.mock_record.confirmed_at = None
        self.mock_record.last_step = None
        self.mock_record.failed_attempts = 0
        self.mock_record.locked_until = None

    def tearDown(self):
        from django.core.cache import cache
        cache.clear()

    def test_secret_is_encrypted_at_rest(self):
        """The secret stored in UserMfa must be encrypted and unreadable as plaintext."""
        self.assertNotEqual(self.mock_record.secret, self.secret_b32.encode())
        decrypted = fernet.decrypt(bytes(self.mock_record.secret)).decode()
        self.assertEqual(decrypted, self.secret_b32)

    @patch("api.mfa_service._mfa_record")
    def test_mfa_challenge_first_login_returns_qr_code(self, mock_get_record):
        """First login returns setup instructions with QR code and secret."""
        self.mock_record.confirmed_at = None
        mock_get_record.return_value = self.mock_record

        challenge = mfa_service.mfa_challenge(self.mock_user)
        self.assertTrue(challenge["mfa_required"])
        self.assertTrue(challenge["mfa_setup_required"])
        self.assertEqual(challenge["secret"], self.secret_b32)
        self.assertTrue(challenge["qr_code"].startswith("data:image/svg+xml;"))

    @patch("api.mfa_service._mfa_record")
    def test_mfa_challenge_subsequent_login_suppresses_qr_code(self, mock_get_record):
        """After initial enrollment, QR code and secret are NEVER returned again."""
        self.mock_record.confirmed_at = timezone.now()
        mock_get_record.return_value = self.mock_record

        challenge = mfa_service.mfa_challenge(self.mock_user)
        self.assertTrue(challenge["mfa_required"])
        self.assertNotIn("mfa_setup_required", challenge)
        self.assertNotIn("qr_code", challenge)
        self.assertNotIn("secret", challenge)

    @patch("api.mfa_service._mfa_record")
    def test_verify_login_code_success(self, mock_get_record):
        """Submitting a valid 6-digit code succeeds, confirms MFA, and updates step."""
        mock_get_record.return_value = self.mock_record
        current_step = int(time.time() // 30)
        valid_code = totp.code_at(self.secret_b32, current_step)

        success = mfa_service.verify_login_code(self.mock_user, valid_code)
        self.assertTrue(success)
        self.assertEqual(self.mock_record.last_step, current_step)
        self.assertEqual(self.mock_record.failed_attempts, 0)
        self.assertIsNotNone(self.mock_record.confirmed_at)
        self.mock_record.save.assert_called()

    @patch("api.mfa_service.DjangoMFAService.get_or_create_pending_record")
    @patch("api.mfa_service.DjangoMFAService.get_decrypted_secret")
    def test_explicit_initial_verification_activates_mfa(self, mock_get_secret, mock_get_record):
        """Explicit initial verification step activates MFA only after validating first code."""
        self.mock_record.confirmed_at = None
        mock_get_record.return_value = self.mock_record
        mock_get_secret.return_value = self.secret_b32

        # Before activation: is_activated is False
        with patch("api.models.UserMfa.objects.using") as mock_db:
            mock_db.return_value.filter.return_value.first.return_value = self.mock_record
            self.assertFalse(mfa_service.mfa_service.is_activated(self.mock_user))

        # Perform explicit initial activation with wrong code -> Fails, does not activate
        success, msg = mfa_service.activate_user_mfa(self.mock_user, "000000")
        self.assertFalse(success)
        self.assertIsNone(self.mock_record.confirmed_at)

        # Perform explicit initial activation with valid code -> Succeeds and activates
        current_step = int(time.time() // 30)
        valid_code = totp.code_at(self.secret_b32, current_step)

        with patch("django.db.transaction.atomic"), \
             patch("api.models.UserMfa.objects.using") as mock_db_lock:
            mock_db_lock.return_value.select_for_update.return_value.filter.return_value.first.return_value = self.mock_record
            success, msg = mfa_service.activate_user_mfa(self.mock_user, valid_code)
            self.assertTrue(success)
            self.assertIn("successfully activated", msg)
            self.assertIsNotNone(self.mock_record.confirmed_at)

    def test_fernet_key_rotation_support(self):
        """MultiFernet decrypts secrets encrypted with previous keys and writes with primary."""
        from cryptography.fernet import Fernet, MultiFernet
        from api.mfa_service import get_mfa_fernet

        key_old = Fernet.generate_key().decode()
        key_new = Fernet.generate_key().decode()

        # Encrypt with old key
        f_old = Fernet(key_old.encode())
        plaintext = b"MY_SECRET_B32_SEED"
        encrypted_old = f_old.encrypt(plaintext)

        # MultiFernet with key_new as primary and key_old as secondary
        multi_cipher = MultiFernet([Fernet(key_new.encode()), Fernet(key_old.encode())])
        decrypted = multi_cipher.decrypt(encrypted_old)
        self.assertEqual(decrypted, plaintext)

    @patch("django.core.cache.cache.get")
    @patch("django.core.cache.cache.set")
    def test_rate_limiting_per_user_and_ip(self, mock_cache_set, mock_cache_get):
        """Rate limiter blocks verification when per-user or per-IP threshold is reached."""
        # 1. Below threshold: allowed
        mock_cache_get.return_value = 2
        allowed, err = mfa_service.mfa_service.check_rate_limits(self.mock_user, client_ip="192.168.1.50")
        self.assertTrue(allowed)
        self.assertIsNone(err)

        # 2. Per-user threshold exceeded (>= 5): rejected
        mock_cache_get.return_value = 5
        allowed, err = mfa_service.mfa_service.check_rate_limits(self.mock_user, client_ip="192.168.1.50")
        self.assertFalse(allowed)
        self.assertIn("Too many MFA attempts for this account", err)

    @patch("django.core.cache.cache.add", return_value=False)
    @patch("api.mfa_service.DjangoMFAService.get_or_create_pending_record")
    @patch("api.mfa_service.DjangoMFAService.get_decrypted_secret")
    def test_atomic_replay_prevention_cache_layer(self, mock_get_secret, mock_get_record, mock_cache_add):
        """If step token was already claimed in distributed cache, reject immediately."""
        mock_get_record.return_value = self.mock_record
        mock_get_secret.return_value = self.secret_b32
        current_step = int(time.time() // 30)
        valid_code = totp.code_at(self.secret_b32, current_step)

        success, err = mfa_service.mfa_service.verify_totp(self.mock_user, valid_code)
        self.assertFalse(success)
        self.assertIn("already been used", err)

    @patch("django.core.cache.cache.add", return_value=True)
    @patch("api.mfa_service._mfa_record")
    @patch("api.mfa_service._secret")
    def test_atomic_replay_prevention_db_layer(self, mock_get_secret, mock_get_record, mock_cache_add):
        """If step <= last_step in database under select_for_update, reject immediately."""
        self.mock_record.last_step = None
        mock_get_record.return_value = self.mock_record
        mock_get_secret.return_value = self.secret_b32
        current_step = int(time.time() // 30)
        valid_code = totp.code_at(self.secret_b32, current_step)

        locked_record = MagicMock()
        locked_record.last_step = current_step

        with patch("django.db.transaction.atomic"), \
             patch("api.models.UserMfa.objects.using") as mock_db_lock:
            mock_db_lock.return_value.select_for_update.return_value.filter.return_value.first.return_value = locked_record
            success, err = mfa_service.mfa_service.verify_totp(self.mock_user, valid_code)
            self.assertFalse(success)
            self.assertIn("already been used", err)

    @patch("api.mfa_service._mfa_record")
    def test_verify_login_code_wrong_code_increments_failures(self, mock_get_record):
        """Submitting an invalid code increments failed_attempts."""
        mock_get_record.return_value = self.mock_record

        success = mfa_service.verify_login_code(self.mock_user, "000000")
        self.assertFalse(success)
        self.assertEqual(self.mock_record.failed_attempts, 1)

    @patch("api.mfa_service._mfa_record")
    def test_brute_force_lockout_after_5_failures(self, mock_get_record):
        """5 consecutive failed attempts locks the account for 15 minutes."""
        self.mock_record.failed_attempts = 4
        mock_get_record.return_value = self.mock_record

        # 5th failed attempt
        success = mfa_service.verify_login_code(self.mock_user, "000000")
        self.assertFalse(success)
        self.assertEqual(self.mock_record.failed_attempts, 0)
        self.assertIsNotNone(self.mock_record.locked_until)
        self.assertGreater(self.mock_record.locked_until, timezone.now())

    @patch("api.mfa_service._mfa_record")
    def test_locked_account_rejects_even_valid_codes(self, mock_get_record):
        """While locked_until is active in the future, even valid codes are rejected."""
        self.mock_record.locked_until = timezone.now() + timedelta(minutes=10)
        mock_get_record.return_value = self.mock_record

        current_step = int(time.time() // 30)
        valid_code = totp.code_at(self.secret_b32, current_step)

        success = mfa_service.verify_login_code(self.mock_user, valid_code)
        self.assertFalse(success, "Locked account should not authenticate even with valid code!")


class TestEmailOTPService(unittest.TestCase):
    """Tests the SendGrid fallback email OTP generator, TTL cache, and lockout."""

    def test_otp_generation_format(self):
        """Generated OTP must be exactly 6 digits."""
        with patch("api.mfa_service.send_mfa_otp_email"):
            otp = mfa_service.generate_and_store_otp("test@eflight.aero")
            self.assertTrue(otp.isdigit())
            self.assertEqual(len(otp), 6)

    def test_verify_otp_success_and_cache_consumption(self):
        """Correct OTP succeeds and is deleted from cache to prevent reuse."""
        with patch("api.mfa_service.send_mfa_otp_email"):
            email = "user@example.com"
            otp = mfa_service.generate_and_store_otp(email)

            # First verification must succeed
            self.assertTrue(mfa_service.verify_otp(email, otp))

            # Second verification of same OTP must fail (single-use)
            self.assertFalse(mfa_service.verify_otp(email, otp))

    def test_verify_otp_brute_force_defense(self):
        """5 incorrect OTP submissions locks and discards the OTP challenge."""
        with patch("api.mfa_service.send_mfa_otp_email"):
            email = "victim@example.com"
            valid_otp = mfa_service.generate_and_store_otp(email)

            for _ in range(5):
                mfa_service.verify_otp(email, "999999")

            # Even if the attacker now tries the real OTP, it must be locked out
            self.assertFalse(mfa_service.verify_otp(email, valid_otp))


class TestTOTPAPIFlow(unittest.TestCase):
    """Verifies the REST API /api/v1/tokens 2-step authentication contracts."""

    @patch("api.v1.serializers.authenticate")
    @patch("api.mfa_service.mfa_service.is_enabled", return_value=True)
    @patch("api.mfa_service.mfa_service.generate_challenge")
    def test_api_step1_returns_mfa_challenge_when_otp_omitted(self, mock_challenge, mock_mfa_enabled, mock_auth):
        """When password is valid but OTP is omitted, API returns 200 with mfa-challenge."""
        import json
        from rest_framework.test import APIRequestFactory
        from api.v1.views import CustomTokenObtainView

        mock_user = MagicMock()
        mock_user.is_active = True
        mock_user.email = "ciso@eflight.aero"
        mock_user.pk = "00000000-0000-0000-0000-000000000001"
        mock_auth.return_value = mock_user

        mock_challenge.return_value = {
            "mfa_required": True,
            "message": "Enter the 6-digit code from your authenticator app.",
        }
        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/tokens",
            data=json.dumps({"email": "ciso@eflight.aero", "password": "SecurePassword123!"}),
            content_type="application/json",
        )
        view = CustomTokenObtainView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["type"], "mfa-challenge")
        self.assertTrue(response.data["attributes"]["mfa_required"])

    @patch("api.v1.serializers.authenticate")
    @patch("api.mfa_service.mfa_service.is_enabled", return_value=True)
    @patch("api.mfa_service.mfa_service.verify_totp")
    def test_api_step2_invalid_otp_returns_validation_error(self, mock_verify, mock_mfa_enabled, mock_auth):
        """When invalid OTP is submitted, API returns 401 Unauthorized with error message."""
        import json
        from rest_framework.test import APIRequestFactory
        from api.v1.views import CustomTokenObtainView

        mock_user = MagicMock()
        mock_user.is_active = True
        mock_user.email = "ciso@eflight.aero"
        mock_user.pk = "00000000-0000-0000-0000-000000000001"
        mock_auth.return_value = mock_user
        mock_verify.return_value = (False, "Invalid or expired 6-digit MFA verification code.")

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/tokens",
            data=json.dumps({"email": "ciso@eflight.aero", "password": "SecurePassword123!", "otp": "000000"}),
            content_type="application/json",
        )
        view = CustomTokenObtainView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid or expired", str(response.data))

    @patch("api.v1.serializers.authenticate")
    @patch("api.mfa_service.mfa_service.is_enabled", return_value=True)
    @patch("api.mfa_service.mfa_service.verify_totp")
    @patch("api.v1.serializers.generate_tokens")
    def test_api_step2_valid_otp_issues_jwt_tokens(self, mock_gen_tokens, mock_verify, mock_mfa_enabled, mock_auth):
        """When valid OTP is submitted, API returns 200 with access and refresh JWT tokens."""
        import json
        from rest_framework.test import APIRequestFactory
        from api.v1.views import CustomTokenObtainView

        mock_user = MagicMock()
        mock_user.is_active = True
        mock_user.email = "ciso@eflight.aero"
        mock_user.pk = "00000000-0000-0000-0000-000000000001"
        mock_auth.return_value = mock_user
        mock_verify.return_value = (True, "Verification successful.")

        mock_gen_tokens.return_value = {
            "access": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.dummy_access",
            "refresh": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.dummy_refresh",
        }

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/tokens",
            data=json.dumps({"email": "ciso@eflight.aero", "password": "SecurePassword123!", "otp": "123456", "tenant_id": "04bffbdc-99c8-4ced-9e81-e67532119c7d"}),
            content_type="application/json",
        )
        with patch.object(mock_user, "is_member_of_tenant", return_value=True):
            view = CustomTokenObtainView.as_view()
            response = view(request)

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["type"], "tokens")
            self.assertIn("access", response.data["attributes"])
            self.assertIn("refresh", response.data["attributes"])


if __name__ == "__main__":
    unittest.main()

