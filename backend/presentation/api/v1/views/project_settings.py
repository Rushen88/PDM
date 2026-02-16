"""
Project Settings Views.

API views for configurable status and problem reason references.
"""

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from infrastructure.persistence.models import (
    ManufacturingStatus,
    PurchaseStatus,
    ManufacturingProblemReason,
    ManufacturingProblemSubreason,
    PurchaseProblemReason,
    PurchaseProblemSubreason,
    ProjectItemProblem,
)
from ..serializers.project_settings import (
    ManufacturingStatusSerializer,
    PurchaseStatusSerializer,
    ManufacturingProblemReasonSerializer,
    ManufacturingProblemSubreasonSerializer,
    PurchaseProblemReasonSerializer,
    PurchaseProblemSubreasonSerializer,
    ProjectItemProblemListSerializer,
    ProjectItemProblemDetailSerializer,
)
from .base import BaseModelViewSet


class ManufacturingStatusViewSet(BaseModelViewSet):
    """
    ViewSet for manufacturing status reference.
    
    Endpoints:
    - GET /manufacturing-statuses/ - list all statuses
    - POST /manufacturing-statuses/ - create status
    - GET /manufacturing-statuses/{id}/ - get status detail
    - PUT/PATCH /manufacturing-statuses/{id}/ - update status
    - DELETE /manufacturing-statuses/{id}/ - soft delete status
    - POST /manufacturing-statuses/{id}/set-default/ - set as default status
    """
    
    queryset = ManufacturingStatus.objects.filter(is_active=True)
    serializer_class = ManufacturingStatusSerializer
    search_fields = ['code', 'name', 'description']
    filterset_fields = ['is_default', 'is_completed', 'is_system', 'is_active']
    ordering_fields = ['sort_order', 'code', 'name', 'created_at']
    ordering = ['sort_order', 'name']
    
    def destroy(self, request, *args, **kwargs):
        """Prevent deletion of system statuses."""
        instance = self.get_object()
        if instance.is_system:
            return Response(
                {'error': 'Системные статусы нельзя удалить'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """Set this status as default."""
        instance = self.get_object()
        
        # Remove default from others
        ManufacturingStatus.objects.filter(is_default=True).update(is_default=False)
        
        # Set this as default
        instance.is_default = True
        instance.save(update_fields=['is_default'])
        
        return Response({
            'message': f'Статус "{instance.name}" установлен по умолчанию',
        })


class PurchaseStatusViewSet(BaseModelViewSet):
    """
    ViewSet for purchase status reference.
    
    Endpoints:
    - GET /purchase-statuses/ - list all statuses
    - POST /purchase-statuses/ - create status
    - GET /purchase-statuses/{id}/ - get status detail
    - PUT/PATCH /purchase-statuses/{id}/ - update status
    - DELETE /purchase-statuses/{id}/ - soft delete status
    - POST /purchase-statuses/{id}/set-default/ - set as default status
    """
    
    queryset = PurchaseStatus.objects.filter(is_active=True)
    serializer_class = PurchaseStatusSerializer
    search_fields = ['code', 'name', 'description']
    filterset_fields = ['is_default', 'is_delivered', 'is_not_required', 'is_system', 'is_active']
    ordering_fields = ['sort_order', 'code', 'name', 'created_at']
    ordering = ['sort_order', 'name']
    
    def destroy(self, request, *args, **kwargs):
        """Prevent deletion of system statuses."""
        instance = self.get_object()
        if instance.is_system:
            return Response(
                {'error': 'Системные статусы нельзя удалить'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """Set this status as default."""
        instance = self.get_object()
        
        # Remove default from others
        PurchaseStatus.objects.filter(is_default=True).update(is_default=False)
        
        # Set this as default
        instance.is_default = True
        instance.save(update_fields=['is_default'])
        
        return Response({
            'message': f'Статус "{instance.name}" установлен по умолчанию',
        })


class ManufacturingProblemReasonViewSet(BaseModelViewSet):
    """
    ViewSet for manufacturing problem reasons.
    
    Endpoints:
    - GET /manufacturing-problem-reasons/ - list all reasons
    - POST /manufacturing-problem-reasons/ - create reason
    - GET /manufacturing-problem-reasons/{id}/ - get reason detail
    - PUT/PATCH /manufacturing-problem-reasons/{id}/ - update reason
    - DELETE /manufacturing-problem-reasons/{id}/ - soft delete reason
    """
    
    queryset = ManufacturingProblemReason.objects.filter(is_active=True)
    serializer_class = ManufacturingProblemReasonSerializer
    search_fields = ['code', 'name', 'description']
    filterset_fields = ['severity', 'is_active']
    ordering_fields = ['sort_order', 'severity', 'code', 'name', 'created_at']
    ordering = ['sort_order', 'name']


class PurchaseProblemReasonViewSet(BaseModelViewSet):
    """
    ViewSet for purchase problem reasons.
    
    Endpoints:
    - GET /purchase-problem-reasons/ - list all reasons
    - POST /purchase-problem-reasons/ - create reason
    - GET /purchase-problem-reasons/{id}/ - get reason detail
    - PUT/PATCH /purchase-problem-reasons/{id}/ - update reason
    - DELETE /purchase-problem-reasons/{id}/ - soft delete reason
    """
    
    queryset = PurchaseProblemReason.objects.filter(is_active=True)
    serializer_class = PurchaseProblemReasonSerializer
    search_fields = ['code', 'name', 'description']
    filterset_fields = ['severity', 'is_active']
    ordering_fields = ['sort_order', 'severity', 'code', 'name', 'created_at']
    ordering = ['sort_order', 'name']


class ManufacturingProblemSubreasonViewSet(BaseModelViewSet):
    """ViewSet for manufacturing problem subreasons."""

    queryset = ManufacturingProblemSubreason.objects.filter(is_active=True)
    serializer_class = ManufacturingProblemSubreasonSerializer
    search_fields = ['name']
    filterset_fields = ['reason', 'is_active']
    ordering_fields = ['sort_order', 'name', 'created_at']
    ordering = ['sort_order', 'name']


class PurchaseProblemSubreasonViewSet(BaseModelViewSet):
    """ViewSet for purchase problem subreasons."""

    queryset = PurchaseProblemSubreason.objects.filter(is_active=True)
    serializer_class = PurchaseProblemSubreasonSerializer
    search_fields = ['name']
    filterset_fields = ['reason', 'is_active']
    ordering_fields = ['sort_order', 'name', 'created_at']
    ordering = ['sort_order', 'name']


class ProjectItemProblemViewSet(BaseModelViewSet):
    """
    ViewSet for project item problems.
    
    Endpoints:
    - GET /project-item-problems/ - list all problems
    - POST /project-item-problems/ - create problem
    - GET /project-item-problems/{id}/ - get problem detail
    - PUT/PATCH /project-item-problems/{id}/ - update problem
    - DELETE /project-item-problems/{id}/ - soft delete problem
    - POST /project-item-problems/{id}/resolve/ - mark as resolved
    """
    
    queryset = ProjectItemProblem.objects.select_related(
        'project_item',
        'manufacturing_reason',
        'purchase_reason',
        'reported_by',
        'resolved_by',
    ).filter(is_active=True)
    
    serializer_classes = {
        'list': ProjectItemProblemListSerializer,
        'retrieve': ProjectItemProblemDetailSerializer,
        'default': ProjectItemProblemDetailSerializer,
    }
    
    search_fields = ['description', 'impact_description', 'resolution_notes']
    filterset_fields = ['project_item', 'problem_type', 'is_resolved', 'is_active']
    ordering_fields = ['created_at', 'resolution_date']
    ordering = ['-created_at']
    
    filter_backends = [DjangoFilterBackend]
    
    def get_serializer_class(self):
        return self.serializer_classes.get(
            self.action,
            self.serializer_classes['default']
        )
    
    def perform_create(self, serializer):
        serializer.save(reported_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """Mark problem as resolved."""
        from django.utils import timezone
        
        instance = self.get_object()
        resolution_notes = request.data.get('resolution_notes', '')
        
        instance.is_resolved = True
        instance.resolution_date = timezone.now()
        instance.resolution_notes = resolution_notes
        instance.resolved_by = request.user
        instance.save(update_fields=[
            'is_resolved', 'resolution_date', 'resolution_notes', 'resolved_by'
        ])
        
        return Response({
            'message': 'Проблема отмечена как решённая',
            'resolution_date': instance.resolution_date,
        })
