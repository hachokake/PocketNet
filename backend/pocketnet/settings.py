import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
FRONTEND_PUBLIC_DIR = PROJECT_ROOT / "frontend" / "public"

load_dotenv(PROJECT_ROOT / ".env", override=False)


def _environment_bool(name, default):
    value = os.environ.get(name)
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ImproperlyConfigured(f"{name} must be a boolean value.")


def _environment_list(name, default=""):
    value = os.environ.get(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


DEBUG = _environment_bool("DJANGO_DEBUG", True)
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY is required when DEBUG is disabled.")
    SECRET_KEY = "insecure-pocketnet-local-development-key"

_configured_hosts = os.environ.get("DJANGO_ALLOWED_HOSTS", "").strip()
if not DEBUG and not _configured_hosts:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS is required when DEBUG is disabled.")

ALLOWED_HOSTS = _environment_list(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,127.0.0.1,[::1]",
)
CSRF_TRUSTED_ORIGINS = _environment_list("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "pocketnet.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [PROJECT_ROOT / "frontend" / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [],
        },
    },
]

WSGI_APPLICATION = "pocketnet.wsgi.application"
ASGI_APPLICATION = "pocketnet.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": Path(
            os.environ.get("DJANGO_DATABASE_PATH", "").strip()
            or BASE_DIR / "db.sqlite3"
        ),
    }
}

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Europe/Paris"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = Path(
    os.environ.get("DJANGO_STATIC_ROOT", "").strip()
    or BASE_DIR / "staticfiles"
)
STATICFILES_DIRS = [
    FRONTEND_PUBLIC_DIR,
    PROJECT_ROOT / "frontend" / "src",
    PROJECT_ROOT / "engine" / "dist",
]

SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = _environment_bool("DJANGO_SECURE_SSL_REDIRECT", False)
try:
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_SECURE_HSTS_SECONDS", "0"))
except ValueError as exc:
    raise ImproperlyConfigured("DJANGO_SECURE_HSTS_SECONDS must be an integer.") from exc

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
