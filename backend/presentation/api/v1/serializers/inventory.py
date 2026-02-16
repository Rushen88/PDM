"""
Inventory Serializers.

Serializers for warehouse and stock management.
"""

from rest_framework import serializers
from django.db.models import Sum
from infrastructure.persistence.models import (
    Warehouse,
    StockItem,
    StockReservation,
    StockMovement,
    StockBatch,
    InventoryDocument,
    InventoryItem,
    StockTransfer,
    StockTransferItem,
    MaterialRequirement,
    ProblemReason,
    ContractorWriteOff,
    ContractorWriteOffItem,
    ContractorReceipt,
    ContractorReceiptItem,
)
from .base import BaseModelSerializer


class WarehouseSerializer(BaseModelSerializer):
    """Serializer for Warehouse model."""
    
    items_count = serializers.SerializerMethodField()
    total_value = serializers.SerializerMethodField()
    
    class Meta:
        model = Warehouse
        fields = [
            'id', 'code', 'name', 'description', 'address',
            'is_active', 'items_count', 'total_value',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'code', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        """Auto-generate code from name if not provided."""
        import re
        
        name = validated_data.get('name', 'WH')
        
        # Transliterate Russian to Latin
        try:
            from transliterate import translit
            code_base = translit(name, 'ru', reversed=True)
        except (ImportError, Exception):
            # Fallback if transliterate is not installed
            code_base = name
        
        # Clean up: keep only alphanumeric, convert to upper, limit length
        code_base = re.sub(r'[^a-zA-Z0-9]', '', code_base).upper()[:10]
        
        if not code_base:
            code_base = 'WH'
        
        # Ensure uniqueness
        code = code_base
        counter = 1
        while Warehouse.all_objects.filter(code=code).exists():
            code = f"{code_base}{counter}"
            counter += 1
        
        validated_data['code'] = code
        return super().create(validated_data)
    
    def get_items_count(self, obj):
        return obj.stock_items.count()
    
    def get_total_value(self, obj):
        # This could be calculated based on unit costs
        return None


class StockBatchSerializer(BaseModelSerializer):
    """Serializer for StockBatch model."""
    
    is_empty = serializers.BooleanField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = StockBatch
        fields = [
            'id', 'stock_item', 'batch_number',
            'initial_quantity', 'current_quantity',
            'receipt_date', 'expiry_date',
            'supplier_batch_number', 'purchase_order',
            'unit_cost', 'is_active',
            'is_empty', 'is_expired',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_empty', 'is_expired', 'created_at', 'updated_at']


class StockItemListSerializer(BaseModelSerializer):
    """List serializer for StockItem."""
    
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    nomenclature_name = serializers.CharField(source='nomenclature_item.name', read_only=True)
    nomenclature_code = serializers.CharField(source='nomenclature_item.code', read_only=True)
    catalog_category = serializers.UUIDField(source='nomenclature_item.catalog_category_id', read_only=True)
    catalog_category_name = serializers.CharField(source='nomenclature_item.catalog_category.name', read_only=True)
    available_quantity = serializers.DecimalField(max_digits=15, decimal_places=3, read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = StockItem
        fields = [
            'id', 'warehouse', 'warehouse_name',
            'nomenclature_item', 'nomenclature_name', 'nomenclature_code',
            'catalog_category', 'catalog_category_name',
            'quantity', 'reserved_quantity', 'available_quantity',
            'unit', 'min_quantity', 'location',
            'is_low_stock', 'last_inventory_date'
        ]


class StockItemDetailSerializer(BaseModelSerializer):
    """Detail serializer for StockItem."""
    
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    nomenclature_name = serializers.CharField(source='nomenclature_item.name', read_only=True)
    nomenclature_code = serializers.CharField(source='nomenclature_item.code', read_only=True)
    catalog_category = serializers.UUIDField(source='nomenclature_item.catalog_category_id', read_only=True)
    catalog_category_name = serializers.CharField(source='nomenclature_item.catalog_category.name', read_only=True)
    available_quantity = serializers.DecimalField(max_digits=15, decimal_places=3, read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    batches = StockBatchSerializer(many=True, read_only=True)
    
    class Meta:
        model = StockItem
        fields = [
            'id', 'warehouse', 'warehouse_name',
            'nomenclature_item', 'nomenclature_name', 'nomenclature_code',
            'catalog_category', 'catalog_category_name',
            'quantity', 'reserved_quantity', 'available_quantity',
            'unit', 'min_quantity', 'location',
            'is_low_stock', 'last_inventory_date',
            'batches', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class StockReservationSerializer(BaseModelSerializer):
    """Serializer for StockReservation."""
    
    nomenclature_name = serializers.CharField(
        source='stock_item.nomenclature_item.name', read_only=True
    )
    project_name = serializers.CharField(source='project.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = StockReservation
        fields = [
            'id', 'stock_item', 'nomenclature_name',
            'project', 'project_name', 'project_item',
            'quantity', 'status', 'status_display',
            'required_date', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class StockMovementSerializer(BaseModelSerializer):
    """Serializer for StockMovement."""
    
    nomenclature_name = serializers.CharField(
        source='stock_item.nomenclature_item.name', read_only=True
    )
    warehouse_name = serializers.CharField(
        source='stock_item.warehouse.name', read_only=True
    )
    movement_type_display = serializers.CharField(
        source='get_movement_type_display', read_only=True
    )
    performed_by_name = serializers.CharField(
        source='performed_by.get_full_name', read_only=True
    )
    project_name = serializers.CharField(
        source='project.name', read_only=True, allow_null=True
    )
    
    class Meta:
        model = StockMovement
        fields = [
            'id', 'stock_item', 'nomenclature_name', 'warehouse_name',
            'movement_type', 'movement_type_display',
            'quantity', 'balance_after',
            'project', 'project_name', 'project_item',
            'destination_warehouse', 'source_document',
            'performed_by', 'performed_by_name', 'performed_at',
            'reason', 'notes'
        ]
        read_only_fields = ['id', 'balance_after', 'performed_at']


class InventoryItemSerializer(BaseModelSerializer):
    """Serializer for InventoryItem."""
    
    nomenclature_name = serializers.CharField(
        source='stock_item.nomenclature_item.name', read_only=True
    )
    nomenclature_code = serializers.CharField(
        source='stock_item.nomenclature_item.code', read_only=True
    )
    unit = serializers.CharField(source='stock_item.unit', read_only=True)
    location = serializers.CharField(source='stock_item.location', read_only=True)
    difference = serializers.DecimalField(
        max_digits=15, decimal_places=3, read_only=True
    )
    difference_percent = serializers.DecimalField(
        max_digits=8, decimal_places=2, read_only=True
    )
    
    class Meta:
        model = InventoryItem
        fields = [
            'id', 'inventory_document', 'stock_item',
            'nomenclature_name', 'nomenclature_code',
            'unit', 'location',
            'system_quantity', 'actual_quantity',
            'difference', 'difference_percent',
            'is_counted', 'notes'
        ]
        read_only_fields = ['id', 'difference', 'difference_percent']


class InventoryDocumentListSerializer(BaseModelSerializer):
    """List serializer for InventoryDocument."""
    
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    responsible_name = serializers.CharField(source='responsible.get_full_name', read_only=True)
    items_count = serializers.SerializerMethodField()
    counted_items = serializers.SerializerMethodField()
    
    class Meta:
        model = InventoryDocument
        fields = [
            'id', 'number', 'warehouse', 'warehouse_name',
            'document_type', 'document_type_display',
            'status', 'status_display',
            'planned_date', 'actual_date',
            'responsible', 'responsible_name',
            'items_count', 'counted_items'
        ]
    
    def get_items_count(self, obj):
        return obj.items.count()
    
    def get_counted_items(self, obj):
        return obj.items.filter(is_counted=True).count()


class InventoryDocumentDetailSerializer(BaseModelSerializer):
    """Detail serializer for InventoryDocument."""
    
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    responsible_name = serializers.CharField(source='responsible.get_full_name', read_only=True)
    items = InventoryItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = InventoryDocument
        fields = [
            'id', 'number', 'warehouse', 'warehouse_name',
            'document_type', 'document_type_display',
            'status', 'status_display',
            'planned_date', 'actual_date',
            'responsible', 'responsible_name',
            'commission_members', 'notes', 'result_notes',
            'items', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'number': {'required': False, 'allow_blank': True},
        }


class StockReceiptSerializer(serializers.Serializer):
    """Serializer for receiving stock into warehouse."""
    
    warehouse_id = serializers.UUIDField()
    nomenclature_item_id = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=15, decimal_places=3)
    unit = serializers.CharField(max_length=20, default='шт')
    batch_number = serializers.CharField(max_length=50, required=False)
    unit_cost = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, allow_null=True
    )
    purchase_order_id = serializers.UUIDField(required=False, allow_null=True)
    supplier_batch_number = serializers.CharField(max_length=100, required=False)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    location = serializers.CharField(max_length=100, required=False)
    notes = serializers.CharField(max_length=500, required=False)


class StockIssueSerializer(serializers.Serializer):
    """Serializer for issuing stock from warehouse."""
    
    stock_item_id = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=15, decimal_places=3)
    project_id = serializers.UUIDField(required=False, allow_null=True)
    project_item_id = serializers.UUIDField(required=False, allow_null=True)
    batch_id = serializers.UUIDField(required=False, allow_null=True, help_text="Specific batch to issue from")
    reason = serializers.CharField(max_length=500, required=False)
    notes = serializers.CharField(max_length=1000, required=False)


class MaterialRequirementSerializer(serializers.Serializer):
    """Serializer for material requirement calculation."""
    
    nomenclature_item_id = serializers.UUIDField()
    nomenclature_name = serializers.CharField(read_only=True)
    nomenclature_code = serializers.CharField(read_only=True)
    required_quantity = serializers.DecimalField(max_digits=15, decimal_places=3)
    available_quantity = serializers.DecimalField(max_digits=15, decimal_places=3, read_only=True)
    shortage = serializers.DecimalField(max_digits=15, decimal_places=3, read_only=True)
    unit = serializers.CharField(read_only=True)
    # For packaging items (e.g., cable sold in 100m spools)
    package_quantity = serializers.DecimalField(
        max_digits=15, decimal_places=3, read_only=True, allow_null=True
    )
    packages_needed = serializers.IntegerField(read_only=True, allow_null=True)
    remaining_in_current_package = serializers.DecimalField(
        max_digits=15, decimal_places=3, read_only=True, allow_null=True
    )


# =============================================================================
# Stock Transfer Serializers
# =============================================================================

class StockTransferItemSerializer(BaseModelSerializer):
    """Serializer for StockTransferItem."""
    
    nomenclature_name = serializers.CharField(
        source='source_stock_item.nomenclature_item.name', read_only=True
    )
    nomenclature_code = serializers.CharField(
        source='source_stock_item.nomenclature_item.code', read_only=True
    )
    unit = serializers.CharField(source='source_stock_item.unit', read_only=True)
    available_quantity = serializers.DecimalField(
        source='source_stock_item.available_quantity',
        max_digits=15, decimal_places=3, read_only=True
    )
    
    class Meta:
        model = StockTransferItem
        fields = [
            'id', 'transfer', 'source_stock_item', 'destination_stock_item',
            'nomenclature_name', 'nomenclature_code', 'unit',
            'quantity', 'available_quantity', 'notes'
        ]
        read_only_fields = ['id', 'destination_stock_item']


class StockTransferListSerializer(BaseModelSerializer):
    """List serializer for StockTransfer."""
    
    source_warehouse_name = serializers.CharField(source='source_warehouse.name', read_only=True)
    destination_warehouse_name = serializers.CharField(source='destination_warehouse.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    items_count = serializers.SerializerMethodField()
    
    class Meta:
        model = StockTransfer
        fields = [
            'id', 'number',
            'source_warehouse', 'source_warehouse_name',
            'destination_warehouse', 'destination_warehouse_name',
            'status', 'status_display',
            'created_date', 'shipped_date', 'received_date',
            'created_by', 'created_by_name',
            'items_count', 'reason'
        ]
    
    def get_items_count(self, obj):
        return obj.items.count()


class StockTransferDetailSerializer(BaseModelSerializer):
    """Detail serializer for StockTransfer."""
    
    source_warehouse_name = serializers.CharField(source='source_warehouse.name', read_only=True)
    destination_warehouse_name = serializers.CharField(source='destination_warehouse.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    shipped_by_name = serializers.CharField(source='shipped_by.get_full_name', read_only=True, allow_null=True)
    received_by_name = serializers.CharField(source='received_by.get_full_name', read_only=True, allow_null=True)
    items = StockTransferItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = StockTransfer
        fields = [
            'id', 'number',
            'source_warehouse', 'source_warehouse_name',
            'destination_warehouse', 'destination_warehouse_name',
            'status', 'status_display',
            'created_date', 'shipped_date', 'received_date',
            'created_by', 'created_by_name',
            'shipped_by', 'shipped_by_name',
            'received_by', 'received_by_name',
            'reason', 'notes', 'items',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class StockTransferCreateSerializer(BaseModelSerializer):
    """Serializer for creating StockTransfer."""
    
    items = StockTransferItemSerializer(many=True, required=False)
    
    class Meta:
        model = StockTransfer
        fields = [
            'source_warehouse', 'destination_warehouse',
            'reason', 'notes', 'items'
        ]
    
    def validate(self, attrs):
        if attrs.get('source_warehouse') == attrs.get('destination_warehouse'):
            raise serializers.ValidationError(
                "Склад-отправитель и склад-получатель должны быть разными"
            )
        return attrs
    
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        
        # Generate unique number
        from django.utils import timezone
        from django.db.models import Max
        import re
        
        today = timezone.now()
        prefix = f"TR-{today.strftime('%Y%m%d')}-"
        
        # Найти максимальный номер за сегодня (учитывая и удалённые)
        last_number = StockTransfer.all_objects.filter(
            number__startswith=prefix
        ).aggregate(max_num=Max('number'))['max_num']
        
        if last_number:
            match = re.search(r'TR-\d{8}-(\d+)', last_number)
            next_num = int(match.group(1)) + 1 if match else 1
        else:
            next_num = 1
        
        number = f"{prefix}{next_num:04d}"
        
        validated_data['number'] = number
        validated_data['created_by'] = self.context['request'].user
        
        transfer = StockTransfer.objects.create(**validated_data)
        
        for item_data in items_data:
            StockTransferItem.objects.create(transfer=transfer, **item_data)
        
        return transfer


# =============================================================================
# Material Requirement Model Serializers
# =============================================================================

class ProblemReasonSerializer(BaseModelSerializer):
    """Serializer for ProblemReason reference."""
    
    class Meta:
        model = ProblemReason
        fields = ['id', 'code', 'name', 'description', 'is_system', 'is_active']
        read_only_fields = ['id']


class MaterialRequirementModelSerializer(BaseModelSerializer):
    """
    Serializer for MaterialRequirement model.
    
    Согласно ERP-требованиям:
    - Статус = фактическое состояние (waiting_order, in_order, closed)
    - Проблема = отдельный флаг с причиной из справочника
    - Одна потребность = один заказ
    """
    
    nomenclature_name = serializers.CharField(
        source='nomenclature_item.name', read_only=True
    )
    nomenclature_code = serializers.CharField(
        source='nomenclature_item.code', read_only=True
    )
    nomenclature_detail = serializers.SerializerMethodField()
    unit = serializers.CharField(
        source='nomenclature_item.unit', read_only=True
    )
    
    # Связь с проектом
    project_detail = serializers.SerializerMethodField()
    project_item_detail = serializers.SerializerMethodField()
    bom_item_detail = serializers.SerializerMethodField()
    project_item_number = serializers.SerializerMethodField()
    
    # Связь с поставщиком
    supplier_detail = serializers.SerializerMethodField()
    
    # Связь с заказом (один заказ на одну потребность)
    purchase_order_detail = serializers.SerializerMethodField()
    
    # Флаг и причина проблемы
    problem_reason_detail = ProblemReasonSerializer(source='problem_reason', read_only=True)
    
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    deficit = serializers.DecimalField(max_digits=15, decimal_places=3, read_only=True)
    is_critical = serializers.BooleanField(read_only=True)
    free_available = serializers.SerializerMethodField()

    def get_project_item_number(self, obj):
        if obj.project_item_id:
            try:
                return obj.project_item.item_number
            except Exception:
                return None
        return None
    
    class Meta:
        model = MaterialRequirement
        fields = [
            'id', 'nomenclature_item', 'nomenclature_name', 'nomenclature_code', 
            'nomenclature_detail', 'unit',
            # Связь с проектом
            'project', 'project_detail',
            'project_item', 'project_item_detail', 'project_item_number',
            'bom_item', 'bom_item_detail',
            # Даты ERP
            'calculation_date', 'order_by_date', 'delivery_date',
            # Связь с поставщиком
            'supplier', 'supplier_detail',
            # Связь с заказом
            'purchase_order', 'purchase_order_detail',
            # Количества
            'total_required', 'total_available', 'total_reserved', 'total_in_order', 'to_order',
            'free_available',
            'safety_stock', 'lead_time_days',
            'avg_daily_consumption', 'days_until_depletion', 'reorder_date',
            # Статус и приоритет
            'status', 'status_display', 'priority', 'priority_display',
            # Флаг проблемы
            'has_problem', 'problem_reason', 'problem_reason_detail', 'problem_notes',
            # Вычисляемые
            'deficit', 'is_critical',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'calculation_date', 'total_required', 'total_available',
            'total_reserved', 'total_in_order', 'to_order',
            'free_available',
            'avg_daily_consumption', 'days_until_depletion', 'reorder_date',
            'deficit', 'is_critical', 'has_problem', 'problem_reason',
            'created_at', 'updated_at'
        ]

    def get_free_available(self, obj):
        total_available = obj.total_available or 0
        total_reserved = obj.total_reserved or 0
        free_available = total_available - total_reserved
        return free_available if free_available > 0 else 0
    
    def get_nomenclature_detail(self, obj):
        if obj.nomenclature_item:
            return {
                'id': str(obj.nomenclature_item.id),
                'code': obj.nomenclature_item.code,
                'name': obj.nomenclature_item.name,
            }
        return None
    
    def get_project_detail(self, obj):
        if obj.project:
            return {
                'id': str(obj.project.id),
                'name': obj.project.name,
            }
        return None
    
    def get_project_item_detail(self, obj):
        if obj.project_item:
            return {
                'id': str(obj.project_item.id),
                'full_path': str(obj.project_item),
                'parent_id': str(obj.project_item.parent_item_id) if obj.project_item.parent_item_id else None,
                'parent_name': obj.project_item.parent_item.name if obj.project_item.parent_item else None,
            }
        return None
    
    def get_bom_item_detail(self, obj):
        if obj.bom_item:
            return {
                'id': str(obj.bom_item.id),
                'path': str(obj.bom_item),
            }
        return None
    
    def get_supplier_detail(self, obj):
        if obj.supplier:
            return {
                'id': str(obj.supplier.id),
                'name': obj.supplier.name,
            }
        return None
    
    def get_purchase_order_detail(self, obj):
        if obj.purchase_order:
            return {
                'id': str(obj.purchase_order.id),
                'number': obj.purchase_order.number,
                'status': obj.purchase_order.status,
            }
        return None


class MaterialRequirementCalculateSerializer(serializers.Serializer):
    """Serializer for triggering material requirement calculation."""
    
    nomenclature_item_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        help_text="List of nomenclature item IDs to calculate. If empty, calculates for all items."
    )
    recalculate_all = serializers.BooleanField(
        default=False,
        help_text="If true, recalculates for all purchased items."
    )

# ===================== Contractor WriteOff Serializers =====================

class ContractorWriteOffItemSerializer(BaseModelSerializer):
    """Serializer for ContractorWriteOffItem."""
    
    nomenclature_detail = serializers.SerializerMethodField()
    stock_item_detail = serializers.SerializerMethodField()
    
    class Meta:
        model = ContractorWriteOffItem
        fields = [
            'id', 'writeoff', 'nomenclature_item', 'stock_item',
            'quantity', 'unit', 'notes',
            'nomenclature_detail', 'stock_item_detail',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_nomenclature_detail(self, obj):
        if obj.nomenclature_item:
            return {
                'id': str(obj.nomenclature_item.id),
                'code': obj.nomenclature_item.code,
                'name': obj.nomenclature_item.name,
            }
        return None
    
    def get_stock_item_detail(self, obj):
        if obj.stock_item:
            return {
                'id': str(obj.stock_item.id),
                'quantity': str(obj.stock_item.quantity),
                'warehouse': obj.stock_item.warehouse.name if obj.stock_item.warehouse else None,
            }
        return None


class ContractorWriteOffListSerializer(BaseModelSerializer):
    """List serializer for ContractorWriteOff."""
    
    contractor_detail = serializers.SerializerMethodField()
    warehouse_detail = serializers.SerializerMethodField()
    project_detail = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()
    
    class Meta:
        model = ContractorWriteOff
        fields = [
            'id', 'number', 'contractor', 'warehouse', 'project',
            'status', 'writeoff_date', 'notes',
            'contractor_detail', 'warehouse_detail', 'project_detail',
            'items_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'number', 'created_at', 'updated_at']
    
    def get_contractor_detail(self, obj):
        if obj.contractor:
            return {
                'id': str(obj.contractor.id),
                'name': obj.contractor.name,
            }
        return None
    
    def get_warehouse_detail(self, obj):
        if obj.warehouse:
            return {
                'id': str(obj.warehouse.id),
                'name': obj.warehouse.name,
            }
        return None
    
    def get_project_detail(self, obj):
        if obj.project:
            return {
                'id': str(obj.project.id),
                'name': obj.project.name,
            }
        return None
    
    def get_items_count(self, obj):
        return obj.items.count()


class ContractorWriteOffDetailSerializer(ContractorWriteOffListSerializer):
    """Detail serializer for ContractorWriteOff."""
    
    items = ContractorWriteOffItemSerializer(many=True, read_only=True)
    
    class Meta(ContractorWriteOffListSerializer.Meta):
        fields = ContractorWriteOffListSerializer.Meta.fields + ['items']


class ContractorWriteOffCreateSerializer(BaseModelSerializer):
    """Create serializer for ContractorWriteOff."""
    
    items = ContractorWriteOffItemSerializer(many=True, required=False)
    
    class Meta:
        model = ContractorWriteOff
        fields = [
            'contractor', 'warehouse', 'project', 'project_item',
            'writeoff_date', 'notes', 'items'
        ]
    
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        writeoff = ContractorWriteOff.objects.create(**validated_data)
        
        for item_data in items_data:
            ContractorWriteOffItem.objects.create(writeoff=writeoff, **item_data)
        
        return writeoff


# ===================== Contractor Receipt Serializers =====================

class ContractorReceiptItemSerializer(BaseModelSerializer):
    """Serializer for ContractorReceiptItem."""
    
    nomenclature_detail = serializers.SerializerMethodField()
    
    class Meta:
        model = ContractorReceiptItem
        fields = [
            'id', 'receipt', 'nomenclature_item',
            'quantity', 'unit', 'notes',
            'nomenclature_detail',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_nomenclature_detail(self, obj):
        if obj.nomenclature_item:
            return {
                'id': str(obj.nomenclature_item.id),
                'code': obj.nomenclature_item.code,
                'name': obj.nomenclature_item.name,
            }
        return None


class ContractorReceiptListSerializer(BaseModelSerializer):
    """List serializer for ContractorReceipt."""
    
    contractor_detail = serializers.SerializerMethodField()
    warehouse_detail = serializers.SerializerMethodField()
    project_detail = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()
    
    class Meta:
        model = ContractorReceipt
        fields = [
            'id', 'number', 'contractor', 'warehouse', 'project',
            'status', 'receipt_date', 'notes',
            'contractor_detail', 'warehouse_detail', 'project_detail',
            'items_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'number', 'created_at', 'updated_at']
    
    def get_contractor_detail(self, obj):
        if obj.contractor:
            return {
                'id': str(obj.contractor.id),
                'name': obj.contractor.name,
            }
        return None
    
    def get_warehouse_detail(self, obj):
        if obj.warehouse:
            return {
                'id': str(obj.warehouse.id),
                'name': obj.warehouse.name,
            }
        return None
    
    def get_project_detail(self, obj):
        if obj.project:
            return {
                'id': str(obj.project.id),
                'name': obj.project.name,
            }
        return None
    
    def get_items_count(self, obj):
        return obj.items.count()


class ContractorReceiptDetailSerializer(ContractorReceiptListSerializer):
    """Detail serializer for ContractorReceipt."""
    
    items = ContractorReceiptItemSerializer(many=True, read_only=True)
    
    class Meta(ContractorReceiptListSerializer.Meta):
        fields = ContractorReceiptListSerializer.Meta.fields + ['items']


class ContractorReceiptCreateSerializer(BaseModelSerializer):
    """Create serializer for ContractorReceipt."""
    
    items = ContractorReceiptItemSerializer(many=True, required=False)
    
    class Meta:
        model = ContractorReceipt
        fields = [
            'contractor', 'warehouse', 'project', 'writeoff',
            'receipt_date', 'notes', 'items'
        ]
    
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        receipt = ContractorReceipt.objects.create(**validated_data)
        
        for item_data in items_data:
            ContractorReceiptItem.objects.create(receipt=receipt, **item_data)
        
        return receipt