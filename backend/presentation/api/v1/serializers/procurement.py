"""
Procurement API Serializers.

Serializers for purchase orders and procurement tracking.
"""

from rest_framework import serializers
from django.db import transaction

from infrastructure.persistence.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    Supplier,
    NomenclatureItem,
    Project,
    ProjectItem,
)


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    """Serializer for purchase order items."""
    
    nomenclature_detail = serializers.SerializerMethodField()
    project_item_detail = serializers.SerializerMethodField()
    material_requirement = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    material_requirement_detail = serializers.SerializerMethodField()
    material_requirement_id = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = PurchaseOrderItem
        fields = [
            'id',
            'order',
            'nomenclature_item',
            'nomenclature_detail',
            'project_item',
            'project_item_detail',
            'material_requirement',
            'material_requirement_detail',
            'material_requirement_id',
            'quantity',
            'unit',
            'delivered_quantity',
            'unit_price',
            'total_price',
            'article_number',
            'status',
            'status_display',
            'expected_delivery_date',
            'actual_delivery_date',
            'notes',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'total_price']
    
    def get_nomenclature_detail(self, obj):
        if obj.nomenclature_item:
            return {
                'id': str(obj.nomenclature_item.id),
                'name': obj.nomenclature_item.name,
            }
        return None
    
    def get_project_item_detail(self, obj):
        if obj.project_item:
            project = obj.project_item.project
            return {
                'id': str(obj.project_item.id),
                'project_name': project.name if project else None,
            }
        return None
    
    def create(self, validated_data):
        """Создание позиции заказа с привязкой потребности."""
        from infrastructure.persistence.models import MaterialRequirement
        
        requirement_id = validated_data.pop('material_requirement', None)
        item = super().create(validated_data)
        
        # Связать потребность с заказом
        if requirement_id:
            MaterialRequirement.objects.filter(
                id=requirement_id
            ).update(purchase_order=item.order)
        
        return item

    def get_material_requirement_detail(self, obj):
        from infrastructure.persistence.models import MaterialRequirement

        requirement = MaterialRequirement.objects.filter(
            purchase_order=obj.order,
            project_item=obj.project_item,
            nomenclature_item=obj.nomenclature_item,
            is_active=True,
            deleted_at__isnull=True
        ).first()
        if requirement:
            return {
                'id': str(requirement.id),
                'project_item_number': requirement.project_item.item_number if requirement.project_item_id else None,
                'status': requirement.status,
                'status_display': requirement.get_status_display(),
                'order_by_date': requirement.order_by_date,
            }
        return None

    def get_material_requirement_id(self, obj):
        from infrastructure.persistence.models import MaterialRequirement

        requirement = MaterialRequirement.objects.filter(
            purchase_order=obj.order,
            project_item=obj.project_item,
            nomenclature_item=obj.nomenclature_item,
            is_active=True,
            deleted_at__isnull=True
        ).first()
        return str(requirement.id) if requirement else None


class PurchaseOrderListSerializer(serializers.ModelSerializer):
    """Serializer for purchase order list."""
    
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True, allow_null=True)
    items_count = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = PurchaseOrder
        fields = [
            'id',
            'number',
            'supplier',
            'supplier_name',
            'project',
            'project_name',
            'status',
            'status_display',
            'order_date',
            'expected_delivery_date',
            'actual_delivery_date',
            'total_amount',
            'currency',
            'items_count',
            'is_active',
            'created_at',
        ]
    
    def get_items_count(self, obj):
        return obj.items.count()


class PurchaseOrderDetailSerializer(serializers.ModelSerializer):
    """Serializer for purchase order detail."""
    
    supplier_detail = serializers.SerializerMethodField()
    project_detail = serializers.SerializerMethodField()
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = PurchaseOrder
        fields = [
            'id',
            'number',
            'supplier',
            'supplier_detail',
            'project',
            'project_detail',
            'status',
            'status_display',
            'order_date',
            'expected_delivery_date',
            'actual_delivery_date',
            'total_amount',
            'currency',
            'payment_terms',
            'payment_status',
            'notes',
            'items',
            'is_active',
            'created_at',
            'updated_at',
            'created_by',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']
    
    def get_supplier_detail(self, obj):
        if obj.supplier:
            return {
                'id': str(obj.supplier.id),
                'code': getattr(obj.supplier, 'code', None),
                'name': obj.supplier.name,
                'inn': getattr(obj.supplier, 'inn', None),
            }
        return None
    
    def get_project_detail(self, obj):
        if obj.project:
            return {
                'id': str(obj.project.id),
                'name': obj.project.name,
            }
        return None


class PurchaseOrderCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating purchase orders.
    
    Номер присваивается автоматически в формате З-XXXX.
    """
    
    class Meta:
        model = PurchaseOrder
        fields = [
            'id',
            'number',
            'supplier',
            'project',
            'status',
            'order_date',
            'expected_delivery_date',
            'total_amount',
            'currency',
            'payment_terms',
            'notes',
        ]
        read_only_fields = ['id', 'number']
    
    def create(self, validated_data):
        from django.db.models import Max
        import re
        
        validated_data['created_by'] = self.context['request'].user
        
        # Автоматическая генерация номера в формате З-XXXX
        # Находим максимальный номер и увеличиваем на 1
        last_order = PurchaseOrder.all_objects.filter(
            number__regex=r'^З-\d{4}$'
        ).aggregate(max_num=Max('number'))['max_num']
        
        if last_order:
            match = re.search(r'З-(\d{4})', last_order)
            next_num = int(match.group(1)) + 1 if match else 1
        else:
            next_num = 1
        
        validated_data['number'] = f'З-{next_num:04d}'
        
        return super().create(validated_data)


class ProcurementScheduleItemSerializer(serializers.Serializer):
    """Serializer for procurement schedule (what needs to be ordered)."""
    
    id = serializers.UUIDField()
    project_id = serializers.UUIDField()
    project_name = serializers.CharField()
    nomenclature_id = serializers.UUIDField()
    name = serializers.CharField()
    required_quantity = serializers.DecimalField(max_digits=15, decimal_places=3)
    ordered_quantity = serializers.DecimalField(max_digits=15, decimal_places=3)
    received_quantity = serializers.DecimalField(max_digits=15, decimal_places=3)
    remaining_quantity = serializers.DecimalField(max_digits=15, decimal_places=3)
    unit = serializers.CharField()
    required_date = serializers.DateField(allow_null=True)
    status = serializers.CharField()
    supplier_id = serializers.UUIDField(allow_null=True)
    supplier_name = serializers.CharField(allow_null=True)


class ProcurementStatsSerializer(serializers.Serializer):
    """Serializer for procurement statistics."""
    
    total_items = serializers.IntegerField()
    pending = serializers.IntegerField()
    ordered = serializers.IntegerField()
    in_transit = serializers.IntegerField()
    delivered = serializers.IntegerField()
    overdue = serializers.IntegerField()
    total_orders = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=15, decimal_places=2, allow_null=True)


# =========================================================
# Goods Receipt Serializers (Поступления)
# =========================================================

class GoodsReceiptItemSerializer(serializers.ModelSerializer):
    """Serializer for goods receipt items."""
    
    purchase_order_item_detail = serializers.SerializerMethodField()
    nomenclature_detail = serializers.SerializerMethodField()
    
    class Meta:
        from infrastructure.persistence.models import GoodsReceiptItem
        model = GoodsReceiptItem
        fields = [
            'id',
            'goods_receipt',
            'purchase_order_item',
            'purchase_order_item_detail',
            'nomenclature_detail',
            'quantity',
            'batch_number',
            'notes',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'goods_receipt': {'required': False, 'allow_null': True},
        }
    
    def get_purchase_order_item_detail(self, obj):
        poi = obj.purchase_order_item
        return {
            'id': str(poi.id),
            'ordered_quantity': float(poi.quantity),
            'delivered_quantity': float(poi.delivered_quantity),
            'remaining_quantity': float(poi.remaining_quantity),
        }
    
    def get_nomenclature_detail(self, obj):
        ni = obj.purchase_order_item.nomenclature_item
        if ni:
            return {
                'id': str(ni.id),
                'name': ni.name,
            }
        return None


class GoodsReceiptListSerializer(serializers.ModelSerializer):
    """Serializer for goods receipt list."""
    
    purchase_order_number = serializers.CharField(source='purchase_order.number', read_only=True)
    supplier_name = serializers.CharField(source='purchase_order.supplier.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    items_count = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        from infrastructure.persistence.models import GoodsReceipt
        model = GoodsReceipt
        fields = [
            'id',
            'number',
            'purchase_order',
            'purchase_order_number',
            'supplier_name',
            'warehouse',
            'warehouse_name',
            'status',
            'status_display',
            'receipt_date',
            'items_count',
            'is_active',
            'created_at',
        ]
    
    def get_items_count(self, obj):
        return obj.items.count()


class GoodsReceiptDetailSerializer(serializers.ModelSerializer):
    """Serializer for goods receipt detail."""
    
    purchase_order_detail = serializers.SerializerMethodField()
    warehouse_detail = serializers.SerializerMethodField()
    received_by_detail = serializers.SerializerMethodField()
    items = GoodsReceiptItemSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        from infrastructure.persistence.models import GoodsReceipt
        model = GoodsReceipt
        fields = [
            'id',
            'number',
            'purchase_order',
            'purchase_order_detail',
            'warehouse',
            'warehouse_detail',
            'status',
            'status_display',
            'receipt_date',
            'received_by',
            'received_by_detail',
            'notes',
            'items',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'status']
    
    def get_purchase_order_detail(self, obj):
        po = obj.purchase_order
        return {
            'id': str(po.id),
            'number': po.number,
            'supplier_name': po.supplier.name if po.supplier else None,
            'status': po.status,
            'status_display': po.get_status_display() if po else None,
        }
    
    def get_warehouse_detail(self, obj):
        w = obj.warehouse
        return {
            'id': str(w.id),
            'code': w.code,
            'name': w.name,
        }
    
    def get_received_by_detail(self, obj):
        if obj.received_by:
            return {
                'id': str(obj.received_by.id),
                'username': obj.received_by.username,
                'full_name': obj.received_by.get_full_name(),
            }
        return None


class GoodsReceiptCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating goods receipts."""
    
    items = GoodsReceiptItemSerializer(many=True, required=False)
    number = serializers.CharField(required=False, allow_blank=True)
    
    class Meta:
        from infrastructure.persistence.models import GoodsReceipt
        model = GoodsReceipt
        fields = [
            'number',
            'purchase_order',
            'warehouse',
            'receipt_date',
            'received_by',
            'notes',
            'items',
        ]
    
    def create(self, validated_data):
        from infrastructure.persistence.models import GoodsReceiptItem
        items_data = validated_data.pop('items', [])
        
        with transaction.atomic():
            receipt = super().create(validated_data)
            
            for item_data in items_data:
                item_data['goods_receipt'] = receipt
                GoodsReceiptItem.objects.create(**item_data)
        
        return receipt

