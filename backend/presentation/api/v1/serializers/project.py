"""
Project Serializers.

Serializers for projects (STANDs) and project items.
"""

import uuid

from rest_framework import serializers
from django.db import models as db_models
from django.utils import timezone
from infrastructure.persistence.models import (
    Project,
    ProjectItem,
    PurchaseOrderItem,
    ManufacturingProblemReason,
    ManufacturingProblemSubreason,
    PurchaseProblemReason,
    PurchaseProblemSubreason,
)
from infrastructure.persistence.models import MaterialRequirement
from .base import BaseModelSerializer, UserMinimalSerializer
from .catalog import (
    NomenclatureMinimalSerializer,
    NomenclatureListSerializer,
    ContractorMinimalSerializer,
    SupplierMinimalSerializer,
    DelayReasonMinimalSerializer,
)
from .bom import BOMStructureListSerializer


class _ReasonMinimalSerializer(BaseModelSerializer):
    class Meta:
        fields = ['id', 'name']


class ManufacturingProblemReasonMinimalSerializer(_ReasonMinimalSerializer):
    class Meta(_ReasonMinimalSerializer.Meta):
        model = ManufacturingProblemReason


class ManufacturingProblemSubreasonMinimalSerializer(_ReasonMinimalSerializer):
    class Meta(_ReasonMinimalSerializer.Meta):
        model = ManufacturingProblemSubreason


class PurchaseProblemReasonMinimalSerializer(_ReasonMinimalSerializer):
    class Meta(_ReasonMinimalSerializer.Meta):
        model = PurchaseProblemReason


class PurchaseProblemSubreasonMinimalSerializer(_ReasonMinimalSerializer):
    class Meta(_ReasonMinimalSerializer.Meta):
        model = PurchaseProblemSubreason


class ProjectItemListSerializer(BaseModelSerializer):
    """List serializer for project items."""
    
    nomenclature_item_detail = NomenclatureMinimalSerializer(
        source='nomenclature_item',
        read_only=True
    )
    category_display = serializers.SerializerMethodField()
    # Category sort order for hierarchical sorting
    category_sort_order = serializers.SerializerMethodField()
    
    manufacturing_status_display = serializers.CharField(
        source='get_manufacturing_status_display',
        read_only=True
    )
    contractor_status_display = serializers.CharField(
        source='get_contractor_status_display',
        read_only=True
    )
    purchase_status_display = serializers.CharField(
        source='get_purchase_status_display',
        read_only=True
    )
    manufacturer_type_display = serializers.CharField(
        source='get_manufacturer_type_display',
        read_only=True
    )
    material_supply_type_display = serializers.CharField(
        source='get_material_supply_type_display',
        read_only=True
    )
    
    # FK details
    contractor_detail = ContractorMinimalSerializer(
        source='contractor',
        read_only=True
    )
    supplier_detail = SupplierMinimalSerializer(
        source='supplier',
        read_only=True
    )
    delay_reason_detail = DelayReasonMinimalSerializer(
        source='delay_reason',
        read_only=True
    )

    # Аналитика причин/подпричин (производство/закупки)
    manufacturing_problem_reason_detail = ManufacturingProblemReasonMinimalSerializer(
        source='manufacturing_problem_reason',
        read_only=True
    )
    manufacturing_problem_subreason_detail = ManufacturingProblemSubreasonMinimalSerializer(
        source='manufacturing_problem_subreason',
        read_only=True
    )
    purchase_problem_reason_detail = PurchaseProblemReasonMinimalSerializer(
        source='purchase_problem_reason',
        read_only=True
    )
    purchase_problem_subreason_detail = PurchaseProblemSubreasonMinimalSerializer(
        source='purchase_problem_subreason',
        read_only=True
    )

    # Проблемы закупки
    problem_reason_detail = serializers.SerializerMethodField()
    
    responsible_detail = UserMinimalSerializer(
        source='responsible',
        read_only=True
    )
    
    # Computed fields
    is_overdue = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()
    is_purchased = serializers.SerializerMethodField()
    calculated_progress = serializers.SerializerMethodField()
    purchase_order_id = serializers.SerializerMethodField()
    purchase_order_number = serializers.SerializerMethodField()
    
    # CRITICAL: parent_item must be serialized as string, not UUID object
    # Otherwise frontend buildTree() cannot match parent-child relationships
    parent_item = serializers.SerializerMethodField()
    
    # CRITICAL: id must also be serialized as string for consistency
    id = serializers.SerializerMethodField()
    
    class Meta:
        model = ProjectItem
        fields = [
            'id', 'project',
            'nomenclature_item', 'nomenclature_item_detail',
            'parent_item',
            'category', 'category_display', 'category_sort_order',
            'name', 'drawing_number',
            'article_number',
            'quantity', 'unit',
            'position',
            'item_number',
            # Manufacturing
            'manufacturing_status', 'manufacturing_status_display',
            'contractor_status', 'contractor_status_display',
            'manufacturer_type', 'manufacturer_type_display',
            'contractor', 'contractor_detail',
            'material_supply_type', 'material_supply_type_display',
            # Purchase
            'purchase_status', 'purchase_status_display',
            'supplier', 'supplier_detail',
            'purchase_by_contractor',
            # Dates
            'planned_start', 'planned_end',
            'actual_start', 'actual_end',
            'required_date', 'order_date',
            'purchase_order_id', 'purchase_order_number',
            # Responsibility
            'responsible', 'responsible_detail',
            # Progress
            'progress_percent', 'calculated_progress',
            # Delay
            'delay_reason', 'delay_reason_detail',
            'delay_notes',
            # Analytics reasons
            'manufacturing_problem_reason', 'manufacturing_problem_reason_detail',
            'manufacturing_problem_subreason', 'manufacturing_problem_subreason_detail',
            'purchase_problem_reason', 'purchase_problem_reason_detail',
            'purchase_problem_subreason', 'purchase_problem_subreason_detail',
            # Problems
            'has_problem', 'problem_reason', 'problem_reason_detail',
            # Computed
            'is_overdue',
            'children_count',
            'is_purchased',
            # Notes
            'notes',
        ]
    
    def get_category_sort_order(self, obj):
        """Return catalog category sort_order for hierarchical sorting."""
        if obj.nomenclature_item and obj.nomenclature_item.catalog_category:
            return obj.nomenclature_item.catalog_category.sort_order
        return 999  # Put items without category at the end
    
    def get_category_display(self, obj):
        """Return catalog category name (display name)."""
        if obj.nomenclature_item and obj.nomenclature_item.catalog_category:
            return obj.nomenclature_item.catalog_category.name
        return None
    
    def get_id(self, obj):
        """Return id as string (not UUID object) for frontend tree building."""
        return str(obj.id)
    
    def get_parent_item(self, obj):
        """Return parent_item as string (not UUID object) for frontend tree building."""
        return str(obj.parent_item_id) if obj.parent_item_id else None
    
    def get_is_purchased(self, obj):
        """Return whether this item is purchased (based on nomenclature's catalog category)."""
        return bool(getattr(obj, 'is_purchased', False))

    def _get_latest_order(self, obj):
        requirement = MaterialRequirement.objects.filter(
            project_item=obj,
            purchase_order__isnull=False,
            is_active=True,
            deleted_at__isnull=True,
        ).exclude(
            purchase_order__status__in=['draft', 'cancelled']
        ).select_related('purchase_order').order_by('-updated_at').first()
        if requirement and requirement.purchase_order:
            return requirement.purchase_order

        po_item = PurchaseOrderItem.objects.filter(
            project_item=obj,
        ).exclude(order__status__in=['draft', 'cancelled']).select_related('order').order_by('-created_at').first()
        if po_item:
            return po_item.order
        return None

    def get_purchase_order_id(self, obj):
        if not self.context.get('include_purchase_order', False):
            return None
        order = self._get_latest_order(obj)
        return str(order.id) if order else None

    def get_purchase_order_number(self, obj):
        if not self.context.get('include_purchase_order', False):
            return None
        order = self._get_latest_order(obj)
        return order.number if order else None

    def get_calculated_progress(self, obj):
        """Calculate progress based on status (0% or 100%) and children."""
        # В списках (особенно в "Рабочем месте") calculated_progress по умолчанию выключен,
        # но для закупаемых позиций прогресс должен быть бинарным: 100% для "На складе"/"Списано",
        # иначе 0%. Это вычисление дёшево, поэтому отдаём его всегда для is_purchased.
        if getattr(obj, 'is_purchased', False):
            return float(obj.calculate_progress())

        if not self.context.get('include_calculated_progress', False):
            return None

        return float(obj.calculate_progress())

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)
        planned_start = attrs.get('planned_start') or (instance.planned_start if instance else None)
        planned_end = attrs.get('planned_end') or (instance.planned_end if instance else None)
        required_date = attrs.get('required_date') or (instance.required_date if instance else None)

        errors = {}
        if planned_start and planned_end and planned_end < planned_start:
            errors['planned_end'] = 'Плановое окончание не может быть раньше планового начала.'
        if planned_start and required_date and required_date < planned_start:
            errors['required_date'] = 'Срок поставки не может быть раньше планового начала.'
        if errors:
            raise serializers.ValidationError(errors)

        # Validate reason/subreason relationship (analytics)
        instance = getattr(self, 'instance', None)
        m_reason = attrs.get('manufacturing_problem_reason')
        m_sub = attrs.get('manufacturing_problem_subreason')
        p_reason = attrs.get('purchase_problem_reason')
        p_sub = attrs.get('purchase_problem_subreason')

        if instance:
            if m_reason is None and 'manufacturing_problem_reason' not in attrs:
                m_reason = instance.manufacturing_problem_reason
            if p_reason is None and 'purchase_problem_reason' not in attrs:
                p_reason = instance.purchase_problem_reason

        if m_sub and m_reason and m_sub.reason_id != m_reason.id:
            raise serializers.ValidationError({
                'manufacturing_problem_subreason': 'Подпричина не относится к выбранной причине производства'
            })
        if p_sub and p_reason and p_sub.reason_id != p_reason.id:
            raise serializers.ValidationError({
                'purchase_problem_subreason': 'Подпричина не относится к выбранной причине закупок'
            })

        return attrs

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)
        planned_start = attrs.get('planned_start') or (instance.planned_start if instance else None)
        planned_end = attrs.get('planned_end') or (instance.planned_end if instance else None)
        required_date = attrs.get('required_date') or (instance.required_date if instance else None)

        errors = {}
        if planned_start and planned_end and planned_end < planned_start:
            errors['planned_end'] = 'Плановое окончание не может быть раньше планового начала.'
        if planned_start and required_date and required_date < planned_start:
            errors['required_date'] = 'Срок поставки не может быть раньше планового начала.'
        if errors:
            raise serializers.ValidationError(errors)

        return attrs
    
    def get_children_count(self, obj):
        """Return count of direct children for this item."""
        annotated = getattr(obj, 'children_count', None)
        if annotated is not None:
            return int(annotated)
        return ProjectItem.objects.filter(parent_item=obj, is_active=True).count()
    
    def get_is_overdue(self, obj):
        if obj.manufacturing_status not in ['completed', 'rejected'] and obj.planned_end:
            return obj.planned_end < timezone.now().date()
        return False

    def get_problem_reason_detail(self, obj):
        if obj.problem_reason:
            return {
                'id': str(obj.problem_reason.id),
                'code': obj.problem_reason.code,
                'name': obj.problem_reason.name,
            }
        return None


class ProjectItemDetailSerializer(BaseModelSerializer):
    """Detail serializer for project items."""
    
    nomenclature_item_detail = NomenclatureListSerializer(
        source='nomenclature_item',
        read_only=True
    )
    category_display = serializers.CharField(
        source='get_category_display',
        read_only=True
    )
    manufacturing_status_display = serializers.CharField(
        source='get_manufacturing_status_display',
        read_only=True
    )
    contractor_status_display = serializers.CharField(
        source='get_contractor_status_display',
        read_only=True
    )
    purchase_status_display = serializers.CharField(
        source='get_purchase_status_display',
        read_only=True
    )
    manufacturer_type_display = serializers.CharField(
        source='get_manufacturer_type_display',
        read_only=True
    )
    material_supply_type_display = serializers.CharField(
        source='get_material_supply_type_display',
        read_only=True
    )
    responsible_detail = UserMinimalSerializer(
        source='responsible',
        read_only=True
    )
    contractor_detail = ContractorMinimalSerializer(
        source='contractor',
        read_only=True
    )
    supplier_detail = SupplierMinimalSerializer(
        source='supplier',
        read_only=True
    )
    delay_reason_detail = DelayReasonMinimalSerializer(
        source='delay_reason',
        read_only=True
    )

    # Аналитика причин/подпричин (производство/закупки)
    manufacturing_problem_reason_detail = ManufacturingProblemReasonMinimalSerializer(
        source='manufacturing_problem_reason',
        read_only=True
    )
    manufacturing_problem_subreason_detail = ManufacturingProblemSubreasonMinimalSerializer(
        source='manufacturing_problem_subreason',
        read_only=True
    )
    purchase_problem_reason_detail = PurchaseProblemReasonMinimalSerializer(
        source='purchase_problem_reason',
        read_only=True
    )
    purchase_problem_subreason_detail = PurchaseProblemSubreasonMinimalSerializer(
        source='purchase_problem_subreason',
        read_only=True
    )
    
    # Computed fields
    is_overdue = serializers.SerializerMethodField()
    days_remaining = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()
    is_purchased = serializers.SerializerMethodField()
    problem_reason_detail = serializers.SerializerMethodField()
    calculated_progress = serializers.SerializerMethodField()
    purchase_order_id = serializers.SerializerMethodField()
    purchase_order_number = serializers.SerializerMethodField()
    
    # CRITICAL: parent_item must be serialized as string, not UUID object
    parent_item = serializers.SerializerMethodField()
    
    class Meta:
        model = ProjectItem
        fields = [
            'id', 'project', 'bom_item',
            'nomenclature_item', 'nomenclature_item_detail',
            'parent_item',
            'category', 'category_display',
            'name', 'drawing_number',
            'article_number',
            'quantity', 'unit',
            'item_number',
            # Manufacturing
            'manufacturing_status', 'manufacturing_status_display',
            'contractor_status', 'contractor_status_display',
            'manufacturer_type', 'manufacturer_type_display',
            'contractor', 'contractor_detail',
            'material_supply_type', 'material_supply_type_display',
            # Purchase
            'purchase_status', 'purchase_status_display',
            'supplier', 'supplier_detail',
            'purchase_by_contractor',
            # Dates
            'planned_start', 'planned_end',
            'actual_start', 'actual_end',
            'required_date', 'order_date',
            'purchase_order_id', 'purchase_order_number',
            # Responsibility
            'responsible', 'responsible_detail',
            # Progress
            'progress_percent', 'calculated_progress',
            # Delay
            'delay_reason', 'delay_reason_detail',
            'delay_notes',
            # Analytics reasons
            'manufacturing_problem_reason', 'manufacturing_problem_reason_detail',
            'manufacturing_problem_subreason', 'manufacturing_problem_subreason_detail',
            'purchase_problem_reason', 'purchase_problem_reason_detail',
            'purchase_problem_subreason', 'purchase_problem_subreason_detail',
            # Problems
            'has_problem', 'problem_reason', 'problem_reason_detail',
            # Computed
            'is_overdue', 'days_remaining', 'children_count', 'is_purchased',
            # Notes
            'notes',
            # Timestamps
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'item_number', 'created_at', 'updated_at']
    
    def get_parent_item(self, obj):
        """Return parent_item as string (not UUID object) for frontend tree building."""
        return str(obj.parent_item_id) if obj.parent_item_id else None

    def _get_latest_order(self, obj):
        requirement = MaterialRequirement.objects.filter(
            project_item=obj,
            purchase_order__isnull=False,
            is_active=True,
            deleted_at__isnull=True,
        ).exclude(
            purchase_order__status__in=['draft', 'cancelled']
        ).select_related('purchase_order').order_by('-updated_at').first()
        if requirement and requirement.purchase_order:
            return requirement.purchase_order

        po_item = PurchaseOrderItem.objects.filter(
            project_item=obj,
        ).exclude(order__status__in=['draft', 'cancelled']).select_related('order').order_by('-created_at').first()
        if po_item:
            return po_item.order
        return None

    def get_purchase_order_id(self, obj):
        order = self._get_latest_order(obj)
        return str(order.id) if order else None

    def get_purchase_order_number(self, obj):
        order = self._get_latest_order(obj)
        return order.number if order else None
    
    def get_is_purchased(self, obj):
        """Return whether this item is purchased (based on nomenclature's catalog category)."""
        return bool(getattr(obj, 'is_purchased', False))
    
    def get_is_overdue(self, obj):
        if obj.manufacturing_status not in ['completed', 'rejected'] and obj.planned_end:
            return obj.planned_end < timezone.now().date()
        return False

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)
        errors = {}

        # Date consistency checks should only run when the request updates date fields.
        if any(k in attrs for k in ('planned_start', 'planned_end', 'required_date')):
            planned_start = attrs.get('planned_start') if 'planned_start' in attrs else (instance.planned_start if instance else None)
            planned_end = attrs.get('planned_end') if 'planned_end' in attrs else (instance.planned_end if instance else None)
            required_date = attrs.get('required_date') if 'required_date' in attrs else (instance.required_date if instance else None)

            if planned_start and planned_end and planned_end < planned_start:
                errors['planned_end'] = 'Плановое окончание не может быть раньше планового начала.'
            if planned_start and required_date and required_date < planned_start:
                errors['required_date'] = 'Срок поставки не может быть раньше планового начала.'

        # Delay reason/comment rules should only run when delay fields are being updated.
        if any(k in attrs for k in ('delay_reason', 'delay_notes')):
            delay_reason = attrs.get('delay_reason') if 'delay_reason' in attrs else (instance.delay_reason if instance else None)
            delay_notes = attrs.get('delay_notes') if 'delay_notes' in attrs else (instance.delay_notes if instance else '')
            delay_notes_value = (delay_notes or '').strip()
            reason_changed = bool(instance) and 'delay_reason' in attrs and attrs.get('delay_reason') != instance.delay_reason

            if delay_reason:
                if not delay_notes_value:
                    errors['delay_notes'] = 'Укажите комментарий по проблеме / отклонению.'
                elif reason_changed and (('delay_notes' not in attrs) or (instance and delay_notes_value == (instance.delay_notes or '').strip())):
                    errors['delay_notes'] = 'Обновите комментарий по проблеме / отклонению.'

        if errors:
            raise serializers.ValidationError(errors)

        return attrs
    
    def get_days_remaining(self, obj):
        if obj.planned_end:
            delta = obj.planned_end - timezone.now().date()
            return delta.days
        return None

    def get_problem_reason_detail(self, obj):
        if obj.problem_reason:
            return {
                'id': str(obj.problem_reason.id),
                'code': obj.problem_reason.code,
                'name': obj.problem_reason.name,
            }
        return None
    
    def get_children_count(self, obj):
        return obj.children.count()
    
    def get_calculated_progress(self, obj):
        """Calculate progress based on status (0% or 100%) and children."""
        return float(obj.calculate_progress())
    
    def update(self, instance, validated_data):
        """
        Update ProjectItem with automatic order_date recalculation.
        When planned_end or required_date changes, recalculate order_date based on supplier lead time.
        """
        from datetime import timedelta
        from infrastructure.persistence.models import NomenclatureSupplier
        from django.utils import timezone

        if 'delay_reason' in validated_data and not validated_data.get('delay_reason'):
            validated_data['delay_notes'] = ''
        
        # Check if required_date or planned_end is being updated
        new_required_date = validated_data.get('required_date')
        new_planned_end = validated_data.get('planned_end')

        # Явно переданные фактические даты
        explicit_actual_start = validated_data.get('actual_start')
        explicit_actual_end = validated_data.get('actual_end')
        
        # If order_date is explicitly set in the request, use it
        explicit_order_date = validated_data.get('order_date')
        
        # Update the instance first
        instance = super().update(instance, validated_data)
        
        # If order_date was explicitly set, don't recalculate
        if explicit_order_date is not None:
            return instance
        
        # Auto-recalculate order_date only for purchased items
        if instance.is_purchased and not instance.purchase_by_contractor:
            # Determine the base date for calculation
            base_date = instance.required_date or instance.planned_end
            
            if base_date and (new_required_date is not None or new_planned_end is not None):
                # Get supplier lead time
                lead_time_days = 14  # Default
                if instance.supplier and instance.nomenclature_item:
                    nom_supplier = NomenclatureSupplier.objects.filter(
                        nomenclature_item=instance.nomenclature_item,
                        supplier=instance.supplier,
                        is_active=True
                    ).first()
                    if nom_supplier and nom_supplier.delivery_days:
                        lead_time_days = nom_supplier.delivery_days
                
                # Recalculate order_date
                instance.order_date = base_date - timedelta(days=lead_time_days)
                instance.save(update_fields=['order_date'])
        
        # Автопроставление фактических дат для подрядчика
        if instance.manufacturer_type == 'contractor' and 'contractor_status' in validated_data:
            if instance.contractor_status == 'in_progress_by_contractor' and not instance.actual_start:
                if explicit_actual_start is None:
                    instance.actual_start = timezone.now().date()
                    instance.save(update_fields=['actual_start'])
            if instance.contractor_status == 'completed' and not instance.actual_end:
                if explicit_actual_end is None:
                    instance.actual_end = timezone.now().date()
                    instance.save(update_fields=['actual_end'])

        # Автопроставление фактических дат для внутренних работ
        if instance.manufacturer_type != 'contractor' and 'manufacturing_status' in validated_data:
            if instance.manufacturing_status == 'in_progress' and not instance.actual_start:
                if explicit_actual_start is None:
                    instance.actual_start = timezone.now().date()
                    instance.save(update_fields=['actual_start'])
            if instance.manufacturing_status == 'completed' and not instance.actual_end:
                if explicit_actual_end is None:
                    instance.actual_end = timezone.now().date()
                    instance.save(update_fields=['actual_end'])

        return instance


class ProjectItemTreeSerializer(serializers.Serializer):
    """Serializer for project items in tree format."""
    
    id = serializers.UUIDField()
    nomenclature_item = NomenclatureMinimalSerializer()
    name = serializers.CharField()
    category = serializers.CharField()
    category_display = serializers.CharField()
    quantity = serializers.DecimalField(max_digits=15, decimal_places=3)
    unit = serializers.CharField()
    manufacturing_status = serializers.CharField()
    manufacturing_status_display = serializers.CharField()
    purchase_status = serializers.CharField()
    purchase_status_display = serializers.CharField()
    progress_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    planned_start = serializers.DateField()
    planned_end = serializers.DateField()
    level = serializers.IntegerField()
    children = serializers.SerializerMethodField()
    
    def get_children(self, obj):
        if hasattr(obj, 'tree_children') and obj.tree_children:
            return ProjectItemTreeSerializer(obj.tree_children, many=True).data
        return []


class ProjectListSerializer(BaseModelSerializer):
    """List serializer for projects."""
    
    status_display = serializers.CharField(
        source='get_status_display',
        read_only=True
    )
    bom_detail = BOMStructureListSerializer(
        source='bom',
        read_only=True
    )
    root_nomenclature_detail = NomenclatureMinimalSerializer(
        source='root_nomenclature',
        read_only=True
    )
    project_manager_name = serializers.CharField(
        source='project_manager.get_full_name',
        read_only=True,
        default=None
    )
    project_manager_detail = UserMinimalSerializer(
        source='project_manager',
        read_only=True
    )
    items_count = serializers.IntegerField(
        source='items.count',
        read_only=True
    )
    has_structure = serializers.SerializerMethodField()
    
    # Alias for frontend compatibility
    progress = serializers.SerializerMethodField()
    start_date = serializers.DateField(
        source='planned_start',
        read_only=True
    )
    planned_end_date = serializers.DateField(
        source='planned_end',
        read_only=True
    )
    actual_end_date = serializers.DateField(
        source='actual_end',
        read_only=True
    )
    
    class Meta:
        model = Project
        fields = [
            'id', 'name', 'description',
            'bom', 'bom_detail',
            'root_nomenclature', 'root_nomenclature_detail',
            'nomenclature_item',
            'status', 'status_display',
            'planned_start', 'planned_end',
            'actual_start', 'actual_end',
            'start_date', 'planned_end_date', 'actual_end_date',  # Aliases
            'progress_percent', 'progress',
            'project_manager', 'project_manager_name', 'project_manager_detail',
            'items_count', 'has_structure',
            'structure_modified',
            'is_active',
            'created_at'
        ]
    
    def get_has_structure(self, obj):
        """Check if project has any structure items."""
        return obj.items.exists()

    def get_progress(self, obj):
        """Return progress based on root item calculated progress."""
        root_item = obj.root_item
        if not root_item:
            return 0
        return float(root_item.calculate_progress())


class ProjectDetailSerializer(BaseModelSerializer):
    """Detail serializer for projects."""
    
    status_display = serializers.CharField(
        source='get_status_display',
        read_only=True
    )
    bom_detail = BOMStructureListSerializer(
        source='bom',
        read_only=True
    )
    nomenclature_item_detail = NomenclatureListSerializer(
        source='nomenclature_item',
        read_only=True
    )
    root_nomenclature_detail = NomenclatureListSerializer(
        source='root_nomenclature',
        read_only=True
    )
    project_manager_name = serializers.CharField(
        source='project_manager.get_full_name',
        read_only=True,
        default=None
    )
    project_manager_detail = UserMinimalSerializer(
        source='project_manager',
        read_only=True
    )
    
    # Root item info
    root_item_id = serializers.SerializerMethodField()
    has_structure = serializers.SerializerMethodField()
    can_activate = serializers.SerializerMethodField()
    validation_errors = serializers.SerializerMethodField()
    
    # Aliases for frontend compatibility
    progress = serializers.DecimalField(
        source='progress_percent',
        max_digits=5,
        decimal_places=2,
        read_only=True
    )
    start_date = serializers.DateField(
        source='planned_start',
        read_only=True
    )
    planned_end_date = serializers.DateField(
        source='planned_end',
        read_only=True
    )
    actual_end_date = serializers.DateField(
        source='actual_end',
        read_only=True
    )
    
    # Statistics
    statistics = serializers.SerializerMethodField()
    
    class Meta:
        model = Project
        fields = [
            'id', 'name', 'description',
            'bom', 'bom_detail',
            'root_nomenclature', 'root_nomenclature_detail',
            'nomenclature_item', 'nomenclature_item_detail',
            'status', 'status_display',
            'planned_start', 'planned_end',
            'actual_start', 'actual_end',
            'start_date', 'planned_end_date', 'actual_end_date',  # Aliases
            'progress_percent', 'progress', 'last_progress_calculation',
            'project_manager', 'project_manager_name', 'project_manager_detail',
            'root_item_id', 'has_structure', 'structure_modified',
            'can_activate', 'validation_errors',
            'is_active',
            'statistics',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'progress_percent', 'last_progress_calculation',
            'created_at', 'updated_at'
        ]

    def create(self, validated_data):
        return super().create(validated_data)
    
    def get_root_item_id(self, obj):
        """Get ID of the root project item."""
        root = obj.root_item
        return str(root.id) if root else None
    
    def get_has_structure(self, obj):
        """Check if project has any structure items."""
        return obj.items.exists()
    
    def get_can_activate(self, obj):
        """Check if project can be activated."""
        return obj.can_activate()
    
    def get_validation_errors(self, obj):
        """Get validation errors for project activation."""
        return obj.get_validation_errors()
    
    def get_statistics(self, obj):
        """Calculate project statistics."""
        items = obj.items.all()
        total = items.count()
        
        if total == 0:
            return {
                'total_items': 0,
                'completed_items': 0,
                'in_progress_items': 0,
                'not_started_items': 0,
                'overdue_items': 0,
            }
        
        today = timezone.now().date()
        
        # Manufacturing statuses
        manufacturing_completed = items.filter(
            manufacturing_status='completed'
        ).count()
        manufacturing_in_progress = items.filter(
            manufacturing_status='in_progress'
        ).count()
        
        # Purchase statuses
        purchase_delivered = items.filter(
            purchase_status='closed'
        ).count()
        
        # Overdue
        overdue = items.exclude(
            manufacturing_status__in=['completed', 'rejected']
        ).filter(planned_end__lt=today).count()
        
        return {
            'total_items': total,
            'manufacturing_completed': manufacturing_completed,
            'manufacturing_in_progress': manufacturing_in_progress,
            'purchase_delivered': purchase_delivered,
            'overdue_items': overdue,
        }


class ProjectTreeSerializer(BaseModelSerializer):
    """Serializer for project with hierarchical items."""
    
    status_display = serializers.CharField(
        source='get_status_display',
        read_only=True
    )
    tree = serializers.SerializerMethodField()
    
    class Meta:
        model = Project
        fields = [
            'id', 'name',
            'status', 'status_display',
            'progress_percent', 'tree'
        ]
    
    def get_tree(self, obj):
        """
        Build hierarchical tree of project items.
        
        If filter_item_ids is set in context, only show items
        with those ids.
        If filter_responsible is set in context, only show items
        where user is responsible (and their parent chain).
        """
        items_qs = obj.items.select_related(
            'nomenclature_item'
        ).prefetch_related('children')
        
        filter_item_ids = self.context.get('filter_item_ids')
        if filter_item_ids is not None:
            items_qs = items_qs.filter(id__in=filter_item_ids)
        
        # Check if we need to filter by responsible
        filter_responsible = self.context.get('filter_responsible')
        if filter_responsible:
            # Get all items where user is responsible
            own_items = items_qs.filter(responsible_id=filter_responsible)
            own_item_ids = set(own_items.values_list('id', flat=True))
            
            # Also include all parent items up to root
            all_item_ids = set(own_item_ids)
            for item in own_items:
                parent_id = item.parent_item_id
                while parent_id:
                    all_item_ids.add(parent_id)
                    parent = items_qs.filter(id=parent_id).first()
                    parent_id = parent.parent_item_id if parent else None
            
            items_qs = items_qs.filter(id__in=all_item_ids)
        
        items = list(items_qs.all())
        
        # Build tree structure
        items_by_parent = {}
        for item in items:
            parent_id = item.parent_item_id
            if parent_id not in items_by_parent:
                items_by_parent[parent_id] = []
            item.category_display = item.get_category_display()
            item.manufacturing_status_display = item.get_manufacturing_status_display()
            item.purchase_status_display = item.get_purchase_status_display()
            items_by_parent[parent_id].append(item)
        
        def build_tree(parent_id=None, level=0):
            result = []
            for item in items_by_parent.get(parent_id, []):
                item.level = level
                item.tree_children = build_tree(item.id, level + 1)
                result.append(item)
            return result
        
        root_items = build_tree(None)
        return ProjectItemTreeSerializer(root_items, many=True).data


class ProjectGanttSerializer(serializers.Serializer):
    """Serializer for Gantt chart data."""
    
    id = serializers.UUIDField()
    name = serializers.CharField()
    start = serializers.DateField(source='planned_start')
    end = serializers.DateField(source='planned_end')
    progress = serializers.SerializerMethodField()
    dependencies = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()

    def get_progress(self, obj):
        try:
            return float(obj.calculate_progress())
        except Exception:
            # Fallback на сохранённое поле, если что-то пошло не так
            try:
                return float(obj.progress_percent)
            except Exception:
                return 0.0
    
    def get_dependencies(self, obj):
        # Return list of parent item IDs
        if obj.parent_item_id:
            return [str(obj.parent_item_id)]
        return []
    
    def get_type(self, obj):
        if hasattr(obj, 'level') and obj.level == 0:
            return 'project'
        elif obj.children.exists():
            return 'milestone'
        return 'task'


class ProjectProgressUpdateSerializer(serializers.Serializer):
    """Serializer for progress updates."""
    
    item_id = serializers.UUIDField()
    progress_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=0,
        max_value=100
    )
    manufacturing_status = serializers.CharField(required=False)
    purchase_status = serializers.CharField(required=False)
    notes = serializers.CharField(max_length=1000, required=False, allow_blank=True)


class ProjectBulkProgressUpdateSerializer(serializers.Serializer):
    """Serializer for bulk progress updates."""
    
    updates = ProjectProgressUpdateSerializer(many=True)
