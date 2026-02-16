"""
Development settings for PDM project.
"""

from .base import *

# =============================================================================
# DEBUG
# =============================================================================
DEBUG = True

# =============================================================================
# ALLOWED HOSTS
# =============================================================================
ALLOWED_HOSTS = ['*']

# =============================================================================
# INSTALLED APPS - Development
# =============================================================================
INSTALLED_APPS += [
    'debug_toolbar',
    'django_extensions',
]

# =============================================================================
# MIDDLEWARE - Development
# =============================================================================
MIDDLEWARE = ['debug_toolbar.middleware.DebugToolbarMiddleware'] + MIDDLEWARE

# =============================================================================
# DEBUG TOOLBAR
# =============================================================================
INTERNAL_IPS = ['127.0.0.1', 'localhost']

DEBUG_TOOLBAR_CONFIG = {
    'SHOW_TOOLBAR_CALLBACK': lambda request: DEBUG and not request.path.startswith('/api/'),
    'DISABLE_PANELS': {
        'debug_toolbar.panels.cache.CachePanel',
        'debug_toolbar.panels.profiling.ProfilingPanel',
    },
}

# =============================================================================
# EMAIL - Development (Console)
# =============================================================================
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# =============================================================================
# CORS - Development (Allow all)
# =============================================================================
CORS_ALLOW_ALL_ORIGINS = True

# =============================================================================
# DATABASE - Development Override
# =============================================================================
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='PDM'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default='RuSH.73501505wW'),
        'HOST': config('DB_HOST', default='127.0.0.1'),
        'PORT': config('DB_PORT', default='5432'),
    }
}

# =============================================================================
# LOGGING - Development
# =============================================================================
LOGGING['root']['level'] = 'DEBUG'
LOGGING['loggers']['pdm']['level'] = 'DEBUG'

# =============================================================================
# REDIS / CELERY / CHANNELS - Development Override (No Redis required)
# =============================================================================
# Use In-Memory Channel Layer for development
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer"
    }
}

# Use local memory cache for development (LocMemCache doesn't require Redis)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'pdm-dev-cache',
    }
}

# =============================================================================
# DEBUG TOOLBAR - Disable Cache Panel (it tries to wrap cache calls with Redis)
# =============================================================================
DEBUG_TOOLBAR_PANELS = [
    'debug_toolbar.panels.history.HistoryPanel',
    'debug_toolbar.panels.versions.VersionsPanel',
    'debug_toolbar.panels.timer.TimerPanel',
    'debug_toolbar.panels.settings.SettingsPanel',
    'debug_toolbar.panels.headers.HeadersPanel',
    'debug_toolbar.panels.request.RequestPanel',
    'debug_toolbar.panels.sql.SQLPanel',
    'debug_toolbar.panels.staticfiles.StaticFilesPanel',
    'debug_toolbar.panels.templates.TemplatesPanel',
    # 'debug_toolbar.panels.cache.CachePanel',  # DISABLED - causes Redis issues
    'debug_toolbar.panels.signals.SignalsPanel',
    'debug_toolbar.panels.redirects.RedirectsPanel',
    'debug_toolbar.panels.profiling.ProfilingPanel',
]

# =============================================================================
# REST FRAMEWORK - Development Override (Disable Throttling)
# =============================================================================
# In development, disable throttling to avoid cache dependency issues
REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'] = []
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {}

# =============================================================================
# CELERY - Development Override (Filesystem broker, no Redis)
# =============================================================================
import os
CELERY_BROKER_URL = 'filesystem://'
CELERY_BROKER_TRANSPORT_OPTIONS = {
    'data_folder_in': os.path.join(BASE_DIR, 'broker', 'out'),
    'data_folder_out': os.path.join(BASE_DIR, 'broker', 'out'),
    'data_folder_processed': os.path.join(BASE_DIR, 'broker', 'processed'),
}
# Create broker directories if they don't exist
for folder in CELERY_BROKER_TRANSPORT_OPTIONS.values():
    os.makedirs(folder, exist_ok=True)

