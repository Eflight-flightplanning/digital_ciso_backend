from datetime import timedelta

from config.custom_logging import LOGGING  # noqa
from config.env import BASE_DIR, env  # noqa
from config.settings.celery import *  # noqa
from config.settings.eventstream import *  # noqa
from config.settings.partitions import *  # noqa
from config.settings.sentry import *  # noqa

import os  # noqa: E402
import sys  # noqa: E402

from django.core.exceptions import ImproperlyConfigured  # noqa: E402

_DEV_SETTINGS = os.environ.get("DJANGO_SETTINGS_MODULE", "").endswith(".devel") and env.bool(
    "DJANGO_DEBUG", default=True
)
_INSECURE_DEV_KEY = "insecure-dev-only-key-do-not-use-in-production-0123456789"
# DJANGO_SECRET_KEY is what DEPLOYMENT.md documents; SECRET_KEY kept for compatibility.
SECRET_KEY = env("DJANGO_SECRET_KEY", default=None) or env("SECRET_KEY", default=None)
if not SECRET_KEY:
    if _DEV_SETTINGS or env.bool("DJANGO_DEBUG", default=False) or env.bool("TESTING", default=False):
        SECRET_KEY = _INSECURE_DEV_KEY
    else:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY is not set. Refusing to start with a guessable "
            "signing key (it signs every JWT)."
        )
VLLM_AZURE_ENDPOINT = env("VLLM_AZURE_ENDPOINT", default="http://10.0.0.4:8000/v1")
VLLM_AZURE_MODEL = env("VLLM_AZURE_MODEL", default="/home/azureuser/models/qwen3.5-9b")
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY", default="")
ANTHROPIC_MODEL = env("ANTHROPIC_MODEL", default="qwen3.5-9b")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
TESTING = env.bool("TESTING", default=False)
DJANGO_DELETION_BATCH_SIZE = env.int("DJANGO_DELETION_BATCH_SIZE", default=5000)
DJANGO_FINDINGS_BATCH_SIZE = env.int("DJANGO_FINDINGS_BATCH_SIZE", default=5000)
DJANGO_TMP_OUTPUT_DIRECTORY = env.str("DJANGO_TMP_OUTPUT_DIRECTORY", default="/tmp/prowler_api_output")
FINDINGS_MAX_DAYS_IN_RANGE = env.int("FINDINGS_MAX_DAYS_IN_RANGE", default=365)
ATTACK_PATHS_SINK_DATABASE = env.str("ATTACK_PATHS_SINK_DATABASE", default="neo4j")
ATTACK_PATHS_SCAN_INACTIVITY_THRESHOLD_MINUTES = env.int("ATTACK_PATHS_SCAN_INACTIVITY_THRESHOLD_MINUTES", default=30)
ATTACK_PATHS_SCAN_STALE_THRESHOLD_MINUTES = env.int("ATTACK_PATHS_SCAN_STALE_THRESHOLD_MINUTES", default=60)
CACHE_MAX_AGE = env.int("CACHE_MAX_AGE", default=300)
CACHE_STALE_WHILE_REVALIDATE = env.int("CACHE_STALE_WHILE_REVALIDATE", default=60)
ALLOWED_HOSTS = env.list(
    "DJANGO_ALLOWED_HOSTS",
    default=["demo-digitalciso.centralindia.cloudapp.azure.com", "localhost", "127.0.0.1"],
)
CSRF_TRUSTED_ORIGINS = env.list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    default=[
        "https://demo-digitalciso.centralindia.cloudapp.azure.com",
        "http://demo-digitalciso.centralindia.cloudapp.azure.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

# Key that encrypts provider/integration credentials stored in the database.
# No built-in default: a key committed to source protects nothing.
_DEV_ENCRYPTION_KEY = "kXq0m1z8vN3bR5tY7uW9aC2eG4iK6oQ8sU0wY2aB4cE="  # dev/test only
SECRETS_ENCRYPTION_KEY = env("SECRETS_ENCRYPTION_KEY", default=None)
if not SECRETS_ENCRYPTION_KEY:
    if _DEV_SETTINGS or env.bool("TESTING", default=False):
        SECRETS_ENCRYPTION_KEY = _DEV_ENCRYPTION_KEY
    else:
        raise ImproperlyConfigured(
            "SECRETS_ENCRYPTION_KEY is not set. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
# Old key(s) still accepted for decryption while rotating (see api/crypto.py).
SECRETS_ENCRYPTION_KEY_PREVIOUS = [
    k.strip() for k in env.list("SECRETS_ENCRYPTION_KEY_PREVIOUS", default=[]) if k.strip()
]
FERNET_SECRET = SECRETS_ENCRYPTION_KEY

# Signs/encrypts tenant API keys. Kept separate so that rotating the data key does
# not invalidate every issued API key. Defaults to the data key for compatibility;
# set it explicitly (to the OLD value) when you rotate SECRETS_ENCRYPTION_KEY.
API_KEY_FERNET_SECRET = env("API_KEY_FERNET_SECRET", default=SECRETS_ENCRYPTION_KEY)
DRF_SIMPLE_API_KEY = {
    "HEADER_KEY": "HTTP_X_API_KEY",
    "FERNET_SECRET": API_KEY_FERNET_SECRET,
}

AUTH_USER_MODEL = "api.User"

# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "psqlextra",
    "api",
    "nca",
    "oracle_cis",
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
    "drf_spectacular_jsonapi",
    "django_guid",
    "rest_framework_json_api",
    "django_celery_results",
    "django_celery_beat",
    "rest_framework_simplejwt.token_blacklist",

    "rest_framework.authtoken",
    "drf_simple_apikey",
    "django_eventstream",
]

MIDDLEWARE = [
    "api.middleware.CloseDBConnectionsMiddleware",
    "django_guid.middleware.guid_middleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "api.middleware.APILoggingMiddleware",
    "api.middleware.AdminIPAllowlistMiddleware",
    "api.middleware.ApiSecurityHeadersMiddleware",
]

SITE_ID = 1

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = env.list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    default=[
        "https://demo-digitalciso.centralindia.cloudapp.azure.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://localhost:8080",
    ],
)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"]
CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "x-api-key",
    "x-csrftoken",
    "x-requested-with",
]

# Browser security headers / cookies
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
_HARDEN = not env.bool("DJANGO_DEBUG", default=False) and not _DEV_SETTINGS
SESSION_COOKIE_SECURE = env.bool("DJANGO_COOKIE_SECURE", default=_HARDEN)
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SECURE_HSTS_SECONDS = env.int("DJANGO_HSTS_SECONDS", default=86400 if _HARDEN else 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_SSL_REDIRECT = env.bool("DJANGO_SSL_REDIRECT", default=False)
SECURE_REDIRECT_EXEMPT = [r"^health/"]

# Sign-up controls: ``DJANGO_SIGNUP_ENABLED=False`` closes self-registration;
# ``DJANGO_SIGNUP_ALLOWED_DOMAINS=corp.com,other.com`` restricts it by email domain.
SIGNUP_ENABLED = env.bool("DJANGO_SIGNUP_ENABLED", default=True)
SIGNUP_ALLOWED_DOMAINS = [
    d.strip().lower() for d in env.list("DJANGO_SIGNUP_ALLOWED_DOMAINS", default=[]) if d.strip()
]
# Optional Django-admin lockdown (comma-separated IPs/CIDRs) and path.
ADMIN_ALLOWED_IPS = env.list("DJANGO_ADMIN_ALLOWED_IPS", default=[])
ADMIN_URL_PATH = env.str("DJANGO_ADMIN_PATH", default="admin/").lstrip("/")

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular_jsonapi.schemas.openapi.JsonApiAutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "api.authentication.CombinedJWTOrAPIKeyAuthentication",
    ),
    # Default-deny: any view that forgets permission_classes requires login.
    # Public endpoints (token obtain/refresh, sign-up, health) opt out explicitly.
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "PAGE_SIZE": 10,
    "EXCEPTION_HANDLER": "api.exceptions.custom_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "drf_spectacular_jsonapi.schemas.pagination.JsonApiPageNumberPagination",
    "DEFAULT_PARSER_CLASSES": (
        "rest_framework_json_api.parsers.JSONParser",
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ),
    "DEFAULT_RENDERER_CLASSES": (
        "api.renderers.APIJSONRenderer",
        "rest_framework.renderers.JSONRenderer",
    ),
    "DEFAULT_METADATA_CLASS": "rest_framework_json_api.metadata.JSONAPIMetadata",
    "DEFAULT_FILTER_BACKENDS": (
        "rest_framework_json_api.filters.QueryParameterValidationFilter",
        "rest_framework_json_api.filters.OrderingFilter",
        "rest_framework_json_api.django_filters.backends.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
    ),
    "SEARCH_PARAM": "filter[search]",
    "TEST_REQUEST_RENDERER_CLASSES": (
        "rest_framework_json_api.renderers.JSONRenderer",
    ),
    # Throttle classes / rates for all ScopedRateThrottle users.
    # Every scope referenced via ``throttle_scope`` in a view MUST have a
    # corresponding entry here or DRF raises ImproperlyConfigured (HTTP 500).
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Health probes are called every 10 s by Docker; 600/minute gives
        # ample headroom while still capping single-source floods.
        "health-live": env("DJANGO_THROTTLE_HEALTH_LIVE", default="600/minute"),
        "health-ready": env("DJANGO_THROTTLE_HEALTH_READY", default="600/minute"),
        # Token-obtain endpoint. Configurable via env var (default: 50/minute).
        "token-obtain": env("DJANGO_THROTTLE_TOKEN_OBTAIN", default="10/minute"),
        "token-refresh": env("DJANGO_THROTTLE_TOKEN_REFRESH", default="60/minute"),
        "user-signup": env("DJANGO_THROTTLE_SIGNUP", default="5/hour"),
        "ai": env("DJANGO_THROTTLE_AI", default="60/minute"),
        "ai-proxy": env("DJANGO_THROTTLE_AI_PROXY", default="20/minute"),
        # Custom Attack Paths query endpoint (expensive graph operation).
        "attack-paths-custom-query": env(
            "DJANGO_THROTTLE_ATTACK_PATHS_CUSTOM_QUERY", default="10/minute"
        ),
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Prowler API",
    "DESCRIPTION": "Open Source Security Platform",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SERVE_PERMISSIONS": ["rest_framework.permissions.IsAdminUser"],
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
}

JSON_API_FORMAT_KEYS = "dasherize"
JSON_API_PLURALIZE_TYPES = True

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
]

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("DJANGO_ACCESS_TOKEN_MINUTES", default=30)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env.int("DJANGO_REFRESH_TOKEN_DAYS", default=7)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "VERIFYING_KEY": None,
    "AUDIENCE": None,
    "ISSUER": None,
    "JWK_URL": None,
    "LEEWAY": 0,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "sub",
    "USER_AUTHENTICATION_RULE": "rest_framework_simplejwt.authentication.default_user_authentication_rule",
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
    "TOKEN_TYPE_CLAIM": "token_type",
    "JTI_CLAIM": "jti",
    "SLIDING_TOKEN_REFRESH_EXP_CLAIM": "refresh_exp",
    "SLIDING_TOKEN_LIFETIME": timedelta(minutes=5),
    "SLIDING_TOKEN_REFRESH_LIFETIME": timedelta(days=1),
    "TOKEN_OBTAIN_SERIALIZER": "api.v1.serializers.TokenSerializer",
    "TOKEN_REFRESH_SERIALIZER": "api.v1.serializers.TokenRefreshSerializer",
}

REST_AUTH = {
    "USE_JWT": True,
    "JWT_AUTH_HTTPONLY": False,
    "JWT_AUTH_COOKIE": None,
    "JWT_AUTH_REFRESH_COOKIE": None,
}

ACCOUNT_AUTHENTICATION_METHOD = "email"
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_EMAIL_VERIFICATION = "none"


def label_postgres_connections(databases: dict) -> None:
    """
    Sets application_name in OPTIONS for all PostgreSQL databases to identify
    connection component in pg_stat_activity.
    """
    import os

    component = os.getenv("DJANGO_APP_COMPONENT", "api")
    for alias, db in databases.items():
        engine = db.get("ENGINE", "")
        if "postgres" in engine or "psqlextra" in engine:
            options = db.setdefault("OPTIONS", {})
            app_name = f"{component}:{alias}"[:63]
            options["application_name"] = app_name


STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
