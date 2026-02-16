"""
Production API Views.

ViewSets for production orders and manufacturing tracking.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db.models import Sum, Count, Q, F
from django.utils import timezone
from datetime import date

from infrastructure.persistence.models import (
    ProductionOrder,
    ProductionTask,
    ProjectItem,
)
from ..serializers.production import (
    ProductionOrderListSerializer,
    ProductionOrderDetailSerializer,
    ProductionOrderCreateSerializer,
    ProductionTaskSerializer,
    ProductionTaskCreateSerializer,
    ProductionStatsSerializer,
)


class ProductionOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing production orders.
    
    Endpoints:
    - GET /api/v1/production-orders/ - list all orders
    - POST /api/v1/production-orders/ - create new order
    - GET /api/v1/production-orders/{id}/ - get order detail
    - PUT/PATCH /api/v1/production-orders/{id}/ - update order
    - DELETE /api/v1/production-orders/{id}/ - delete order
    - GET /api/v1/production-orders/stats/ - get production statistics
    - POST /api/v1/production-orders/{id}/start/ - start production
    - POST /api/v1/production-orders/{id}/complete/ - complete production
    - POST /api/v1/production-orders/{id}/cancel/ - cancel order
    """
    
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'project', 'is_active']
    search_fields = ['number', 'project__name', 'notes']
    ordering_fields = ['number', 'planned_start', 'planned_end', 'created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        return ProductionOrder.objects.select_related(
            'project'
        ).prefetch_related('tasks')
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ProductionOrderListSerializer
        elif self.action == 'create':
            return ProductionOrderCreateSerializer
        return ProductionOrderDetailSerializer
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get production statistics."""
        orders = self.get_queryset().filter(is_active=True)
        tasks = ProductionTask.objects.filter(is_active=True)
        
        today = date.today()
        
        # Calculate overall progress
        total_quantity = tasks.aggregate(total=Sum('quantity'))['total'] or 0
        completed_quantity = tasks.aggregate(total=Sum('completed_quantity'))['total'] or 0
        overall_progress = (float(completed_quantity) / float(total_quantity) * 100) if total_quantity > 0 else 0
        
        stats = {
            'total_orders': orders.count(),
            'in_progress': orders.filter(status='in_progress').count(),
            'completed': orders.filter(status='completed').count(),
            'total_tasks': tasks.count(),
            'tasks_not_started': tasks.filter(status='not_started').count(),
            'tasks_in_progress': tasks.filter(status='in_progress').count(),
            'tasks_completed': tasks.filter(status='completed').count(),
            'tasks_delayed': tasks.filter(
                status__in=['not_started', 'in_progress'],
                planned_end__lt=today
            ).count(),
            'overall_progress': round(overall_progress, 1),
        }
        
        serializer = ProductionStatsSerializer(stats)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Start production."""
        order = self.get_object()
        if order.status not in ['draft', 'planned']:
            return Response(
                {'error': 'Можно запустить только запланированный заказ'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        order.status = 'in_progress'
        order.actual_start = timezone.now().date()
        order.save()
        
        serializer = self.get_serializer(order)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete production."""
        order = self.get_object()
        if order.status != 'in_progress':
            return Response(
                {'error': 'Можно завершить только заказ в работе'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        order.status = 'completed'
        order.actual_end = timezone.now().date()
        order.save()
        
        serializer = self.get_serializer(order)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel order."""
        order = self.get_object()
        if order.status in ['completed', 'cancelled']:
            return Response(
                {'error': 'Невозможно отменить завершённый или уже отменённый заказ'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        order.status = 'cancelled'
        order.save()
        
        serializer = self.get_serializer(order)
        return Response(serializer.data)


class ProductionTaskViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing production tasks.
    
    Endpoints:
    - GET /api/v1/production-tasks/ - list all tasks
    - POST /api/v1/production-tasks/ - create new task
    - GET /api/v1/production-tasks/{id}/ - get task detail
    - PUT/PATCH /api/v1/production-tasks/{id}/ - update task
    - DELETE /api/v1/production-tasks/{id}/ - delete task
    - POST /api/v1/production-tasks/{id}/start/ - start task
    - POST /api/v1/production-tasks/{id}/complete/ - complete task
    - POST /api/v1/production-tasks/{id}/report-progress/ - report progress
    """
    
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['order', 'status', 'manufacturer_type', 'contractor', 'project_item', 'is_active']
    search_fields = ['nomenclature_item__code', 'nomenclature_item__name']
    ordering_fields = ['status', 'planned_start', 'planned_end', 'created_at']
    ordering = ['planned_start']
    
    def get_queryset(self):
        return ProductionTask.objects.select_related(
            'order', 'project_item', 'nomenclature_item', 'contractor'
        )
    
    def get_serializer_class(self):
        if self.action == 'create':
            return ProductionTaskCreateSerializer
        return ProductionTaskSerializer

    def _complete_project_if_root(self, item):
        """If root item completed, mark project as completed."""
        from infrastructure.persistence.models import Project
        from infrastructure.persistence.models.project import ProjectStatusChoices, ManufacturingStatusChoices
        
        item.refresh_from_db()
        if item.parent_item_id is not None:
            return
        if item.manufacturing_status != ManufacturingStatusChoices.COMPLETED:
            return
        project = item.project
        if project.status != ProjectStatusChoices.COMPLETED:
            project.status = ProjectStatusChoices.COMPLETED
            if not project.actual_end:
                project.actual_end = timezone.now().date()
            project.save(update_fields=['status', 'actual_end'])
    
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Start task."""
        task = self.get_object()
        if task.status != 'not_started':
            return Response(
                {'error': 'Можно начать только незапущенную задачу'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        task.status = 'in_progress'
        task.actual_start = timezone.now().date()
        task.save()
        
        # Update project item status
        if task.project_item:
            task.project_item.manufacturing_status = 'in_progress'
            task.project_item.actual_start_date = timezone.now().date()
            task.project_item.save()
        
        serializer = self.get_serializer(task)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete task."""
        task = self.get_object()
        if task.status != 'in_progress':
            return Response(
                {'error': 'Можно завершить только задачу в работе'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        task.status = 'completed'
        task.completed_quantity = task.quantity
        task.actual_end = timezone.now().date()
        task.save()
        
        # Update project item status
        if task.project_item:
            task.project_item.manufacturing_status = 'completed'
            task.project_item.quantity_produced = task.completed_quantity
            task.project_item.actual_end_date = timezone.now().date()
            task.project_item.save()
            
            # If root item completed, mark project as completed
            self._complete_project_if_root(task.project_item)
        
        serializer = self.get_serializer(task)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def report_progress(self, request, pk=None):
        """Report task progress."""
        task = self.get_object()
        
        completed_qty = request.data.get('completed_quantity')
        if completed_qty is None:
            return Response(
                {'error': 'Укажите completed_quantity'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            completed_qty = float(completed_qty)
        except (TypeError, ValueError):
            return Response(
                {'error': 'Некорректное значение completed_quantity'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if completed_qty > float(task.quantity):
            return Response(
                {'error': 'Выполненное количество не может превышать плановое'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        task.completed_quantity = completed_qty
        
        # Auto-update status
        if completed_qty >= float(task.quantity):
            task.status = 'completed'
            task.actual_end = timezone.now().date()
        elif completed_qty > 0 and task.status == 'not_started':
            task.status = 'in_progress'
            task.actual_start = timezone.now().date()
        
        task.save()
        
        # Update project item
        if task.project_item:
            task.project_item.quantity_produced = completed_qty
            if task.status == 'completed':
                task.project_item.manufacturing_status = 'completed'
                task.project_item.actual_end_date = timezone.now().date()
            elif task.status == 'in_progress':
                task.project_item.manufacturing_status = 'in_progress'
            task.project_item.save()
            
            # If root item completed, mark project as completed
            if task.status == 'completed':
                self._complete_project_if_root(task.project_item)
        
        serializer = self.get_serializer(task)
        return Response(serializer.data)
