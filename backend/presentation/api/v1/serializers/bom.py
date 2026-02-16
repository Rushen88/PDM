"""
BOM Serializers.

Serializers for Bill of Materials structures.
"""

from rest_framework import serializers
from infrastructure.persistence.models import (
    BOMStructure,
    BOMItem,
)
from .base import BaseModelSerializer
from .catalog import NomenclatureMinimalSerializer, NomenclatureListSerializer


class BOMItemSerializer(BaseModelSerializer):
    """Serializer for BOM items."""
    
    child_item_detail = NomenclatureMinimalSerializer(
        source='child_item',
        read_only=True
    )
    parent_item_detail = NomenclatureMinimalSerializer(
        source='parent_item',
        read_only=True
    )
    child_category_display = serializers.SerializerMethodField()
    
    class Meta:
        model = BOMItem
        fields = [
            'id', 'bom',
            'parent_item', 'parent_item_detail',
            'child_item', 'child_item_detail',
            'child_category', 'child_category_display',
            'quantity', 'unit', 'position',
            'drawing_number_override', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_child_category_display(self, obj):
        """Return child_category as display (now it's just the code string)."""
        return obj.child_category or ''


class BOMItemTreeSerializer(serializers.Serializer):
    """Serializer for BOM items in tree format."""
    
    id = serializers.UUIDField()
    child_item = NomenclatureMinimalSerializer()
    quantity = serializers.DecimalField(max_digits=15, decimal_places=3)
    unit = serializers.CharField()
    position = serializers.IntegerField()
    notes = serializers.CharField()
    level = serializers.IntegerField()
    children = serializers.SerializerMethodField()
    
    def get_children(self, obj):
        if hasattr(obj, 'children_items') and obj.children_items:
            return BOMItemTreeSerializer(obj.children_items, many=True).data
        return []


class BOMStructureListSerializer(BaseModelSerializer):
    """List serializer for BOM structures."""
    
    root_item_detail = NomenclatureListSerializer(
        source='root_item',
        read_only=True
    )
    root_category_display = serializers.SerializerMethodField()
    items_count = serializers.IntegerField(source='items.count', read_only=True)
    
    class Meta:
        model = BOMStructure
        fields = [
            'id', 'name', 'description',
            'root_item', 'root_item_detail',
            'root_category', 'root_category_display',
            'current_version',
            'is_active', 'is_locked',
            'items_count',
            'created_at', 'updated_at'
        ]
    
    def get_root_category_display(self, obj):
        """Return root_category as display (now it's just the code string)."""
        return obj.root_category or ''


class BOMStructureDetailSerializer(BaseModelSerializer):
    """Detail serializer for BOM structures."""
    
    root_item_detail = NomenclatureListSerializer(
        source='root_item',
        read_only=True
    )
    root_category_display = serializers.SerializerMethodField()
    
    # Nested relations
    items = BOMItemSerializer(many=True, read_only=True)
    
    # Computed fields
    total_items_count = serializers.SerializerMethodField()
    max_depth = serializers.SerializerMethodField()
    
    class Meta:
        model = BOMStructure
        fields = [
            'id', 'name', 'description',
            'root_item', 'root_item_detail',
            'root_category', 'root_category_display',
            'current_version',
            'is_active', 'is_locked',
            'items',
            'total_items_count', 'max_depth',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'current_version',
            'created_at', 'updated_at'
        ]
    
    def get_root_category_display(self, obj):
        """Return root_category as display (now it's just the code string)."""
        return obj.root_category or ''
    
    def get_total_items_count(self, obj):
        return obj.items.count()
    
    def get_max_depth(self, obj):
        """Calculate maximum nesting depth of BOM."""
        items = obj.items.all()
        if not items:
            return 0
        
        # Build parent-child mapping
        children_map = {}
        root_items = []
        
        for item in items:
            if item.parent_item_id is None:
                root_items.append(item.child_item_id)
            else:
                if item.parent_item_id not in children_map:
                    children_map[item.parent_item_id] = []
                children_map[item.parent_item_id].append(item.child_item_id)
        
        def calculate_depth(item_id, current_depth=1):
            if item_id not in children_map:
                return current_depth
            return max(
                calculate_depth(child_id, current_depth + 1)
                for child_id in children_map[item_id]
            )
        
        if not root_items:
            return 1
        
        return max(calculate_depth(root_id) for root_id in root_items)


class BOMStructureTreeSerializer(BaseModelSerializer):
    """Serializer for BOM structure with hierarchical items."""
    
    root_item_detail = NomenclatureListSerializer(
        source='root_item',
        read_only=True
    )
    root_category_display = serializers.SerializerMethodField()
    tree = serializers.SerializerMethodField()
    
    class Meta:
        model = BOMStructure
        fields = [
            'id', 'name',
            'root_item', 'root_item_detail',
            'root_category', 'root_category_display',
            'current_version',
            'tree'
        ]
    
    def get_root_category_display(self, obj):
        """Return root_category as display (now it's just the code string)."""
        return obj.root_category or ''
    
    def get_tree(self, obj):
        """Build hierarchical tree of BOM items."""
        items = obj.items.select_related(
            'child_item', 'parent_item'
        ).order_by('position')
        
        # Build tree structure
        items_by_parent = {}
        for item in items:
            parent_id = item.parent_item_id
            if parent_id not in items_by_parent:
                items_by_parent[parent_id] = []
            items_by_parent[parent_id].append(item)
        
        def build_tree(parent_id=None, level=0):
            result = []
            for item in items_by_parent.get(parent_id, []):
                item.level = level
                item.children_items = build_tree(item.child_item_id, level + 1)
                result.append(item)
            return result
        
        root_items = build_tree(None)
        return BOMItemTreeSerializer(root_items, many=True).data


class BOMComparisonSerializer(serializers.Serializer):
    """Serializer for comparing two BOM versions."""
    
    bom_id = serializers.UUIDField()
    version_1 = serializers.IntegerField()
    version_2 = serializers.IntegerField()
    added_items = BOMItemSerializer(many=True)
    removed_items = BOMItemSerializer(many=True)
    modified_items = serializers.ListField(
        child=serializers.DictField()
    )


class BOMImportSerializer(serializers.Serializer):
    """Serializer for importing BOM from external sources."""
    
    file = serializers.FileField()
    name = serializers.CharField(max_length=300)
    root_item_id = serializers.UUIDField()
    root_category = serializers.ChoiceField(
        choices=[
            ('assembly_unit', 'Сборочная единица'),
            ('subsystem', 'Подсистема'),
            ('system', 'Система'),
            ('stand', 'Стенд'),
        ]
    )
    format = serializers.ChoiceField(choices=['excel', 'csv', 'xml'])
    root_nomenclature_id = serializers.UUIDField()
    create_missing_nomenclature = serializers.BooleanField(default=False)
    update_existing = serializers.BooleanField(default=False)
