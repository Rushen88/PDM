"""
WebSocket Routing.

URL routing for WebSocket connections.
"""

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # Project updates
    re_path(
        r'ws/projects/(?P<project_id>[0-9a-f-]+)/$',
        consumers.ProjectConsumer.as_asgi()
    ),
    
    # User notifications
    re_path(
        r'ws/notifications/$',
        consumers.NotificationConsumer.as_asgi()
    ),
    
    # Dashboard updates
    re_path(
        r'ws/dashboard/$',
        consumers.DashboardConsumer.as_asgi()
    ),
]
