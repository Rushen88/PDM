"""
Inventory Views.

API ViewSets for warehouse and stock management.
"""

import logging
from datetime import date
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, F, Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from infrastructure.persistence.models import (
    Warehouse,
    StockItem,
    StockReservation,
    StockMovement,
    StockBatch,
    InventoryDocument,
    InventoryItem,
    NomenclatureItem,
    StockTransfer,
    StockTransferItem,
    MaterialRequirement,
    ContractorWriteOff,
    ContractorWriteOffItem,
    ContractorReceipt,
    ContractorReceiptItem,
)
from ..serializers.inventory import (
    WarehouseSerializer,
    StockItemListSerializer,
    StockItemDetailSerializer,
    StockReservationSerializer,
    StockMovementSerializer,
    StockBatchSerializer,
    InventoryDocumentListSerializer,
    InventoryDocumentDetailSerializer,
    InventoryItemSerializer,
    StockReceiptSerializer,
    StockIssueSerializer,
    StockTransferListSerializer,
    StockTransferDetailSerializer,
    StockTransferCreateSerializer,
    StockTransferItemSerializer,
    MaterialRequirementModelSerializer,
    MaterialRequirementCalculateSerializer,
    ContractorWriteOffListSerializer,
    ContractorWriteOffDetailSerializer,
    ContractorWriteOffCreateSerializer,
    ContractorReceiptListSerializer,
    ContractorReceiptDetailSerializer,
    ContractorReceiptCreateSerializer,
)

logger = logging.getLogger(__name__)


class WarehouseViewSet(viewsets.ModelViewSet):
    """ViewSet for Warehouse management."""
    
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        # Search by name or code
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(code__icontains=search)
            )
        
        return queryset
    
    @action(detail=True, methods=['get'])
    def stock_summary(self, request, pk=None):
        """Get stock summary for warehouse."""
        warehouse = self.get_object()
        
        stock_items = StockItem.objects.filter(warehouse=warehouse)
        
        summary = {
            'total_items': stock_items.count(),
            'low_stock_items': stock_items.filter(
                quantity__lt=10,
                quantity__gt=0
            ).count(),
            'out_of_stock_items': stock_items.filter(quantity__lte=0).count(),
        }
        
        return Response(summary)


class StockItemViewSet(viewsets.ModelViewSet):
    """ViewSet for StockItem management."""
    
    queryset = StockItem.objects.all()
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action in ['list']:
            return StockItemListSerializer
        return StockItemDetailSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.select_related('warehouse', 'nomenclature_item', 'nomenclature_item__catalog_category')
        
        # Filter by warehouse
        warehouse_id = self.request.query_params.get('warehouse')
        if warehouse_id:
            queryset = queryset.filter(warehouse_id=warehouse_id)
        
        # Filter by category
        category_id = self.request.query_params.get('category')
        if category_id:
            queryset = queryset.filter(nomenclature_item__catalog_category_id=category_id)

        # Filter by nomenclature item
        nomenclature_item_id = self.request.query_params.get('nomenclature_item')
        if nomenclature_item_id:
            queryset = queryset.filter(nomenclature_item_id=nomenclature_item_id)
        
        # Filter by low stock
        low_stock = self.request.query_params.get('low_stock')
        if low_stock and low_stock.lower() == 'true':
            queryset = queryset.filter(quantity__lt=10, quantity__gt=0)
        
        # Filter by out of stock
        out_of_stock = self.request.query_params.get('out_of_stock')
        if out_of_stock and out_of_stock.lower() == 'true':
            queryset = queryset.filter(quantity__lte=0)
        
        # Search by nomenclature name or code
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(nomenclature_item__name__icontains=search) |
                Q(nomenclature_item__code__icontains=search) |
                Q(location__icontains=search)
            )
        
        return queryset

    @action(detail=True, methods=['post'])
    def distribute_to_projects(self, request, pk=None):
        """
        Распределить свободный остаток по проектам в работе.

        Payload:
        - project_ids: список проектов (опционально)
        - quantity: количество к распределению (опционально, по умолчанию весь свободный остаток)
        """
        from decimal import Decimal
        from django.db import transaction
        from datetime import date
        from django.forms.models import model_to_dict
        from infrastructure.persistence.models import Project, ProjectItem, MaterialRequirement, StockReservation

        stock_item = self.get_object()

        try:
            quantity = request.data.get('quantity', None)
            quantity = Decimal(str(quantity)) if quantity is not None else Decimal(str(stock_item.available_quantity))
        except Exception:
            return Response({'error': 'Некорректное значение quantity'}, status=status.HTTP_400_BAD_REQUEST)

        if quantity <= 0:
            return Response({'allocated': [], 'remaining': float(quantity)})

        if quantity > stock_item.available_quantity:
            return Response({'error': 'Недостаточно свободного остатка'}, status=status.HTTP_400_BAD_REQUEST)

        project_ids = request.data.get('project_ids', [])

        projects_qs = Project.objects.filter(status='in_progress')
        if project_ids:
            projects_qs = projects_qs.filter(id__in=project_ids)

        requirements_qs = MaterialRequirement.objects.filter(
            nomenclature_item=stock_item.nomenclature_item,
            status='waiting_order',
            purchase_order__isnull=True,
            project__in=projects_qs,
            project_item__isnull=False,
            is_active=True,
            deleted_at__isnull=True
        ).select_related('project', 'project_item')

        requirements = list(requirements_qs)

        def sort_key(req):
            delivery = req.delivery_date or (req.project_item.required_date if req.project_item else None) or date.max
            project_name = req.project.name if req.project else ''
            item_name = req.project_item.name if req.project_item else ''
            return (delivery, project_name, item_name, str(req.id))

        requirements.sort(key=sort_key)

        allocated = []
        remaining = quantity

        with transaction.atomic():
            for req in requirements:
                if remaining <= 0:
                    break
                reserved_for_req = StockReservation.objects.filter(
                    project_item=req.project_item,
                    status__in=['pending', 'confirmed'],
                ).aggregate(total=Sum('quantity'))['total'] or 0

                required_qty = req.total_required if req.total_required is not None else (
                    req.project_item.quantity if req.project_item else 0
                )
                need = Decimal(str(required_qty)) - Decimal(str(reserved_for_req))
                if need <= 0:
                    continue

                if remaining >= need:
                    take = need

                    StockReservation.objects.create(
                        stock_item=stock_item,
                        project=req.project,
                        project_item=req.project_item,
                        quantity=take,
                        status='confirmed',
                        required_date=req.project_item.required_date if req.project_item else None,
                        notes='Распределение свободного остатка'
                    )
                    stock_item.reserved_quantity += take
                    stock_item.save(update_fields=['reserved_quantity'])

                    total_available = StockItem.objects.filter(
                        nomenclature_item=req.project_item.nomenclature_item,
                    ).aggregate(total=Sum('quantity'))['total'] or 0

                    total_reserved_others = StockReservation.objects.filter(
                        stock_item__nomenclature_item=req.project_item.nomenclature_item,
                        status__in=['pending', 'confirmed'],
                    ).exclude(project_item=req.project_item).aggregate(total=Sum('quantity'))['total'] or 0

                    reserved_for_original = StockReservation.objects.filter(
                        project_item=req.project_item,
                        status__in=['pending', 'confirmed'],
                    ).aggregate(total=Sum('quantity'))['total'] or 0

                    free_stock = max(0, total_available - total_reserved_others)
                    already_covered = reserved_for_original + free_stock

                    req.status = 'closed'
                    req.total_required = required_qty
                    req.total_available = total_available
                    req.total_reserved = total_reserved_others + reserved_for_original
                    req.to_order = max(0, Decimal(str(required_qty)) - Decimal(str(already_covered)))
                    req.save(update_fields=['status', 'total_required', 'total_available', 'total_reserved', 'to_order', 'updated_at'])

                    if req.project_item:
                        req.project_item.purchase_status = 'closed'
                        req.project_item.save(update_fields=['purchase_status', 'updated_at'])

                    allocated.append({
                        'requirement_id': str(req.id),
                        'project_id': str(req.project_id) if req.project_id else None,
                        'project_item_id': str(req.project_item_id) if req.project_item_id else None,
                        'allocated_quantity': float(take),
                    })
                    remaining -= take
                else:
                    # Split project item and requirement for partial allocation
                    split_qty = remaining
                    project_item = req.project_item
                    if not project_item:
                        break

                    data = model_to_dict(project_item, exclude=[
                        'id', 'created_at', 'updated_at', 'deleted_at', 'version',
                        'item_number',
                        'created_by', 'updated_by', 'deleted_by',
                        'project', 'parent_item', 'nomenclature_item', 'bom_item',
                        'supplier', 'contractor', 'responsible', 'problem_reason', 'delay_reason'
                    ])
                    data['quantity'] = split_qty
                    data['purchase_status'] = 'closed'

                    new_item = ProjectItem.objects.create(
                        project=project_item.project,
                        parent_item=project_item.parent_item,
                        nomenclature_item=project_item.nomenclature_item,
                        bom_item=project_item.bom_item,
                        supplier=project_item.supplier,
                        contractor=project_item.contractor,
                        responsible=project_item.responsible,
                        problem_reason=project_item.problem_reason,
                        delay_reason=project_item.delay_reason,
                        **data,
                        created_by=request.user,
                        updated_by=request.user
                    )

                    project_item.quantity = Decimal(str(project_item.quantity)) - split_qty
                    project_item.save(update_fields=['quantity', 'updated_at'])

                    total_available = StockItem.objects.filter(
                        nomenclature_item=project_item.nomenclature_item,
                    ).aggregate(total=Sum('quantity'))['total'] or 0

                    # Резервы ДРУГИХ позиций (не оригинальной)
                    total_reserved_others = StockReservation.objects.filter(
                        stock_item__nomenclature_item=project_item.nomenclature_item,
                        status__in=['pending', 'confirmed'],
                    ).exclude(project_item=project_item).aggregate(total=Sum('quantity'))['total'] or 0
                    
                    # Резервы для оригинальной позиции
                    reserved_for_original = StockReservation.objects.filter(
                        project_item=project_item,
                        status__in=['pending', 'confirmed'],
                    ).aggregate(total=Sum('quantity'))['total'] or 0
                    
                    free_stock = max(0, total_available - total_reserved_others)
                    already_covered = reserved_for_original + free_stock

                    req.total_required = project_item.quantity
                    req.total_available = total_available
                    req.total_reserved = total_reserved_others + reserved_for_original
                    req.to_order = max(0, project_item.quantity - already_covered)
                    req.save(update_fields=['total_required', 'total_available', 'total_reserved', 'to_order', 'updated_at'])

                    StockReservation.objects.create(
                        stock_item=stock_item,
                        project=new_item.project,
                        project_item=new_item,
                        quantity=split_qty,
                        status='confirmed',
                        required_date=new_item.required_date,
                        notes='Распределение свободного остатка'
                    )
                    stock_item.reserved_quantity += split_qty
                    stock_item.save(update_fields=['reserved_quantity'])

                    new_req = MaterialRequirement.objects.create(
                        project=new_item.project,
                        project_item=new_item,
                        nomenclature_item=new_item.nomenclature_item,
                        status='closed',
                        order_by_date=new_item.order_date,
                        delivery_date=new_item.required_date,
                        supplier=new_item.supplier,
                        total_required=split_qty,
                        total_available=total_available,
                        total_reserved=total_reserved_others + reserved_for_original,
                        to_order=0,
                        has_problem=new_item.has_problem,
                        problem_reason=new_item.problem_reason,
                        problem_notes=getattr(new_item, 'problem_notes', ''),
                        priority='high' if new_item.has_problem else 'normal',
                    )

                    allocated.append({
                        'requirement_id': str(new_req.id),
                        'project_id': str(new_item.project_id) if new_item.project_id else None,
                        'project_item_id': str(new_item.id),
                        'allocated_quantity': float(split_qty),
                    })
                    remaining = Decimal('0')
                    break

        return Response({'allocated': allocated, 'remaining': float(remaining)})
    
    @action(detail=False, methods=['post'])
    def receive(self, request):
        """Receive stock into warehouse."""
        serializer = StockReceiptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        data = serializer.validated_data
        
        try:
            with transaction.atomic():
                # Get or create stock item
                stock_item, created = StockItem.objects.get_or_create(
                    warehouse_id=data['warehouse_id'],
                    nomenclature_item_id=data['nomenclature_item_id'],
                    defaults={
                        'quantity': 0,
                        'unit': data.get('unit', 'шт'),
                        'location': data.get('location', ''),
                    }
                )
                
                if not created and data.get('location'):
                    stock_item.location = data['location']
                    stock_item.save()
                
                # Create batch if batch number provided
                batch = None
                if data.get('batch_number'):
                    batch = StockBatch.objects.create(
                        stock_item=stock_item,
                        batch_number=data['batch_number'],
                        initial_quantity=data['quantity'],
                        current_quantity=data['quantity'],
                        receipt_date=timezone.now().date(),
                        purchase_order_id=data.get('purchase_order_id'),
                        supplier_batch_number=data.get('supplier_batch_number', ''),
                        unit_cost=data.get('unit_cost'),
                        expiry_date=data.get('expiry_date'),
                    )
                
                # Update stock quantity
                old_quantity = stock_item.quantity
                stock_item.quantity += data['quantity']
                stock_item.save()
                
                # Create movement record
                movement = StockMovement.objects.create(
                    stock_item=stock_item,
                    movement_type='receipt',
                    quantity=data['quantity'],
                    balance_after=stock_item.quantity,
                    performed_by=request.user,
                    reason='Приёмка на склад',
                    notes=data.get('notes', ''),
                    source_document=f'batch:{batch.id}' if batch else '',
                )
                
                logger.info(
                    f"Stock received: {stock_item.nomenclature_item.name} "
                    f"+{data['quantity']} to warehouse {stock_item.warehouse.name}"
                )
                
                return Response({
                    'id': str(stock_item.id),
                    'quantity': stock_item.quantity,
                    'batch_id': str(batch.id) if batch else None,
                    'movement_id': str(movement.id),
                }, status=status.HTTP_201_CREATED)
                
        except Exception as e:
            logger.error(f"Error receiving stock: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'])
    def issue(self, request):
        """Issue stock from warehouse."""
        serializer = StockIssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        data = serializer.validated_data
        
        try:
            with transaction.atomic():
                stock_item = StockItem.objects.select_for_update().get(
                    id=data['stock_item_id']
                )
                
                quantity = data['quantity']
                
                # Check available quantity
                available = stock_item.available_quantity
                if quantity > available:
                    return Response(
                        {'error': f'Недостаточно товара на складе. Доступно: {available}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # If specific batch requested
                if data.get('batch_id'):
                    batch = StockBatch.objects.select_for_update().get(
                        id=data['batch_id']
                    )
                    if batch.current_quantity < quantity:
                        return Response(
                            {'error': f'Недостаточно товара в партии. Доступно: {batch.current_quantity}'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    batch.current_quantity -= quantity
                    batch.save()
                else:
                    # Deduct from oldest batches (FIFO)
                    remaining = quantity
                    batches = StockBatch.objects.filter(
                        stock_item=stock_item,
                        is_active=True,
                        current_quantity__gt=0
                    ).order_by('receipt_date')
                    
                    for batch in batches:
                        if remaining <= 0:
                            break
                        deduct = min(remaining, batch.current_quantity)
                        batch.current_quantity -= deduct
                        batch.save()
                        remaining -= deduct
                
                # Update stock quantity
                stock_item.quantity -= quantity
                stock_item.save()
                
                # Create movement record
                movement = StockMovement.objects.create(
                    stock_item=stock_item,
                    movement_type='issue',
                    quantity=quantity,
                    balance_after=stock_item.quantity,
                    project_id=data.get('project_id'),
                    project_item_id=data.get('project_item_id'),
                    performed_by=request.user,
                    reason=data.get('reason', 'Выдача со склада'),
                    notes=data.get('notes', ''),
                )
                
                logger.info(
                    f"Stock issued: {stock_item.nomenclature_item.name} "
                    f"-{quantity} from warehouse {stock_item.warehouse.name}"
                )
                
                return Response({
                    'id': str(stock_item.id),
                    'quantity': stock_item.quantity,
                    'movement_id': str(movement.id),
                }, status=status.HTTP_200_OK)
                
        except StockItem.DoesNotExist:
            return Response(
                {'error': 'Позиция склада не найдена'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error issuing stock: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['get'])
    def movements(self, request, pk=None):
        """Get movement history for stock item."""
        stock_item = self.get_object()
        movements = StockMovement.objects.filter(
            stock_item=stock_item
        ).order_by('-performed_at')[:100]
        
        serializer = StockMovementSerializer(movements, many=True)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        """
        Удаление позиции со склада.
        При удалении:
        - Все связанные резервы удаляются
        - Связанные проектные позиции со статусом "На складе" переводятся в "Ожидает заказа"
        - Связанные потребности также переводятся в "Ожидает заказа"
        """
        from infrastructure.persistence.models import MaterialRequirement
        
        stock_item = self.get_object()
        
        with transaction.atomic():
            # Найти все резервы для этой позиции склада
            reservations = StockReservation.objects.filter(
                stock_item=stock_item,
                status__in=['pending', 'confirmed']
            ).select_related('project_item')
            
            for reservation in reservations:
                project_item = reservation.project_item
                if project_item and project_item.purchase_status == 'closed':
                    # Вернуть статус на "Ожидает заказа"
                    project_item.purchase_status = 'waiting_order'
                    project_item.save(update_fields=['purchase_status', 'updated_at'])
                    
                    # Найти связанную потребность и также вернуть статус
                    MaterialRequirement.objects.filter(
                        project_item=project_item,
                        status='closed',
                        is_active=True,
                        deleted_at__isnull=True
                    ).update(status='waiting_order')
            
            # Удалить резервы
            reservations.delete()
            
            # Удалить позицию склада
            return super().destroy(request, *args, **kwargs)
    
    @action(detail=True, methods=['get'])
    def batches(self, request, pk=None):
        """Get active batches for stock item."""
        stock_item = self.get_object()
        
        batches = StockBatch.objects.filter(
            stock_item=stock_item,
            is_active=True
        ).order_by('-receipt_date')
        
        # Filter by has_stock
        has_stock = request.query_params.get('has_stock')
        if has_stock and has_stock.lower() == 'true':
            batches = batches.filter(current_quantity__gt=0)
        
        serializer = StockBatchSerializer(batches, many=True)
        return Response(serializer.data)


class StockBatchViewSet(viewsets.ModelViewSet):
    """ViewSet for StockBatch management."""
    
    queryset = StockBatch.objects.all()
    serializer_class = StockBatchSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.select_related('stock_item', 'stock_item__nomenclature_item')
        
        # Filter by stock item
        stock_item_id = self.request.query_params.get('stock_item')
        if stock_item_id:
            queryset = queryset.filter(stock_item_id=stock_item_id)
        
        # Filter by has stock
        has_stock = self.request.query_params.get('has_stock')
        if has_stock and has_stock.lower() == 'true':
            queryset = queryset.filter(current_quantity__gt=0)
        
        # Filter by active
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset


class StockMovementViewSet(viewsets.ModelViewSet):
    """ViewSet for StockMovement management."""
    
    queryset = StockMovement.objects.all()
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'delete']  # Movements can be removed manually
    
    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'stock_item', 'stock_item__warehouse', 'stock_item__nomenclature_item',
            'performed_by', 'project'
        ).order_by('-performed_at')
        
        # Filter by stock item
        stock_item_id = self.request.query_params.get('stock_item')
        if stock_item_id:
            queryset = queryset.filter(stock_item_id=stock_item_id)
        
        # Filter by warehouse
        warehouse_id = self.request.query_params.get('warehouse')
        if warehouse_id:
            queryset = queryset.filter(stock_item__warehouse_id=warehouse_id)
        
        # Filter by movement type
        movement_type = self.request.query_params.get('movement_type')
        if movement_type:
            queryset = queryset.filter(movement_type=movement_type)
        
        # Filter by project
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(performed_at__date__gte=date_from)
        
        date_to = self.request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(performed_at__date__lte=date_to)
        
        return queryset


class StockReservationViewSet(viewsets.ModelViewSet):
    """ViewSet for StockReservation management."""
    
    queryset = StockReservation.objects.all()
    serializer_class = StockReservationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'stock_item', 'stock_item__nomenclature_item',
            'project', 'project_item'
        )
        
        # Filter by stock item
        stock_item_id = self.request.query_params.get('stock_item')
        if stock_item_id:
            queryset = queryset.filter(stock_item_id=stock_item_id)
        
        # Filter by project
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        else:
            # По требованиям: в блок "Потребности" мигрируют только позиции со статусом "Ожидает заказа"
            queryset = queryset.filter(status='waiting_order')
        
        return queryset

    def create(self, request, *args, **kwargs):
        """Create reservation and update stock reserved quantity."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        stock_item = serializer.validated_data.get('stock_item')
        quantity = serializer.validated_data.get('quantity')
        status_value = serializer.validated_data.get('status') or 'pending'

        if stock_item and status_value in ['pending', 'confirmed']:
            if stock_item.available_quantity < quantity:
                return Response(
                    {'error': 'Недостаточно свободного остатка для резерва'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        self.perform_create(serializer)

        if stock_item and status_value in ['pending', 'confirmed']:
            stock_item.reserved_quantity += quantity
            stock_item.save(update_fields=['reserved_quantity'])

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm reservation - issue stock."""
        reservation = self.get_object()
        
        if reservation.status != 'pending':
            return Response(
                {'error': 'Резерв уже обработан'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                stock_item = reservation.stock_item
                
                if stock_item.available_quantity < reservation.quantity:
                    return Response(
                        {'error': 'Недостаточно товара на складе'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Issue stock
                stock_item.quantity -= reservation.quantity
                stock_item.reserved_quantity -= reservation.quantity
                stock_item.save()
                
                # Create movement
                StockMovement.objects.create(
                    stock_item=stock_item,
                    movement_type='issue',
                    quantity=reservation.quantity,
                    balance_after=stock_item.quantity,
                    project=reservation.project,
                    project_item=reservation.project_item,
                    performed_by=request.user,
                    reason='Выдача по резерву',
                )
                
                # Update reservation status
                reservation.status = 'confirmed'
                reservation.save()
                
                return Response({'status': 'confirmed'})
                
        except Exception as e:
            logger.error(f"Error confirming reservation: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel reservation."""
        reservation = self.get_object()
        
        if reservation.status != 'pending':
            return Response(
                {'error': 'Резерв уже обработан'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                stock_item = reservation.stock_item
                stock_item.reserved_quantity -= reservation.quantity
                stock_item.save()
                
                reservation.status = 'cancelled'
                reservation.save()
                
                return Response({'status': 'cancelled'})
                
        except Exception as e:
            logger.error(f"Error cancelling reservation: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    def destroy(self, request, *args, **kwargs):
        """
        Удаление резерва.
        При удалении:
        - Освобождается reserved_quantity на складе
        - Если проектная позиция со статусом "На складе" - переводится в "Ожидает заказа"
        - Связанная потребность также переводится в "Ожидает заказа"
        """
        from infrastructure.persistence.models import MaterialRequirement
        
        reservation = self.get_object()
        
        with transaction.atomic():
            # Освободить резерв на складе
            stock_item = reservation.stock_item
            if reservation.status in ['pending', 'confirmed']:
                stock_item.reserved_quantity = max(0, stock_item.reserved_quantity - reservation.quantity)
                stock_item.save(update_fields=['reserved_quantity'])
            
            # Если проектная позиция связана и закрыта - вернуть статус
            project_item = reservation.project_item
            if project_item and project_item.purchase_status == 'closed':
                # Проверить, есть ли другие активные резервы для этой позиции
                other_reservations = StockReservation.objects.filter(
                    project_item=project_item,
                    status__in=['pending', 'confirmed']
                ).exclude(id=reservation.id).exists()
                
                if not other_reservations:
                    # Нет других резервов - вернуть статус на "Ожидает заказа"
                    project_item.purchase_status = 'waiting_order'
                    project_item.save(update_fields=['purchase_status', 'updated_at'])
                    
                    # Обновить связанную потребность
                    MaterialRequirement.objects.filter(
                        project_item=project_item,
                        status='closed',
                        is_active=True,
                        deleted_at__isnull=True
                    ).update(status='waiting_order')
            
            # Удалить резерв
            return super().destroy(request, *args, **kwargs)


class InventoryDocumentViewSet(viewsets.ModelViewSet):
    """ViewSet for InventoryDocument management."""
    
    queryset = InventoryDocument.objects.all()
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action in ['list']:
            return InventoryDocumentListSerializer
        return InventoryDocumentDetailSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.select_related('warehouse', 'responsible')
        
        # Filter by warehouse
        warehouse_id = self.request.query_params.get('warehouse')
        if warehouse_id:
            queryset = queryset.filter(warehouse_id=warehouse_id)
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by document type
        doc_type = self.request.query_params.get('document_type')
        if doc_type:
            queryset = queryset.filter(document_type=doc_type)
        
        return queryset.order_by('-created_at')
    
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """Start inventory count - generate items from current stock."""
        document = self.get_object()
        
        if document.status != 'draft':
            return Response(
                {'error': 'Документ уже в работе или завершён'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                # Get stock items for warehouse
                stock_items = StockItem.objects.filter(
                    warehouse=document.warehouse,
                    quantity__gt=0
                )
                
                # Create inventory items
                for stock_item in stock_items:
                    InventoryItem.objects.create(
                        inventory_document=document,
                        stock_item=stock_item,
                        system_quantity=stock_item.quantity,
                        actual_quantity=None,  # To be filled during count
                        is_counted=False,
                    )
                
                document.status = 'in_progress'
                document.save()
                
                return Response({
                    'status': 'in_progress',
                    'items_count': stock_items.count()
                })
                
        except Exception as e:
            logger.error(f"Error starting inventory: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete inventory and apply adjustments."""
        document = self.get_object()
        
        if document.status != 'in_progress':
            return Response(
                {'error': 'Документ не в работе'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check all items counted
        uncounted = document.items.filter(is_counted=False).count()
        if uncounted > 0:
            return Response(
                {'error': f'Не все позиции подсчитаны. Осталось: {uncounted}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            document.complete(user=request.user)
            return Response({
                'status': 'completed',
                'actual_date': document.actual_date
            })
        except Exception as e:
            logger.error(f"Error completing inventory: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel inventory document."""
        document = self.get_object()
        
        if document.status == 'completed':
            return Response(
                {'error': 'Нельзя отменить завершённую инвентаризацию'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        document.status = 'cancelled'
        document.save()
        
        return Response({'status': 'cancelled'})


class InventoryItemViewSet(viewsets.ModelViewSet):
    """ViewSet for InventoryItem management."""
    
    queryset = InventoryItem.objects.all()
    serializer_class = InventoryItemSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'patch']  # Only update actual_quantity
    
    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'stock_item', 'stock_item__nomenclature_item', 'inventory_document'
        )
        
        # Filter by document
        document_id = self.request.query_params.get('document')
        if document_id:
            queryset = queryset.filter(inventory_document_id=document_id)
        
        # Filter by is_counted
        is_counted = self.request.query_params.get('is_counted')
        if is_counted is not None:
            queryset = queryset.filter(is_counted=is_counted.lower() == 'true')
        
        # Filter by has_difference
        has_difference = self.request.query_params.get('has_difference')
        if has_difference and has_difference.lower() == 'true':
            queryset = queryset.exclude(
                actual_quantity=F('system_quantity')
            ).filter(is_counted=True)
        
        return queryset
    
    def partial_update(self, request, *args, **kwargs):
        """Update actual quantity during inventory count."""
        instance = self.get_object()
        
        if instance.inventory_document.status != 'in_progress':
            return Response(
                {'error': 'Документ не в работе'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        actual_quantity = request.data.get('actual_quantity')
        if actual_quantity is not None:
            instance.actual_quantity = Decimal(str(actual_quantity))
            instance.is_counted = True
            instance.notes = request.data.get('notes', instance.notes)
            instance.save()
        
        serializer = self.get_serializer(instance)
        return Response(serializer.data)


class StockTransferViewSet(viewsets.ModelViewSet):
    """ViewSet for Stock Transfer management."""
    
    queryset = StockTransfer.objects.all()
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return StockTransferCreateSerializer
        if self.action == 'list':
            return StockTransferListSerializer
        return StockTransferDetailSerializer
    
    def create(self, request, *args, **kwargs):
        """Create transfer and return full detail serializer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        # Return using detail serializer
        detail_serializer = StockTransferDetailSerializer(instance, context={'request': request})
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)
    
    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'source_warehouse', 'destination_warehouse',
            'created_by', 'shipped_by', 'received_by'
        ).prefetch_related('items')
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by source warehouse
        source_warehouse = self.request.query_params.get('source_warehouse')
        if source_warehouse:
            queryset = queryset.filter(source_warehouse_id=source_warehouse)
        
        # Filter by destination warehouse
        destination_warehouse = self.request.query_params.get('destination_warehouse')
        if destination_warehouse:
            queryset = queryset.filter(destination_warehouse_id=destination_warehouse)
        
        # Search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(number__icontains=search) |
                Q(source_warehouse__name__icontains=search) |
                Q(destination_warehouse__name__icontains=search)
            )
        
        return queryset.order_by('-created_date')
    
    @action(detail=True, methods=['post'])
    def add_item(self, request, pk=None):
        """Add item to transfer document."""
        transfer = self.get_object()
        
        if transfer.status != 'draft':
            return Response(
                {'error': 'Можно добавлять позиции только в черновик'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stock_item_id = request.data.get('stock_item_id')
        quantity = request.data.get('quantity')
        
        if not stock_item_id or not quantity:
            return Response(
                {'error': 'Необходимо указать stock_item_id и quantity'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            stock_item = StockItem.objects.get(id=stock_item_id)
            
            # Validate stock item is from source warehouse
            if stock_item.warehouse_id != transfer.source_warehouse_id:
                return Response(
                    {'error': 'Позиция не принадлежит складу-отправителю'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            quantity = Decimal(str(quantity))
            
            # Validate quantity
            if quantity > stock_item.available_quantity:
                return Response(
                    {'error': f'Недостаточно товара. Доступно: {stock_item.available_quantity}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            item = StockTransferItem.objects.create(
                transfer=transfer,
                source_stock_item=stock_item,
                quantity=quantity,
                notes=request.data.get('notes', '')
            )
            
            serializer = StockTransferItemSerializer(item)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except StockItem.DoesNotExist:
            return Response(
                {'error': 'Позиция не найдена'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def remove_item(self, request, pk=None):
        """Remove item from transfer document."""
        transfer = self.get_object()
        
        if transfer.status != 'draft':
            return Response(
                {'error': 'Можно удалять позиции только из черновика'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        item_id = request.data.get('item_id')
        if not item_id:
            return Response(
                {'error': 'Необходимо указать item_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        deleted, _ = transfer.items.filter(id=item_id).delete()
        if deleted:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(
            {'error': 'Позиция не найдена'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit transfer for approval (change status to pending)."""
        transfer = self.get_object()
        
        if transfer.status != 'draft':
            return Response(
                {'error': 'Можно отправить только черновик'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if transfer.items.count() == 0:
            return Response(
                {'error': 'Документ пуст. Добавьте позиции'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        transfer.status = 'pending'
        transfer.save()
        
        serializer = self.get_serializer(transfer)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def ship(self, request, pk=None):
        """Ship the transfer (deduct from source warehouse)."""
        transfer = self.get_object()
        
        try:
            transfer.ship(user=request.user)
            serializer = self.get_serializer(transfer)
            return Response(serializer.data)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error shipping transfer: {e}")
            return Response(
                {'error': 'Ошибка при отправке перемещения'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        """Receive the transfer (add to destination warehouse)."""
        transfer = self.get_object()
        
        try:
            transfer.receive(user=request.user)
            serializer = self.get_serializer(transfer)
            return Response(serializer.data)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error receiving transfer: {e}")
            return Response(
                {'error': 'Ошибка при получении перемещения'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel the transfer."""
        transfer = self.get_object()
        
        if transfer.status in ['completed', 'in_transit']:
            return Response(
                {'error': 'Нельзя отменить перемещение в пути или завершённое'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        transfer.status = 'cancelled'
        transfer.save()
        
        serializer = self.get_serializer(transfer)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def create_for_warehouse_deletion(self, request):
        """Create transfer document for moving all items from a warehouse before deletion."""
        source_warehouse_id = request.data.get('source_warehouse_id')
        destination_warehouse_id = request.data.get('destination_warehouse_id')
        
        if not source_warehouse_id or not destination_warehouse_id:
            return Response(
                {'error': 'Необходимо указать source_warehouse_id и destination_warehouse_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if source_warehouse_id == destination_warehouse_id:
            return Response(
                {'error': 'Склад-отправитель и склад-получатель должны быть разными'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            source_warehouse = Warehouse.objects.get(id=source_warehouse_id)
            destination_warehouse = Warehouse.objects.get(id=destination_warehouse_id)
            
            # Get all items with positive quantity
            items_to_transfer = StockItem.objects.filter(
                warehouse=source_warehouse,
                quantity__gt=0
            )
            
            if not items_to_transfer.exists():
                return Response(
                    {'message': 'На складе нет позиций для перемещения'},
                    status=status.HTTP_200_OK
                )
            
            with transaction.atomic():
                # Generate number
                from django.utils import timezone
                today = timezone.now()
                count = StockTransfer.objects.filter(
                    created_date=today.date()
                ).count() + 1
                number = f"TR-{today.strftime('%Y%m%d')}-{count:04d}"
                
                # Create transfer document
                transfer = StockTransfer.objects.create(
                    number=number,
                    source_warehouse=source_warehouse,
                    destination_warehouse=destination_warehouse,
                    status='draft',
                    created_by=request.user,
                    reason=f'Перемещение перед удалением склада "{source_warehouse.name}"'
                )
                
                # Add all items
                for stock_item in items_to_transfer:
                    StockTransferItem.objects.create(
                        transfer=transfer,
                        source_stock_item=stock_item,
                        quantity=stock_item.quantity
                    )
                
                serializer = StockTransferDetailSerializer(transfer)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
                
        except Warehouse.DoesNotExist:
            return Response(
                {'error': 'Склад не найден'},
                status=status.HTTP_404_NOT_FOUND
            )


class MaterialRequirementViewSet(viewsets.ModelViewSet):
    """ViewSet for Material Requirement management."""
    
    queryset = MaterialRequirement.objects.all()
    serializer_class = MaterialRequirementModelSerializer
    permission_classes = [IsAuthenticated]
    
    # Увеличенная пагинация для потребностей
    from presentation.api.pagination import LargeResultsSetPagination
    pagination_class = LargeResultsSetPagination
    
    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'nomenclature_item', 
            'project', 
            'project_item', 
            'supplier',
            'problem_reason'
        )
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by priority
        priority = self.request.query_params.get('priority')
        if priority:
            queryset = queryset.filter(priority=priority)
        
        # Filter by supplier
        supplier_id = self.request.query_params.get('supplier')
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)
        
        # Filter by project
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        
        # Filter critical only
        critical_only = self.request.query_params.get('critical_only')
        if critical_only and critical_only.lower() == 'true':
            queryset = queryset.filter(
                Q(priority__in=['critical', 'high']) |
                Q(to_order__gt=0)
            )
        
        # Filter by category
        category_id = self.request.query_params.get('category')
        if category_id:
            queryset = queryset.filter(
                nomenclature_item__catalog_category_id=category_id
            )
        
        # Search
        search = self.request.query_params.get('search')
        if search:
            # Поддержка поиска по:
            # - наименованию/коду номенклатуры
            # - ID позиции проекта (project_item.item_number), включая значения вида "0000123"
            q = Q(nomenclature_item__name__icontains=search) | Q(nomenclature_item__code__icontains=search)

            try:
                import re
                m = re.search(r'\d+', str(search))
                if m:
                    num = int(m.group(0))
                    q = q | Q(project_item__item_number=num)
            except Exception:
                # Если что-то пошло не так с парсингом ID, просто игнорируем этот кусок.
                pass

            queryset = queryset.filter(q)
        
        return queryset.order_by('priority', '-to_order')

    def _update_problems(self, items):
        """Update problem status for requirements."""
        # Iterate over items (could be QuerySet or list)
        for req in items:
            # We only care if status is not closed (or closed to clear problem)
            # check_problems handles 'closed' logic too
            
            original_has_problem = req.has_problem
            original_reason_id = req.problem_reason_id
            
            req.check_problems()
            
            if (req.has_problem != original_has_problem or 
                req.problem_reason_id != original_reason_id):
                req.save(update_fields=['has_problem', 'problem_reason'])

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        page = self.paginate_queryset(queryset)
        if page is not None:
            self._update_problems(page)
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        self._update_problems(queryset)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def calculate(self, request):
        """Calculate or recalculate material requirements."""
        serializer = MaterialRequirementCalculateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        data = serializer.validated_data
        nomenclature_ids = data.get('nomenclature_item_ids', [])
        recalculate_all = data.get('recalculate_all', False)
        
        calculated = []
        
        try:
            with transaction.atomic():
                if recalculate_all or not nomenclature_ids:
                    # Calculate for all purchased items
                    purchased_items = NomenclatureItem.objects.filter(
                        catalog_category__is_purchased=True,
                        is_active=True
                    )
                    for item in purchased_items:
                        requirement = MaterialRequirement.calculate_for_item(item)
                        calculated.append(requirement)
                else:
                    # Calculate for specific items
                    for item_id in nomenclature_ids:
                        try:
                            item = NomenclatureItem.objects.get(id=item_id)
                            requirement = MaterialRequirement.calculate_for_item(item)
                            calculated.append(requirement)
                        except NomenclatureItem.DoesNotExist:
                            continue
                
                result_serializer = MaterialRequirementModelSerializer(
                    calculated, many=True
                )
                return Response({
                    'calculated_count': len(calculated),
                    'results': result_serializer.data
                })
                
        except Exception as e:
            logger.error(f"Error calculating requirements: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def sync_from_projects(self, request):
        """
        Синхронизировать потребности из активных проектов.
        
        Создаёт потребности для всех закупаемых позиций (is_purchased=True)
        из проектов в статусах 'planning' и 'in_progress'.
        """
        try:
            with transaction.atomic():
                synced = MaterialRequirement.sync_from_project_items()
                
                result_serializer = MaterialRequirementModelSerializer(
                    synced, many=True
                )
                return Response({
                    'synced_count': len(synced),
                    'results': result_serializer.data
                })
                
        except Exception as e:
            logger.error(f"Error syncing requirements from projects: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def available_for_order(self, request):
        """
        Получить потребности, доступные для добавления в заказ.
        
        Фильтрация по:
        - supplier: ID поставщика (обязательно)
        - project: ID проекта (опционально)
        
        Возвращает потребности в статусе waiting_order, 
        которые ещё не добавлены в заказ (purchase_order=null).
        """
        supplier_id = request.query_params.get('supplier')
        if not supplier_id:
            return Response(
                {'error': 'Параметр supplier обязателен'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        queryset = MaterialRequirement.objects.filter(
            supplier_id=supplier_id,
            status='waiting_order',
            purchase_order__isnull=True,
            to_order__gt=0,
            is_active=True,
            deleted_at__isnull=True
        ).select_related(
            'nomenclature_item',
            'project',
            'project_item',
            'supplier'
        )
        
        # Дополнительная фильтрация по проекту
        project_id = request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        
        # Поиск
        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(nomenclature_item__name__icontains=search) |
                Q(nomenclature_item__code__icontains=search)
            )
        
        queryset = queryset.order_by('-to_order', 'nomenclature_item__name')
        
        serializer = MaterialRequirementModelSerializer(queryset, many=True)
        return Response({
            'count': queryset.count(),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get summary of all material requirements."""
        requirements = self.get_queryset()
        
        summary = {
            'total_items': requirements.count(),
            'critical_items': requirements.filter(priority='critical').count(),
            'high_priority_items': requirements.filter(priority='high').count(),
            'items_to_order': requirements.filter(to_order__gt=0).count(),
            'total_to_order_value': requirements.aggregate(
                total=Sum('to_order')
            )['total'] or 0,
            'status_breakdown': {},
            'priority_breakdown': {},
        }
        
        # Status breakdown
        for status_choice, status_label in MaterialRequirement.STATUS_CHOICES:
            count = requirements.filter(status=status_choice).count()
            summary['status_breakdown'][status_choice] = {
                'label': status_label,
                'count': count
            }
        
        # Priority breakdown
        for priority_choice, priority_label in MaterialRequirement.PRIORITY_CHOICES:
            count = requirements.filter(priority=priority_choice).count()
            summary['priority_breakdown'][priority_choice] = {
                'label': priority_label,
                'count': count
            }
        
        return Response(summary)

    @action(detail=False, methods=['post'])
    def distribute_excess(self, request):
        """
        Распределить излишек по другим потребностям в активных проектах.
        """
        order_id = request.data.get('order_id')
        nomenclature_item_id = request.data.get('nomenclature_item_id')
        exclude_requirement_id = request.data.get('exclude_requirement_id')
        project_ids = request.data.get('project_ids', [])
        excess_qty = request.data.get('excess_quantity')

        if not order_id or not nomenclature_item_id or excess_qty is None:
            return Response(
                {'error': 'order_id, nomenclature_item_id, excess_quantity обязательны'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            excess_qty = Decimal(str(excess_qty))
        except Exception:
            return Response(
                {'error': 'Некорректное значение excess_quantity'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if excess_qty <= 0:
            return Response({'allocated': [], 'remaining': float(excess_qty)})

        from django.forms.models import model_to_dict
        from infrastructure.persistence.models import PurchaseOrder, Project, ProjectItem

        try:
            order = PurchaseOrder.objects.get(id=order_id)
        except PurchaseOrder.DoesNotExist:
            return Response({'error': 'Заказ не найден'}, status=status.HTTP_404_NOT_FOUND)

        # Только активные проекты в работе
        projects_qs = Project.objects.filter(status='in_progress')
        if project_ids:
            projects_qs = projects_qs.filter(id__in=project_ids)

        requirements_qs = MaterialRequirement.objects.filter(
            nomenclature_item_id=nomenclature_item_id,
            status='waiting_order',
            purchase_order__isnull=True,
            to_order__gt=0,
            project__in=projects_qs,
            project_item__isnull=False,
            is_active=True,
            deleted_at__isnull=True
        ).select_related('project', 'project_item', 'nomenclature_item')

        if exclude_requirement_id:
            requirements_qs = requirements_qs.exclude(id=exclude_requirement_id)

        requirements = list(requirements_qs)

        # Сортировка: по delivery_date (срок поставки) - самые срочные первыми
        # Затем по имени проекта/позиции, затем по id
        def sort_key(req):
            delivery = req.delivery_date or (req.project_item.required_date if req.project_item else None) or date.max
            project_name = req.project.name if req.project else ''
            item_name = req.project_item.name if req.project_item else ''
            return (delivery, project_name, item_name, str(req.id))

        requirements.sort(key=sort_key)

        allocated = []
        remaining = excess_qty

        with transaction.atomic():
            for req in requirements:
                if remaining <= 0:
                    break
                need = Decimal(str(req.to_order or 0))
                if need <= 0:
                    continue

                if remaining >= need:
                    take = need

                    req.purchase_order = order
                    req.status = 'in_order'
                    req.to_order = 0
                    req.save(update_fields=['purchase_order', 'status', 'to_order', 'updated_at'])

                    if req.project_item:
                        req.project_item.purchase_status = 'in_order'
                        req.project_item.save(update_fields=['purchase_status', 'updated_at'])

                    allocated.append({
                        'requirement_id': str(req.id),
                        'project_id': str(req.project_id) if req.project_id else None,
                        'project_item_id': str(req.project_item_id) if req.project_item_id else None,
                        'allocated_quantity': float(take),
                    })
                    remaining -= take
                else:
                    # Split project item and requirement for partial allocation
                    split_qty = remaining
                    project_item = req.project_item
                    if not project_item:
                        break

                    data = model_to_dict(project_item, exclude=[
                        'id', 'created_at', 'updated_at', 'deleted_at', 'version',
                        'item_number',
                        'created_by', 'updated_by', 'deleted_by',
                        'project', 'parent_item', 'nomenclature_item', 'bom_item',
                        'supplier', 'contractor', 'responsible', 'problem_reason', 'delay_reason'
                    ])
                    data['quantity'] = split_qty
                    data['purchase_status'] = 'in_order'

                    new_item = ProjectItem.objects.create(
                        project=project_item.project,
                        parent_item=project_item.parent_item,
                        nomenclature_item=project_item.nomenclature_item,
                        bom_item=project_item.bom_item,
                        supplier=project_item.supplier,
                        contractor=project_item.contractor,
                        responsible=project_item.responsible,
                        problem_reason=project_item.problem_reason,
                        delay_reason=project_item.delay_reason,
                        **data,
                        created_by=request.user,
                        updated_by=request.user
                    )

                    # Update original item quantity
                    project_item.quantity = Decimal(str(project_item.quantity)) - split_qty
                    project_item.save(update_fields=['quantity', 'updated_at'])

                    # Update original requirement quantities
                    total_available = StockItem.objects.filter(
                        nomenclature_item=project_item.nomenclature_item,
                    ).aggregate(total=Sum('quantity'))['total'] or 0

                    # Резервы ДРУГИХ позиций (не оригинальной)
                    total_reserved_others = StockReservation.objects.filter(
                        stock_item__nomenclature_item=project_item.nomenclature_item,
                        status__in=['pending', 'confirmed'],
                    ).exclude(project_item=project_item).aggregate(total=Sum('quantity'))['total'] or 0
                    
                    # Резервы для оригинальной позиции
                    reserved_for_original = StockReservation.objects.filter(
                        project_item=project_item,
                        status__in=['pending', 'confirmed'],
                    ).aggregate(total=Sum('quantity'))['total'] or 0
                    
                    free_stock = max(0, total_available - total_reserved_others)
                    already_covered = reserved_for_original + free_stock

                    req.total_required = project_item.quantity
                    req.total_available = total_available
                    req.total_reserved = total_reserved_others + reserved_for_original
                    req.to_order = max(0, project_item.quantity - already_covered)
                    req.save(update_fields=['total_required', 'total_available', 'total_reserved', 'to_order', 'updated_at'])

                    # Create new requirement linked to order
                    new_req = MaterialRequirement.objects.create(
                        project=new_item.project,
                        project_item=new_item,
                        nomenclature_item=new_item.nomenclature_item,
                        status='in_order',
                        order_by_date=new_item.order_date,
                        delivery_date=new_item.required_date,
                        supplier=new_item.supplier,
                        total_required=split_qty,
                        total_available=total_available,
                        total_reserved=total_reserved_others + reserved_for_original,
                        to_order=0,
                        purchase_order=order,
                        has_problem=new_item.has_problem,
                        problem_reason=new_item.problem_reason,
                        problem_notes=getattr(new_item, 'problem_notes', ''),
                        priority='high' if new_item.has_problem else 'normal',
                    )

                    allocated.append({
                        'requirement_id': str(new_req.id),
                        'project_id': str(new_item.project_id) if new_item.project_id else None,
                        'project_item_id': str(new_item.id),
                        'allocated_quantity': float(split_qty),
                    })
                    remaining = Decimal('0')
                    break

        return Response({
            'allocated': allocated,
            'remaining': float(remaining),
        })
    
    @action(detail=True, methods=['post'])
    def create_purchase_order(self, request, pk=None):
        """Create purchase order from material requirement."""
        requirement = self.get_object()
        
        if requirement.to_order <= 0:
            return Response(
                {'error': 'Нет потребности к заказу'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get supplier from request or use primary supplier
        supplier_id = request.data.get('supplier_id')
        
        try:
            from infrastructure.persistence.models import PurchaseOrder, PurchaseOrderItem
            
            with transaction.atomic():
                # Get supplier
                if supplier_id:
                    from infrastructure.persistence.models import Supplier
                    supplier = Supplier.objects.get(id=supplier_id)
                else:
                    # Use primary supplier
                    from infrastructure.persistence.models import NomenclatureSupplier
                    primary_supplier = NomenclatureSupplier.objects.filter(
                        nomenclature_item=requirement.nomenclature_item,
                        is_primary=True,
                        is_active=True
                    ).first()
                    
                    if not primary_supplier:
                        return Response(
                            {'error': 'Не найден поставщик. Укажите supplier_id'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    supplier = primary_supplier.supplier
                
                # Generate order number
                from django.utils import timezone
                today = timezone.now()
                count = PurchaseOrder.objects.filter(
                    created_at__date=today.date()
                ).count() + 1
                order_number = f"PO-{today.strftime('%Y%m%d')}-{count:04d}"
                
                # Create purchase order
                order = PurchaseOrder.objects.create(
                    number=order_number,
                    supplier=supplier,
                    status='draft',
                    created_by=request.user
                )
                
                # Add item
                PurchaseOrderItem.objects.create(
                    order=order,
                    nomenclature_item=requirement.nomenclature_item,
                    quantity=requirement.to_order,
                    unit=requirement.nomenclature_item.unit,
                    project_item=requirement.project_item,
                )
                
                # Link requirement to order
                requirement.purchase_order = order
                requirement.status = 'in_order'
                requirement.save(update_fields=['purchase_order', 'status', 'updated_at'])

                # Update project item status
                if requirement.project_item:
                    requirement.project_item.purchase_status = 'in_order'
                    requirement.project_item.save(update_fields=['purchase_status', 'updated_at'])
                
                return Response({
                    'purchase_order_id': str(order.id),
                    'purchase_order_number': order.number,
                    'message': 'Заказ на закупку создан'
                }, status=status.HTTP_201_CREATED)
                
        except Exception as e:
            logger.error(f"Error creating purchase order: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

# ===================== Contractor WriteOff ViewSet =====================

class ContractorWriteOffViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления передачами материалов подрядчикам.
    
    Согласно ERP-требованиям:
    - Списание материалов со склада при передаче подрядчику
    - Остатки изменяются только при подтверждении документа
    """
    
    queryset = ContractorWriteOff.objects.all()
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'contractor', 'warehouse', 'project', 'project_item'
        ).prefetch_related('items')
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by contractor
        contractor_id = self.request.query_params.get('contractor')
        if contractor_id:
            queryset = queryset.filter(contractor_id=contractor_id)
        
        # Filter by warehouse
        warehouse_id = self.request.query_params.get('warehouse')
        if warehouse_id:
            queryset = queryset.filter(warehouse_id=warehouse_id)
        
        # Filter by project
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        
        return queryset.order_by('-writeoff_date', '-created_at')
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ContractorWriteOffListSerializer
        elif self.action == 'create':
            return ContractorWriteOffCreateSerializer
        return ContractorWriteOffDetailSerializer
    
    def create(self, request, *args, **kwargs):
        """Create writeoff and return full detail serializer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        # Return using detail serializer
        detail_serializer = ContractorWriteOffDetailSerializer(instance, context={'request': request})
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Подтвердить передачу и списать материалы со склада."""
        writeoff = self.get_object()
        
        try:
            writeoff.confirm(user=request.user)
            serializer = ContractorWriteOffDetailSerializer(writeoff)
            return Response(serializer.data)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Отменить передачу."""
        writeoff = self.get_object()
        
        if writeoff.status != 'draft':
            return Response(
                {'error': 'Можно отменить только черновик'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        writeoff.status = 'cancelled'
        writeoff.save()
        
        serializer = ContractorWriteOffDetailSerializer(writeoff)
        return Response(serializer.data)


# ===================== Contractor Receipt ViewSet =====================

class ContractorReceiptViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления приёмками от подрядчиков.
    
    Согласно ERP-требованиям:
    - Оприходование изготовленных подрядчиком изделий
    - Остатки изменяются только при подтверждении документа
    - При подтверждении обновляется статус project_item
    """
    
    queryset = ContractorReceipt.objects.all()
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'contractor', 'warehouse', 'project', 'writeoff'
        ).prefetch_related('items')
        
        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter by contractor
        contractor_id = self.request.query_params.get('contractor')
        if contractor_id:
            queryset = queryset.filter(contractor_id=contractor_id)
        
        # Filter by warehouse
        warehouse_id = self.request.query_params.get('warehouse')
        if warehouse_id:
            queryset = queryset.filter(warehouse_id=warehouse_id)
        
        # Filter by project
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        
        return queryset.order_by('-receipt_date', '-created_at')
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ContractorReceiptListSerializer
        elif self.action == 'create':
            return ContractorReceiptCreateSerializer
        return ContractorReceiptDetailSerializer
    
    def create(self, request, *args, **kwargs):
        """Create receipt and return full detail serializer."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        # Return using detail serializer
        detail_serializer = ContractorReceiptDetailSerializer(instance, context={'request': request})
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Подтвердить приёмку и оприходовать изделия."""
        receipt = self.get_object()
        
        try:
            receipt.confirm(user=request.user)
            serializer = ContractorReceiptDetailSerializer(receipt)
            return Response(serializer.data)
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Отменить приёмку."""
        receipt = self.get_object()
        
        if receipt.status != 'draft':
            return Response(
                {'error': 'Можно отменить только черновик'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        receipt.status = 'cancelled'
        receipt.save()
        
        serializer = ContractorReceiptDetailSerializer(receipt)
        return Response(serializer.data)