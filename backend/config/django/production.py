from config.django.base import *  # noqa
from config.env import env

DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = env.list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    default=[
        "https://demo-digitalciso.centralindia.cloudapp.azure.com",
        "http://demo-digitalciso.centralindia.cloudapp.azure.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
)

# Database
default_db_name = env("POSTGRES_DB", default="digital_ciso_django")
default_db_user = env("POSTGRES_USER", default="postgres")
default_db_password = env("POSTGRES_PASSWORD", default="postgres")
default_db_host = env("POSTGRES_HOST", default="localhost")
default_db_port = env("POSTGRES_PORT", default="5432")
postgres_sslmode = env.str("POSTGRES_SSLMODE", default="")
db_options = {"sslmode": postgres_sslmode} if postgres_sslmode else {}

DATABASES = {
    "prowler_user": {
        "ENGINE": "psqlextra.backend",
        "NAME": default_db_name,
        "USER": default_db_user,
        "PASSWORD": default_db_password,
        "HOST": default_db_host,
        "PORT": default_db_port,
        "OPTIONS": db_options,
    },
    "admin": {
        "ENGINE": "psqlextra.backend",
        "NAME": default_db_name,
        "USER": env("POSTGRES_ADMIN_USER", default=default_db_user),
        "PASSWORD": env("POSTGRES_ADMIN_PASSWORD", default=default_db_password),
        "HOST": default_db_host,
        "PORT": default_db_port,
        "OPTIONS": db_options,
    },
    "replica": {
        "ENGINE": "psqlextra.backend",
        "NAME": env("POSTGRES_REPLICA_DB", default=default_db_name),
        "USER": env("POSTGRES_REPLICA_USER", default=default_db_user),
        "PASSWORD": env("POSTGRES_REPLICA_PASSWORD", default=default_db_password),
        "HOST": env("POSTGRES_REPLICA_HOST", default=default_db_host),
        "PORT": env("POSTGRES_REPLICA_PORT", default=default_db_port),
        "OPTIONS": db_options,
    },
    "admin_replica": {
        "ENGINE": "psqlextra.backend",
        "NAME": env("POSTGRES_REPLICA_DB", default=default_db_name),
        "USER": env("POSTGRES_ADMIN_USER", default=default_db_user),
        "PASSWORD": env("POSTGRES_ADMIN_PASSWORD", default=default_db_password),
        "HOST": env("POSTGRES_REPLICA_HOST", default=default_db_host),
        "PORT": env("POSTGRES_REPLICA_PORT", default=default_db_port),
        "OPTIONS": db_options,
    },
    "neo4j": {
        "HOST": env.str("NEO4J_HOST", default="localhost"),
        "PORT": env.str("NEO4J_PORT", default="7687"),
        "USER": env.str("NEO4J_USER", default="neo4j"),
        "PASSWORD": env.str("NEO4J_PASSWORD", default="neo4j_password"),
    },
    "neptune": {
        "WRITER_ENDPOINT": env.str("NEPTUNE_WRITER_ENDPOINT", default=""),
        "READER_ENDPOINT": env.str("NEPTUNE_READER_ENDPOINT", default=""),
        "PORT": env.str("NEPTUNE_PORT", default="8182"),
        "REGION": env.str("AWS_REGION", default=""),
    },
}

DATABASES["default"] = DATABASES["prowler_user"]

label_postgres_connections(DATABASES)  # noqa: F405

DATABASE_ROUTERS = ["api.db_router.MainRouter"]

REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = tuple(  # noqa: F405
    render_class
    for render_class in REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"]  # noqa: F405
) + ("rest_framework_json_api.renderers.BrowsableAPIRenderer",)

REST_FRAMEWORK["DEFAULT_FILTER_BACKENDS"] = tuple(  # noqa: F405
    filter_backend
    for filter_backend in REST_FRAMEWORK["DEFAULT_FILTER_BACKENDS"]  # noqa: F405
    if "DjangoFilterBackend" not in filter_backend
) + ("api.filters.CustomDjangoFilterBackend",)

SECRETS_ENCRYPTION_KEY = env.str(
    "SECRETS_ENCRYPTION_KEY", default="ZMiYVo7m4Fbe2eXXPyrwxdJss2WSalXSv3xHBcJkPl0="
)
FERNET_SECRET = SECRETS_ENCRYPTION_KEY
DRF_SIMPLE_API_KEY = {
    "HEADER_KEY": "HTTP_X_API_KEY",
    "FERNET_SECRET": SECRETS_ENCRYPTION_KEY,
}
