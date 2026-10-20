"""Minimal Django settings so the nca app's tests run on in-memory SQLite without PostgreSQL / the full platform.
Run:  python -m django test nca --settings=nca.tests.settings
"""
SECRET_KEY = "nca-tests"
DEBUG = False
USE_TZ = True
ALLOWED_HOSTS = ["*"]
INSTALLED_APPS = ["django.contrib.contenttypes", "django.contrib.auth", "rest_framework", "nca"]
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
ROOT_URLCONF = "nca.tests.urls"
MIDDLEWARE = []
BASE_DIR = __import__("tempfile").mkdtemp(prefix="nca-test-")
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "UNAUTHENTICATED_USER": None,
}
