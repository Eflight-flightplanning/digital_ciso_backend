"""Symmetric encryption for secrets stored at rest (provider credentials,
integration credentials, Lighthouse API keys).

Rotation without downtime: put the NEW key in ``SECRETS_ENCRYPTION_KEY`` and the
old key(s) in ``SECRETS_ENCRYPTION_KEY_PREVIOUS`` (comma separated). New writes use
the primary key; reads try every key. Then run
``python manage.py rotate_secrets_key`` to re-encrypt existing rows and finally
drop the old key from ``SECRETS_ENCRYPTION_KEY_PREVIOUS``.
"""
from cryptography.fernet import Fernet, MultiFernet
from django.conf import settings


def _build() -> MultiFernet:
    keys = [settings.SECRETS_ENCRYPTION_KEY, *getattr(settings, "SECRETS_ENCRYPTION_KEY_PREVIOUS", [])]
    return MultiFernet([Fernet(k.encode() if isinstance(k, str) else k) for k in keys])


def primary_fernet() -> Fernet:
    return Fernet(settings.SECRETS_ENCRYPTION_KEY.encode())


fernet = _build()
