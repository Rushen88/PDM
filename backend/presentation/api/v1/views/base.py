"""
Base Views.

Common view mixins and base classes.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.utils import timezone


class AuditViewMixin:
    """
    Mixin that adds audit fields on create/update.
    """
    
    def perform_create(self, serializer):
        """Set created_by and updated_by on create."""
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user
        )
    
    def perform_update(self, serializer):
        """Set updated_by on update."""
        serializer.save(updated_by=self.request.user)


class SoftDeleteViewMixin:
    """
    Mixin for soft delete functionality.
    """
    
    @action(detail=True, methods=['post'])
    def soft_delete(self, request, pk=None):
        """Soft delete an object."""
        obj = self.get_object()
        if hasattr(obj, 'soft_delete'):
            obj.soft_delete(user=request.user)
        else:
            obj.deleted_at = timezone.now()
            if hasattr(obj, 'deleted_by_id'):
                obj.deleted_by = request.user
            obj.save(update_fields=['deleted_at', 'deleted_by', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore a soft-deleted object."""
        obj = self.get_object()
        if hasattr(obj, 'restore'):
            obj.restore()
        else:
            obj.deleted_at = None
            if hasattr(obj, 'deleted_by_id'):
                obj.deleted_by = None
            obj.save(update_fields=['deleted_at', 'deleted_by', 'updated_at'])
        return Response(status=status.HTTP_200_OK)


class BulkActionMixin:
    """
    Mixin for bulk operations.
    """
    
    @action(detail=False, methods=['post'])
    def bulk_delete(self, request):
        """Bulk delete objects."""
        ids = request.data.get('ids', [])
        if not ids:
            return Response(
                {'error': 'Необходимо указать список ID'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        queryset = self.get_queryset().filter(id__in=ids)
        count = queryset.count()
        queryset.delete()
        
        return Response({'deleted': count})
    
    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """Bulk update objects."""
        ids = request.data.get('ids', [])
        updates = request.data.get('updates', {})
        
        if not ids or not updates:
            return Response(
                {'error': 'Необходимо указать список ID и обновления'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        queryset = self.get_queryset().filter(id__in=ids)
        count = queryset.update(**updates)
        
        return Response({'updated': count})


class HistoryViewMixin:
    """
    Mixin for accessing object history.
    """
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Get object history."""
        obj = self.get_object()
        
        if not hasattr(obj, 'history'):
            return Response(
                {'error': 'История не доступна для этого объекта'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        history = obj.history.all()[:50]
        data = [{
            'id': h.history_id,
            'date': h.history_date,
            'user': str(h.history_user) if h.history_user else None,
            'type': h.history_type,
            'changes': h.history_change_reason,
        } for h in history]
        
        return Response(data)


class BaseModelViewSet(
    AuditViewMixin,
    SoftDeleteViewMixin,
    HistoryViewMixin,
    viewsets.ModelViewSet
):
    """
    Base viewset with common functionality.
    """
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        """
        Return different serializers for list/retrieve actions.
        
        Override `serializer_classes` dict in subclass:
        serializer_classes = {
            'list': ListSerializer,
            'retrieve': DetailSerializer,
            'default': DetailSerializer,
        }
        """
        serializer_classes = getattr(self, 'serializer_classes', {})
        return serializer_classes.get(
            self.action,
            serializer_classes.get('default', super().get_serializer_class())
        )


class ReadOnlyModelViewSet(
    HistoryViewMixin,
    viewsets.ReadOnlyModelViewSet
):
    """
    Read-only viewset with history support.
    """
    permission_classes = [IsAuthenticated]
