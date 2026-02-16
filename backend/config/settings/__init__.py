"""
Settings module initialization.
Automatically selects settings based on DJANGO_ENV environment variable.
"""

import os

env = os.environ.get('DJANGO_ENV', 'dev')

if env == 'prod':
    from .prod import *
else:
    from .dev import *
