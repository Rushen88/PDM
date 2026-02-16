"""
Procurement API Views.

ViewSets for purchase orders and procurement tracking.
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
    PurchaseOrder,
    PurchaseOrderItem,
    ProjectItem,
    GoodsReceipt,
    GoodsReceiptItem,
)
from ..serializers.procurement import (
    PurchaseOrderListSerializer,
    PurchaseOrderDetailSerializer,
    PurchaseOrderCreateSerializer,
    PurchaseOrderItemSerializer,
    ProcurementScheduleItemSerializer,
    ProcurementStatsSerializer,
    GoodsReceiptListSerializer,
    GoodsReceiptDetailSerializer,
    GoodsReceiptCreateSerializer,
    GoodsReceiptItemSerializer,
)


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing purchase orders.
    
    Endpoints:
    - GET /api/v1/purchase-orders/ - list all orders
    - POST /api/v1/purchase-orders/ - create new order
    - GET /api/v1/purchase-orders/{id}/ - get order detail
    - PUT/PATCH /api/v1/purchase-orders/{id}/ - update order
    - DELETE /api/v1/purchase-orders/{id}/ - delete order
    - GET /api/v1/purchase-orders/stats/ - get procurement statistics
    - POST /api/v1/purchase-orders/{id}/submit/ - submit order to supplier
    - POST /api/v1/purchase-orders/{id}/confirm/ - confirm order
    - POST /api/v1/purchase-orders/{id}/cancel/ - cancel order
    """
    
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'supplier', 'project', 'is_active']
    search_fields = ['number', 'supplier__name', 'notes']
    ordering_fields = ['number', 'order_date', 'expected_delivery_date', 'total_amount', 'created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        return PurchaseOrder.objects.select_related(
            'supplier', 'project'
        ).prefetch_related('items')
    
    def get_serializer_class(self):
        if self.action == 'list':
            return PurchaseOrderListSerializer
        elif self.action == 'create':
            return PurchaseOrderCreateSerializer
        return PurchaseOrderDetailSerializer
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get procurement statistics."""
        queryset = self.get_queryset().filter(is_active=True)
        
        # Count items by status
        items = PurchaseOrderItem.objects.filter(order__is_active=True, is_active=True)
        
        today = date.today()
        
        stats = {
            'total_items': items.count(),
            'pending': items.filter(status='pending').count(),
            'ordered': items.filter(status='ordered').count(),
            'in_transit': items.filter(status='in_transit').count(),
            'delivered': items.filter(status='delivered').count(),
            'overdue': items.filter(
                status__in=['pending', 'ordered', 'in_transit'],
                expected_delivery_date__lt=today
            ).count(),
            'total_orders': queryset.count(),
            'total_amount': queryset.exclude(status='cancelled').aggregate(
                total=Sum('total_amount')
            )['total'],
        }
        
        serializer = ProcurementStatsSerializer(stats)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit order to supplier."""
        order = self.get_object()
        if order.status != 'draft':
            return Response(
                {'error': 'Можно отправить только черновик'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            order.confirm_order(user=request.user)
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """
        Подтверждение заказа (перевод в статус "Заказан").
        
        Согласно ERP-требованиям:
        - Можно подтвердить только черновик
        - Нельзя подтвердить пустой заказ
        - При подтверждении обновляются статусы потребностей и позиций проекта
        """
        order = self.get_object()
        
        try:
            order.confirm_order(user=request.user)
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel order."""
        order = self.get_object()
        if order.status == 'closed':
            return Response(
                {'error': 'Невозможно отменить закрытый заказ'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from infrastructure.persistence.models import GoodsReceipt, PurchaseOrderItem

        receipts = GoodsReceipt.objects.filter(purchase_order=order)
        confirmed_receipts = receipts.filter(status='confirmed')
        
        # Отменяем все подтвержденные поступления (по требованию "отменить даты и приходования")
        if confirmed_receipts.exists():
            try:
                for receipt in confirmed_receipts:
                    receipt.cancel_confirmation(user=request.user)
            except Exception as e:
                return Response(
                    {'error': f'Ошибка при отмене связанных поступлений: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Отменяем/удаляем черновики поступлений
        receipts.filter(status='draft').update(status='cancelled')

        # Освободить связанные потребности
        from infrastructure.persistence.models import MaterialRequirement
        MaterialRequirement.objects.filter(
            purchase_order=order
        ).update(
            purchase_order=None,
            status='waiting_order'
        )

        # Вернуть статусы позиций проекта
        for item in order.items.all():
            if item.project_item:
                item.project_item.purchase_status = 'waiting_order'
                # Сбрасываем фактические даты, если нет других активных заказов по позиции
                other_active = PurchaseOrderItem.objects.filter(
                    project_item=item.project_item
                ).exclude(order=order).exclude(order__status__in=['draft', 'cancelled']).exists()
                if not other_active:
                    item.project_item.actual_start = None
                    item.project_item.actual_end = None
                item.project_item.save(update_fields=[
                    'purchase_status',
                    'actual_start',
                    'actual_end',
                    'updated_at'
                ])

        # Legacy статус отмены (для совместимости)
        order.status = 'cancelled'
        order.save(update_fields=['status', 'updated_at'])
        order.items.update(status='cancelled')
        
        serializer = self.get_serializer(order)
        return Response(serializer.data)
    
    def destroy(self, request, pk=None):
        """
        Удаление заказа (только для черновиков).
        
        Согласно ERP-требованиям:
        - Удалять можно только заказы в статусе 'draft'
        - При удалении связанные потребности освобождаются
        """
        order = self.get_object()
        
        try:
            order.safe_delete(user=request.user)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class PurchaseOrderItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing purchase order items.
    """
    
    permission_classes = [IsAuthenticated]
    serializer_class = PurchaseOrderItemSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['order', 'status', 'nomenclature_item', 'project_item', 'is_active']
    search_fields = ['nomenclature_item__code', 'nomenclature_item__name']
    ordering_fields = ['status', 'expected_delivery_date', 'created_at']
    ordering = ['expected_delivery_date']
    
    def get_queryset(self):
        return PurchaseOrderItem.objects.select_related(
            'order', 'nomenclature_item', 'project_item'
        )


class ProcurementScheduleViewSet(viewsets.ViewSet):
    """
    ViewSet for procurement schedule - items that need to be ordered.
    
    This aggregates data from project items that are marked for purchase.
    """
    
    permission_classes = [IsAuthenticated]
    
    def list(self, request):
        """
        Get list of items that need to be procured.
        Aggregates from project items with purchase requirements.
        """
        # Filter parameters
        project_id = request.query_params.get('project')
        status_filter = request.query_params.get('status')
        
        # Get project items that need procurement
        queryset = ProjectItem.objects.filter(
            is_active=True,
            purchase_status__in=['waiting_order', 'in_order'],
            project__is_active=True,
        ).select_related(
            'project', 'nomenclature_item', 'nomenclature_item__default_supplier'
        )
        
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        
        if status_filter:
            queryset = queryset.filter(purchase_status=status_filter)
        
        # Calculate ordered quantities from active Purchase Orders
        po_items = PurchaseOrderItem.objects.filter(
            project_item__in=queryset,
            is_active=True,
            order__is_active=True
        ).exclude(
            status='cancelled'
        ).values('project_item_id').annotate(
            total_ordered=Sum('quantity')
        )
        
        ordered_map = {item['project_item_id']: item['total_ordered'] or 0 for item in po_items}
        
        # Build schedule items
        schedule_items = []
        for item in queryset:
            ordered_qty = ordered_map.get(item.id, 0)
            remaining = float(item.quantity_required) - float(item.quantity_purchased)
            if remaining > 0:
                schedule_items.append({
                    'id': item.id,
                    'project_id': item.project.id,
                    'project_name': item.project.name,
                    'nomenclature_id': item.nomenclature_item.id if item.nomenclature_item else None,
                    'name': item.nomenclature_item.name if item.nomenclature_item else item.name,
                    'required_quantity': item.quantity_required,
                    'ordered_quantity': ordered_qty,
                    'received_quantity': item.quantity_purchased,
                    'remaining_quantity': remaining,
                    'unit': item.unit,
                    'required_date': item.planned_end_date,
                    'status': item.purchase_status,
                    'supplier_id': item.nomenclature_item.default_supplier.id if item.nomenclature_item and item.nomenclature_item.default_supplier else None,
                    'supplier_name': item.nomenclature_item.default_supplier.name if item.nomenclature_item and item.nomenclature_item.default_supplier else None,
                })
        
        serializer = ProcurementScheduleItemSerializer(schedule_items, many=True)
        return Response({
            'count': len(schedule_items),
            'results': serializer.data
        })


class GoodsReceiptViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing goods receipts (Поступления).
    
    Согласно ТЗ:
    - Поступление создаётся на основании заказа на закупку
    - Допускается частичное поступление
    - При подтверждении: увеличиваются остатки, обновляется статус заказа
    
    Endpoints:
    - GET /api/v1/goods-receipts/ - list all receipts
    - POST /api/v1/goods-receipts/ - create new receipt
    - GET /api/v1/goods-receipts/{id}/ - get receipt detail
    - PUT/PATCH /api/v1/goods-receipts/{id}/ - update receipt
    - DELETE /api/v1/goods-receipts/{id}/ - delete receipt
    - POST /api/v1/goods-receipts/{id}/confirm/ - confirm receipt (updates stock)
    - POST /api/v1/goods-receipts/{id}/cancel/ - cancel receipt
    """
    
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'purchase_order', 'warehouse', 'is_active']
    search_fields = ['number', 'purchase_order__number', 'notes']
    ordering_fields = ['number', 'receipt_date', 'created_at']
    ordering = ['-receipt_date', '-created_at']
    
    def get_queryset(self):
        return GoodsReceipt.objects.select_related(
            'purchase_order', 'purchase_order__supplier', 'warehouse', 'received_by'
        ).prefetch_related('items', 'items__purchase_order_item')
    
    def get_serializer_class(self):
        if self.action == 'list':
            return GoodsReceiptListSerializer
        elif self.action == 'create':
            return GoodsReceiptCreateSerializer
        return GoodsReceiptDetailSerializer
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """
        Confirm goods receipt - this updates stock and order statuses.
        
        Системная операция:
        1. Увеличивает складские остатки
        2. Обновляет статус заказа на закупку
        3. Закрывает связанные потребности
        """
        receipt = self.get_object()
        
        if receipt.status != 'draft':
            return Response(
                {'error': 'Можно подтвердить только черновик поступления'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not receipt.items.exists():
            return Response(
                {'error': 'Невозможно подтвердить поступление без позиций'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            receipt.confirm(user=request.user)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': f'Ошибка при подтверждении: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        serializer = self.get_serializer(receipt)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel goods receipt (only drafts can be cancelled)."""
        receipt = self.get_object()
        
        if receipt.status != 'draft':
            return Response(
                {'error': 'Можно отменить только черновик поступления'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        receipt.status = 'cancelled'
        receipt.save()
        
        serializer = self.get_serializer(receipt)
        return Response(serializer.data)


class GoodsReceiptItemViewSet(viewsets.ModelViewSet):
    """ViewSet for managing goods receipt items."""
    
    permission_classes = [IsAuthenticated]
    serializer_class = GoodsReceiptItemSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['goods_receipt', 'purchase_order_item', 'is_active']
    ordering = ['created_at']
    
    def get_queryset(self):
        return GoodsReceiptItem.objects.select_related(
            'goods_receipt', 
            'purchase_order_item', 
            'purchase_order_item__nomenclature_item'
        )
    
    def create(self, request, *args, **kwargs):
        """Create receipt item with validation."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Validate that receipt is still in draft
        receipt = serializer.validated_data.get('goods_receipt')
        if receipt and receipt.status != 'draft':
            return Response(
                {'error': 'Нельзя добавить позиции в подтверждённое поступление'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
