"""
Catalog Serializers.

Serializers for nomenclature, suppliers, contractors, and related entities.
"""

import uuid

from rest_framework import serializers
from infrastructure.persistence.models import (
    CatalogCategory,
    NomenclatureItem,
    NomenclatureType,
    NomenclatureSupplier,
    NomenclatureCategoryChoices,
    Supplier,
    Contractor,
    ContactPerson,
    DelayReason,
    BankDetails,
)
from .base import BaseModelSerializer


# =============================================================================
# Catalog Category Serializers
# =============================================================================

class CatalogCategoryListSerializer(BaseModelSerializer):
    """List serializer for catalog categories."""
    
    allowed_children_names = serializers.SerializerMethodField()
    
    class Meta:
        model = CatalogCategory
        fields = [
            'id', 'code', 'name', 'is_purchased', 'sort_order', 'is_active',
            'allowed_children_names'
        ]
    
    def get_allowed_children_names(self, obj):
        """Return list of allowed children names."""
        return [child.name for child in obj.allowed_children.all()]


class CatalogCategoryDetailSerializer(BaseModelSerializer):
    """Detail serializer for catalog categories with allowed children."""
    
    allowed_children = CatalogCategoryListSerializer(many=True, read_only=True)
    allowed_children_ids = serializers.PrimaryKeyRelatedField(
        queryset=CatalogCategory.objects.all(),
        many=True,
        write_only=True,
        source='allowed_children',
        required=False
    )
    # Автогенерация кода если не передан
    code = serializers.CharField(required=False, allow_blank=True)
    
    class Meta:
        model = CatalogCategory
        fields = [
            'id', 'code', 'name', 'description', 'is_purchased', 'sort_order',
            'allowed_children', 'allowed_children_ids',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_code(self, value):
        """Generate code from name if not provided."""
        if not value:
            return None  # Будет сгенерирован в create()
        return value
    
    def create(self, validated_data):
        """Create category with auto-generated code if not provided."""
        import uuid
        import re
        
        if not validated_data.get('code'):
            name = validated_data.get('name', '')
            # Простая транслитерация кириллицы
            translit_map = {
                'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
                'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
                'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
                'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
                'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
            }
            code = name.lower()
            for cyr, lat in translit_map.items():
                code = code.replace(cyr, lat)
            # Заменяем пробелы и спецсимволы на _
            code = re.sub(r'[^a-z0-9]+', '_', code).strip('_')
            # Если пустой, генерируем уникальный
            if not code:
                code = f"cat_{uuid.uuid4().hex[:8]}"
            # Проверяем уникальность
            base_code = code
            counter = 1
            while CatalogCategory.objects.filter(code=code).exists():
                code = f"{base_code}_{counter}"
                counter += 1
            validated_data['code'] = code
        
        return super().create(validated_data)


# =============================================================================
# Minimal Serializers for FK relationships
# =============================================================================

class SupplierMinimalSerializer(serializers.ModelSerializer):
    """Minimal serializer for Supplier in FK relations."""
    
    class Meta:
        model = Supplier
        fields = ['id', 'name', 'short_name']


class ContractorMinimalSerializer(serializers.ModelSerializer):
    """Minimal serializer for Contractor in FK relations."""
    
    class Meta:
        model = Contractor
        fields = ['id', 'name', 'short_name']


class DelayReasonMinimalSerializer(serializers.ModelSerializer):
    """Minimal serializer for DelayReason in FK relations."""
    
    class Meta:
        model = DelayReason
        fields = ['id', 'name']


# =============================================================================
# Contact Person Serializers
# =============================================================================

class ContactPersonSerializer(BaseModelSerializer):
    """Serializer for contact persons."""
    
    full_name = serializers.CharField(read_only=True)
    
    class Meta:
        model = ContactPerson
        fields = [
            'id', 'last_name', 'first_name', 'middle_name', 'full_name',
            'position', 'phone', 'mobile_phone', 'email',
            'is_primary', 'notes', 'is_active',
            'supplier', 'contractor',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'full_name', 'created_at', 'updated_at']


class ContactPersonCreateSerializer(BaseModelSerializer):
    """Serializer for creating contact persons."""
    
    class Meta:
        model = ContactPerson
        fields = [
            'last_name', 'first_name', 'middle_name',
            'position', 'phone', 'mobile_phone', 'email',
            'is_primary', 'notes',
            'supplier', 'contractor',
        ]


# =============================================================================
# Bank Details Serializers
# =============================================================================

class BankDetailsSerializer(BaseModelSerializer):
    """Serializer for bank details."""
    
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    contractor_name = serializers.CharField(source='contractor.name', read_only=True)
    currency_display = serializers.CharField(source='get_currency_display', read_only=True)
    
    class Meta:
        model = BankDetails
        fields = [
            'id', 'supplier', 'supplier_name', 'contractor', 'contractor_name',
            'bank_name', 'bik', 'correspondent_account', 'settlement_account',
            'currency', 'currency_display', 'is_primary', 'notes',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate(self, attrs):
        """Ensure bank details are linked to exactly one entity."""
        supplier = attrs.get('supplier')
        contractor = attrs.get('contractor')
        
        if supplier and contractor:
            raise serializers.ValidationError(
                "Банковские реквизиты могут быть привязаны только к поставщику ИЛИ подрядчику"
            )
        if not supplier and not contractor:
            raise serializers.ValidationError(
                "Банковские реквизиты должны быть привязаны к поставщику или подрядчику"
            )
        return attrs


class BankDetailsInlineSerializer(BaseModelSerializer):
    """Inline serializer for bank details (without supplier/contractor)."""
    
    currency_display = serializers.CharField(source='get_currency_display', read_only=True)
    
    class Meta:
        model = BankDetails
        fields = [
            'id', 'bank_name', 'bik', 'correspondent_account', 'settlement_account',
            'currency', 'currency_display', 'is_primary', 'notes', 'is_active'
        ]
        read_only_fields = ['id']


# =============================================================================
# Supplier Serializers
# =============================================================================

class SupplierListSerializer(BaseModelSerializer):
    """List serializer for suppliers."""
    
    primary_contact = serializers.SerializerMethodField()
    contacts_count = serializers.IntegerField(source='contact_persons.count', read_only=True)
    full_name = serializers.CharField(source='name', read_only=True)  # Alias for compatibility
    # Рейтинг с точностью 0.5 (от 0.5 до 5.0)
    rating = serializers.DecimalField(max_digits=3, decimal_places=1, required=False, allow_null=True)
    
    class Meta:
        model = Supplier
        fields = [
            'id', 'name', 'full_name', 'short_name', 'inn',
            'primary_contact', 'contacts_count', 'phone', 'email',
            'is_active', 'rating', 'created_at'
        ]
    
    def get_primary_contact(self, obj):
        contact = obj.contact_persons.filter(is_primary=True, is_active=True).first()
        if contact:
            return {
                'full_name': contact.full_name,
                'phone': contact.phone
            }
        return None


class SupplierDetailSerializer(BaseModelSerializer):
    """Detail serializer for suppliers with all relations."""
    
    contacts = ContactPersonSerializer(source='contact_persons', many=True, read_only=True)
    bank_details = BankDetailsInlineSerializer(many=True, read_only=True)
    full_name = serializers.CharField(source='name', read_only=True)  # Alias for compatibility
    # Рейтинг с точностью 0.5 (от 0.5 до 5.0)
    rating = serializers.DecimalField(max_digits=3, decimal_places=1, required=False, allow_null=True)
    
    class Meta:
        model = Supplier
        fields = [
            'id', 'name', 'full_name', 'short_name', 'inn', 'kpp', 'ogrn',
            'legal_address', 'actual_address',
            'phone', 'email',
            'payment_terms', 'default_delivery_days',
            'contacts', 'bank_details',
            'is_active', 'rating', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# =============================================================================
# Contractor Serializers
# =============================================================================

class ContractorListSerializer(BaseModelSerializer):
    """List serializer for contractors."""
    
    primary_contact = serializers.SerializerMethodField()
    contacts_count = serializers.IntegerField(source='contact_persons.count', read_only=True)
    full_name = serializers.CharField(source='name', read_only=True)  # Alias for compatibility
    # Рейтинг с точностью 0.5 (от 0.5 до 5.0)
    rating = serializers.DecimalField(max_digits=3, decimal_places=1, required=False, allow_null=True)
    
    class Meta:
        model = Contractor
        fields = [
            'id', 'name', 'full_name', 'short_name', 'inn', 'specialization',
            'primary_contact', 'contacts_count', 'phone',
            'contract_number', 'contract_date',
            'is_active', 'rating', 'created_at'
        ]
    
    def get_primary_contact(self, obj):
        contact = obj.contact_persons.filter(is_primary=True, is_active=True).first()
        if contact:
            return {
                'full_name': contact.full_name,
                'phone': contact.phone
            }
        return None


class ContractorDetailSerializer(BaseModelSerializer):
    """Detail serializer for contractors."""
    
    contacts = ContactPersonSerializer(source='contact_persons', many=True, read_only=True)
    bank_details = BankDetailsInlineSerializer(many=True, read_only=True)
    full_name = serializers.CharField(source='name', read_only=True)  # Alias for compatibility
    # Рейтинг с точностью 0.5 (от 0.5 до 5.0)
    rating = serializers.DecimalField(max_digits=3, decimal_places=1, required=False, allow_null=True)
    
    class Meta:
        model = Contractor
        fields = [
            'id', 'name', 'full_name', 'short_name', 'inn', 'kpp', 'ogrn',
            'legal_address', 'actual_address',
            'phone', 'email',
            'specialization', 'certifications', 'default_lead_time_days',
            'contract_number', 'contract_date',
            'contacts', 'bank_details',
            'is_active', 'rating', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# =============================================================================
# Nomenclature Type Serializers
# =============================================================================

class NomenclatureTypeSerializer(BaseModelSerializer):
    """Serializer for nomenclature types."""
    
    catalog_category_name = serializers.CharField(
        source='catalog_category.name',
        read_only=True
    )
    
    class Meta:
        model = NomenclatureType
        fields = [
            'id', 'catalog_category', 'catalog_category_name', 'name',
            'description', 'default_unit', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# =============================================================================
# Nomenclature Supplier Serializers
# =============================================================================

class NomenclatureSupplierSerializer(BaseModelSerializer):
    """Serializer for nomenclature-supplier link."""
    
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    supplier_short_name = serializers.CharField(source='supplier.short_name', read_only=True)
    
    class Meta:
        model = NomenclatureSupplier
        fields = [
            'id', 'nomenclature_item', 'supplier',
            'supplier_name', 'supplier_short_name',
            'delivery_days', 'supplier_article',
            'price', 'currency', 'min_order_qty',
            'is_primary', 'notes', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class NomenclatureSupplierInlineSerializer(BaseModelSerializer):
    """Inline serializer for nomenclature suppliers (without nomenclature_item)."""
    
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    
    class Meta:
        model = NomenclatureSupplier
        fields = [
            'id', 'supplier', 'supplier_name',
            'delivery_days', 'supplier_article',
            'price', 'currency', 'min_order_qty',
            'is_primary', 'notes', 'is_active'
        ]
        read_only_fields = ['id']


# =============================================================================
# Nomenclature Item Serializers
# =============================================================================

class NomenclatureListSerializer(BaseModelSerializer):
    """List serializer for nomenclature items."""
    
    catalog_category_name = serializers.CharField(
        source='catalog_category.name',
        read_only=True
    )
    nomenclature_type_name = serializers.CharField(
        source='nomenclature_type.name',
        read_only=True
    )
    is_purchased = serializers.BooleanField(read_only=True)
    primary_supplier_name = serializers.SerializerMethodField()
    has_bom = serializers.SerializerMethodField()
    bom_id = serializers.SerializerMethodField()
    
    class Meta:
        model = NomenclatureItem
        fields = [
            'id', 'name',
            'catalog_category', 'catalog_category_name',
            'nomenclature_type', 'nomenclature_type_name',
            'drawing_number', 'unit',
            'is_purchased', 'primary_supplier_name', 'has_bom', 'bom_id',
            'is_active', 'created_at'
        ]
    
    def get_has_bom(self, obj):
        """Check if nomenclature item has a BOM structure WITH at least one component."""
        bom = obj.bom_structures.filter(is_active=True).first()
        if bom:
            # Проверяем есть ли элементы в составе (исключая корневой)
            return bom.items.filter(parent_item__isnull=False).exists()
        return False
    
    def get_bom_id(self, obj):
        """Get BOM structure ID if exists."""
        bom = obj.bom_structures.filter(is_active=True).first()
        return str(bom.id) if bom else None
    
    def get_primary_supplier_name(self, obj):
        primary = obj.item_suppliers.filter(is_primary=True, is_active=True).first()
        if primary:
            return primary.supplier.short_name or primary.supplier.name
        return None

class NomenclatureDetailSerializer(BaseModelSerializer):
    """Detail serializer for nomenclature items."""

    code = serializers.CharField(required=False, allow_blank=True)
    
    catalog_category_detail = CatalogCategoryListSerializer(
        source='catalog_category',
        read_only=True
    )
    nomenclature_type_detail = NomenclatureTypeSerializer(
        source='nomenclature_type',
        read_only=True
    )
    item_suppliers = NomenclatureSupplierInlineSerializer(
        many=True,
        read_only=True
    )
    is_purchased = serializers.BooleanField(read_only=True)
    is_manufactured = serializers.BooleanField(read_only=True)
    has_bom = serializers.SerializerMethodField()
    bom_id = serializers.SerializerMethodField()
    
    class Meta:
        model = NomenclatureItem
        fields = [
            'id', 'code', 'name',
            'catalog_category', 'catalog_category_detail',
            'nomenclature_type', 'nomenclature_type_detail',
            'drawing_number', 'description', 'specifications',
            'unit',
            'item_suppliers',
            'is_purchased', 'is_manufactured',
            'has_bom', 'bom_id',
            'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_purchased', 'is_manufactured', 'has_bom', 'bom_id', 'created_at', 'updated_at']

    def create(self, validated_data):
        if not validated_data.get('code'):
            code = f"nom_{uuid.uuid4().hex[:8]}"
            while NomenclatureItem.objects.filter(code=code).exists():
                code = f"nom_{uuid.uuid4().hex[:8]}"
            validated_data['code'] = code
        return super().create(validated_data)
    
    def get_has_bom(self, obj):
        """Check if nomenclature item has a BOM structure WITH at least one component."""
        bom = obj.bom_structures.filter(is_active=True).first()
        if bom:
            # Проверяем есть ли элементы в составе (исключая корневой)
            return bom.items.filter(parent_item__isnull=False).exists()
        return False
    
    def get_bom_id(self, obj):
        """Get BOM structure ID if exists."""
        bom = obj.bom_structures.filter(is_active=True).first()
        return str(bom.id) if bom else None


class NomenclatureMinimalSerializer(serializers.ModelSerializer):
    """Minimal serializer for nomenclature items (for nested representations)."""
    
    catalog_category_name = serializers.CharField(
        source='catalog_category.name',
        read_only=True
    )
    
    class Meta:
        model = NomenclatureItem
        fields = ['id', 'name', 'catalog_category', 'catalog_category_name', 'unit']


# =============================================================================
# Delay Reason Serializers
# =============================================================================

class DelayReasonSerializer(BaseModelSerializer):
    """Serializer for delay reasons."""
    
    production_config_display = serializers.CharField(
        source='get_production_config_display',
        read_only=True
    )
    
    class Meta:
        model = DelayReason
        fields = [
            'id', 'name', 'description',
            'applies_to_procurement', 'applies_to_production',
            'production_config', 'production_config_display',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# =============================================================================
# Tree Serializers (for BOM structure visualization)
# =============================================================================

class NomenclatureTreeSerializer(serializers.Serializer):
    """Serializer for nomenclature tree structure."""
    
    id = serializers.UUIDField()
    name = serializers.CharField()
    catalog_category = serializers.UUIDField(required=False)
    catalog_category_name = serializers.CharField(required=False)
    is_purchased = serializers.BooleanField(required=False)
    children = serializers.SerializerMethodField()
    quantity = serializers.DecimalField(max_digits=15, decimal_places=4, required=False)
    
    def get_children(self, obj):
        children = obj.get('children', [])
        if children:
            return NomenclatureTreeSerializer(children, many=True).data
        return []


# =============================================================================
# Legacy Support (for backward compatibility)
# =============================================================================

class NomenclatureCategorySerializer(serializers.Serializer):
    """
    DEPRECATED: Serializer for nomenclature category choices.
    Use CatalogCategoryListSerializer instead.
    """
    
    value = serializers.CharField()
    label = serializers.CharField()
    
    @classmethod
    def get_choices(cls):
        return [
            {'value': choice.value, 'label': choice.label}
            for choice in NomenclatureCategoryChoices
        ]
