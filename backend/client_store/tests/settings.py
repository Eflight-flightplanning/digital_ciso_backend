"""Minimal settings so these tests run on in-memory SQLite, without PostgreSQL or Azure.
Run:  python -m django test client_store --settings=client_store.tests.settings
"""
import tempfile

SECRET_KEY = "client-store-tests"
CLIENT_FILES_DIR = tempfile.mkdtemp(prefix="client-store-tests-")
DEBUG = False
USE_TZ = True
ALLOWED_HOSTS = ["*"]
INSTALLED_APPS = ["django.contrib.contenttypes", "django.contrib.auth", "rest_framework", "client_store"]
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
ROOT_URLCONF = "client_store.tests.urls"
MIDDLEWARE = []
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "UNAUTHENTICATED_USER": None,
}
