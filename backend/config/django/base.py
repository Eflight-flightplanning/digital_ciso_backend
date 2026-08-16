from datetime import timedelta

from config.custom_logging import LOGGING  # noqa
from config.env import BASE_DIR, env  # noqa
from config.settings.celery import *  # noqa
from config.settings.eventstream import *  # noqa
from config.settings.partitions import *  # noqa
from config.settings.sentry import *  # noqa

SECRET_KEY = env("SECRET_KEY", default="prowler_secret_key_32_bytes_long_12345_67890")
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY", default="")
ANTHROPIC_MODEL = env("ANTHROPIC_MODEL", default="claude-sonnet-4-6")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
TESTING = env.bool("TESTING", default=False)
DJANGO_DELETION_BATCH_SIZE = env.int("DJANGO_DELETION_BATCH_SIZE", default=5000)
DJANGO_FINDINGS_BATCH_SIZE = env.int("DJANGO_FINDINGS_BATCH_SIZE", default=5000)
DJANGO_TMP_OUTPUT_DIRECTORY = env.str("DJANGO_TMP_OUTPUT_DIRECTORY", default="/tmp/prowler_api_output")
FINDINGS_MAX_DAYS_IN_RANGE = env.int("FINDINGS_MAX_DAYS_IN_RANGE", default=30)
ATTACK_PATHS_SINK_DATABASE = env.str("ATTACK_PATHS_SINK_DATABASE", default="neo4j")
ATTACK_PATHS_SCAN_INACTIVITY_THRESHOLD_MINUTES = env.int("ATTACK_PATHS_SCAN_INACTIVITY_THRESHOLD_MINUTES", default=30)
ATTACK_PATHS_SCAN_STALE_THRESHOLD_MINUTES = env.int("ATTACK_PATHS_SCAN_STALE_THRESHOLD_MINUTES", default=60)
CACHE_MAX_AGE = env.int("CACHE_MAX_AGE", default=300)
CACHE_STALE_WHILE_REVALIDATE = env.int("CACHE_STALE_WHILE_REVALIDATE", default=60)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

SECRETS_ENCRYPTION_KEY = env(
    "SECRETS_ENCRYPTION_KEY",
    default="ZMiYVo7m4Fbe2eXXPyrwxdJss2WSalXSv3xHBcJkPl0=",
)
FERNET_SECRET = SECRETS_ENCRYPTION_KEY

DRF_SIMPLE_API_KEY = {
    "HEADER_KEY": "HTTP_X_API_KEY",
    "FERNET_SECRET": SECRETS_ENCRYPTION_KEY,
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
]

SITE_ID = 1

CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOWED_ORIGINS = env.list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    default=["http://localhost", "http://127.0.0.1"],
)

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
    "PAGE_SIZE": 10,
    "EXCEPTION_HANDLER": "api.exceptions.custom_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "drf_spectacular_jsonapi.schemas.pagination.JsonApiPageNumberPagination",
    "DEFAULT_PARSER_CLASSES": (
        "rest_framework_json_api.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ),
    "DEFAULT_RENDERER_CLASSES": ("api.renderers.APIJSONRenderer",),
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
        "token-obtain": env("DJANGO_THROTTLE_TOKEN_OBTAIN", default="50/minute"),
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
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
}

JSON_API_FORMAT_KEYS = "dasherize"
JSON_API_PLURALIZE_TYPES = True

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
]

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
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
