"""
WebSocket Consumers.

Real-time update consumers for projects and notifications.
"""

import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
import logging

logger = logging.getLogger(__name__)


class BaseConsumer(AsyncJsonWebsocketConsumer):
    """Base consumer with common functionality."""
    
    async def connect(self):
        """Connect to WebSocket."""
        self.user = self.scope.get('user')
        
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return
        
        await self.accept()
    
    async def disconnect(self, close_code):
        """Disconnect from WebSocket."""
        pass
    
    async def send_error(self, message: str):
        """Send error message."""
        await self.send_json({
            'type': 'error',
            'message': message
        })


class ProjectConsumer(BaseConsumer):
    """
    WebSocket consumer for project updates.
    
    Provides real-time updates for:
    - Project progress changes
    - Item status changes
    - Milestone updates
    - Notes added
    """
    
    async def connect(self):
        """Connect and join project room."""
        await super().connect()
        
        if not hasattr(self, 'user') or not self.user.is_authenticated:
            return
        
        self.project_id = self.scope['url_route']['kwargs'].get('project_id')
        
        if not self.project_id:
            await self.send_error('Project ID required')
            await self.close()
            return
        
        # Check project access
        has_access = await self._check_project_access()
        if not has_access:
            await self.send_error('Access denied')
            await self.close()
            return
        
        # Join project room
        self.room_name = f'project_{self.project_id}'
        await self.channel_layer.group_add(
            self.room_name,
            self.channel_name
        )
        
        logger.info(f"User {self.user} connected to project {self.project_id}")
    
    async def disconnect(self, close_code):
        """Leave project room."""
        if hasattr(self, 'room_name'):
            await self.channel_layer.group_discard(
                self.room_name,
                self.channel_name
            )
    
    async def receive_json(self, content):
        """Handle incoming messages."""
        message_type = content.get('type')
        
        if message_type == 'subscribe_item':
            # Subscribe to specific item updates
            item_id = content.get('item_id')
            if item_id:
                item_room = f'project_item_{item_id}'
                await self.channel_layer.group_add(
                    item_room,
                    self.channel_name
                )
        
        elif message_type == 'unsubscribe_item':
            item_id = content.get('item_id')
            if item_id:
                item_room = f'project_item_{item_id}'
                await self.channel_layer.group_discard(
                    item_room,
                    self.channel_name
                )
        
        elif message_type == 'ping':
            await self.send_json({'type': 'pong'})
    
    # Event handlers (called by channel layer)
    
    async def project_progress_update(self, event):
        """Handle project progress update."""
        await self.send_json({
            'type': 'progress_update',
            'project_id': event['project_id'],
            'progress_percent': event['progress_percent'],
            'updated_by': event.get('updated_by'),
            'timestamp': event.get('timestamp'),
        })
    
    async def item_status_change(self, event):
        """Handle item status change."""
        await self.send_json({
            'type': 'item_status_change',
            'item_id': event['item_id'],
            'old_status': event['old_status'],
            'new_status': event['new_status'],
            'updated_by': event.get('updated_by'),
            'timestamp': event.get('timestamp'),
        })
    
    async def item_progress_update(self, event):
        """Handle item progress update."""
        await self.send_json({
            'type': 'item_progress_update',
            'item_id': event['item_id'],
            'quantity_completed': event['quantity_completed'],
            'progress_percent': event.get('progress_percent'),
            'updated_by': event.get('updated_by'),
            'timestamp': event.get('timestamp'),
        })
    
    async def milestone_update(self, event):
        """Handle milestone update."""
        await self.send_json({
            'type': 'milestone_update',
            'milestone_id': event['milestone_id'],
            'status': event['status'],
            'timestamp': event.get('timestamp'),
        })
    
    async def note_added(self, event):
        """Handle new note added."""
        await self.send_json({
            'type': 'note_added',
            'note_id': event['note_id'],
            'content': event.get('content'),
            'created_by': event.get('created_by'),
            'timestamp': event.get('timestamp'),
        })
    
    @database_sync_to_async
    def _check_project_access(self):
        """Check if user has access to the project."""
        from infrastructure.persistence.models import Project
        
        try:
            project = Project.objects.get(id=self.project_id)
            # For now, allow all authenticated users
            # TODO: Implement proper permission checks
            return True
        except Project.DoesNotExist:
            return False


class NotificationConsumer(BaseConsumer):
    """
    WebSocket consumer for user notifications.
    
    Provides real-time notifications for:
    - System notifications
    - Project assignments
    - Deadline reminders
    - Status updates
    """
    
    async def connect(self):
        """Connect and join user's notification room."""
        await super().connect()
        
        if not hasattr(self, 'user') or not self.user.is_authenticated:
            return
        
        # Join user's personal notification room
        self.room_name = f'notifications_{self.user.id}'
        await self.channel_layer.group_add(
            self.room_name,
            self.channel_name
        )
        
        # Also join role-based rooms
        roles = await self._get_user_roles()
        for role in roles:
            await self.channel_layer.group_add(
                f'notifications_role_{role}',
                self.channel_name
            )
        
        logger.info(f"User {self.user} connected to notifications")
    
    async def disconnect(self, close_code):
        """Leave notification rooms."""
        if hasattr(self, 'room_name'):
            await self.channel_layer.group_discard(
                self.room_name,
                self.channel_name
            )
    
    async def receive_json(self, content):
        """Handle incoming messages."""
        message_type = content.get('type')
        
        if message_type == 'mark_read':
            notification_id = content.get('notification_id')
            # TODO: Mark notification as read
        
        elif message_type == 'ping':
            await self.send_json({'type': 'pong'})
    
    # Event handlers
    
    async def notification(self, event):
        """Handle generic notification."""
        await self.send_json({
            'type': 'notification',
            'notification_id': event.get('notification_id'),
            'title': event['title'],
            'message': event['message'],
            'level': event.get('level', 'info'),  # info, warning, error, success
            'action_url': event.get('action_url'),
            'timestamp': event.get('timestamp'),
        })
    
    async def deadline_reminder(self, event):
        """Handle deadline reminder."""
        await self.send_json({
            'type': 'deadline_reminder',
            'item_id': event['item_id'],
            'item_name': event['item_name'],
            'project_name': event['project_name'],
            'deadline': event['deadline'],
            'days_remaining': event['days_remaining'],
        })
    
    async def assignment(self, event):
        """Handle new assignment."""
        await self.send_json({
            'type': 'assignment',
            'item_id': event['item_id'],
            'item_name': event['item_name'],
            'project_name': event['project_name'],
            'assigned_by': event.get('assigned_by'),
            'timestamp': event.get('timestamp'),
        })
    
    @database_sync_to_async
    def _get_user_roles(self):
        """Get user's role codes."""
        return list(self.user.roles.values_list('code', flat=True))


class DashboardConsumer(BaseConsumer):
    """
    WebSocket consumer for dashboard updates.
    
    Provides real-time updates for:
    - Active projects count
    - Overall statistics
    - Recent activity
    """
    
    async def connect(self):
        """Connect and join dashboard room."""
        await super().connect()
        
        if not hasattr(self, 'user') or not self.user.is_authenticated:
            return
        
        self.room_name = 'dashboard'
        await self.channel_layer.group_add(
            self.room_name,
            self.channel_name
        )
        
        # Send initial dashboard data
        dashboard_data = await self._get_dashboard_data()
        await self.send_json({
            'type': 'initial_data',
            'data': dashboard_data
        })
    
    async def disconnect(self, close_code):
        """Leave dashboard room."""
        if hasattr(self, 'room_name'):
            await self.channel_layer.group_discard(
                self.room_name,
                self.channel_name
            )
    
    async def receive_json(self, content):
        """Handle incoming messages."""
        message_type = content.get('type')
        
        if message_type == 'refresh':
            dashboard_data = await self._get_dashboard_data()
            await self.send_json({
                'type': 'refresh_data',
                'data': dashboard_data
            })
        
        elif message_type == 'ping':
            await self.send_json({'type': 'pong'})
    
    # Event handlers
    
    async def dashboard_update(self, event):
        """Handle dashboard data update."""
        await self.send_json({
            'type': 'dashboard_update',
            'data': event['data'],
            'timestamp': event.get('timestamp'),
        })
    
    async def activity(self, event):
        """Handle new activity."""
        await self.send_json({
            'type': 'activity',
            'activity_type': event['activity_type'],
            'description': event['description'],
            'user': event.get('user'),
            'timestamp': event.get('timestamp'),
        })
    
    @database_sync_to_async
    def _get_dashboard_data(self):
        """Get dashboard summary data."""
        from infrastructure.persistence.models import Project, ProjectItem
        from django.db.models import Count, Avg, Q
        from django.utils import timezone
        
        today = timezone.now().date()
        
        # Project statistics
        project_stats = Project.objects.exclude(
            status='cancelled'
        ).aggregate(
            total=Count('id'),
            active=Count('id', filter=Q(status='in_progress')),
            planning=Count('id', filter=Q(status='planning')),
            completed=Count('id', filter=Q(status='completed')),
            avg_progress=Avg('progress_percent'),
        )
        
        # Overdue items
        overdue_count = ProjectItem.objects.filter(
            planned_end_date__lt=today
        ).exclude(
            status__in=['completed', 'cancelled']
        ).count()
        
        return {
            'projects': project_stats,
            'overdue_items': overdue_count,
        }
