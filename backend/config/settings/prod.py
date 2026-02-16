"""
Production settings for PDM project.
"""

from .base import *

# =============================================================================
# SECURITY
# =============================================================================
DEBUG = False

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# HTTPS settings (when behind Nginx with SSL)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True

# =============================================================================
# ALLOWED HOSTS - Production
# =============================================================================
ALLOWED_HOSTS = config('ALLOWED_HOSTS', cast=Csv())

# =============================================================================
# DATABASE - Production
# =============================================================================
DATABASES['default']['CONN_MAX_AGE'] = 300
DATABASES['default']['OPTIONS'] = {
    'connect_timeout': 10,
    'sslmode': config('DB_SSL_MODE', default='prefer'),
}

# =============================================================================
# STATIC FILES - Production
# =============================================================================
STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.ManifestStaticFilesStorage'

# =============================================================================
# EMAIL - Production
# =============================================================================
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = config('EMAIL_HOST', default='')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
EMAIL_USE_TLS = True

# =============================================================================
# SENTRY (Error Tracking)
# =============================================================================
SENTRY_DSN = config('SENTRY_DSN', default='')
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.redis import RedisIntegration
    
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[
            DjangoIntegration(),
            CeleryIntegration(),
            RedisIntegration(),
        ],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

# =============================================================================
# LOGGING - Production
# =============================================================================
LOGGING['handlers']['file']['filename'] = '/var/log/pdm/pdm.log'
