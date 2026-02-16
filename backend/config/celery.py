"""
Celery configuration for PDM project.
"""

import os

from celery import Celery

# Set the default Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('pdm')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
app.autodiscover_tasks()

# Configure task routes
app.conf.task_routes = {
    'infrastructure.messaging.tasks.recalculation.*': {'queue': 'recalculation'},
    'infrastructure.messaging.tasks.notifications.*': {'queue': 'notifications'},
    'infrastructure.messaging.tasks.reports.*': {'queue': 'reports'},
}

# Configure task schedules (periodic tasks)
app.conf.beat_schedule = {
    'recalculate-overdue-items': {
        'task': 'infrastructure.messaging.tasks.recalculation.check_overdue_items',
        'schedule': 3600.0,  # Every hour
    },
    'daily-progress-snapshot': {
        'task': 'infrastructure.messaging.tasks.recalculation.create_progress_snapshot',
        'schedule': 86400.0,  # Every 24 hours
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
