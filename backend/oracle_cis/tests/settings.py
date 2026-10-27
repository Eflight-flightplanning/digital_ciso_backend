"""Minimal Django settings so the oracle_cis tests run on in-memory SQLite without PostgreSQL / the full platform.
Run:  python -m django test oracle_cis --settings=oracle_cis.tests.settings
"""
SECRET_KEY = "oracle-cis-tests"
DEBUG = False
USE_TZ = True
ALLOWED_HOSTS = ["*"]
INSTALLED_APPS = ["django.contrib.contenttypes", "django.contrib.auth", "rest_framework", "oracle_cis"]
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
ROOT_URLCONF = "oracle_cis.tests.urls"
MIDDLEWARE = []
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "UNAUTHENTICATED_USER": None,
}
