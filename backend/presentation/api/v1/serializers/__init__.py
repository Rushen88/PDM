"""
Serializers Package.

All API serializers for the PDM system.
"""

from .base import BaseModelSerializer, UserMinimalSerializer

from .users import (
    RoleSerializer,
    RoleMinimalSerializer,
    UserRoleSerializer,
    UserListSerializer,
    UserDetailSerializer,
    UserCreateSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    UserProfileSerializer,
    SystemModuleSerializer,
    UserModuleAccessSerializer,
    RoleModuleAccessSerializer,
)

from .catalog import (
    CatalogCategoryListSerializer,
    CatalogCategoryDetailSerializer,
    NomenclatureTypeSerializer,
    SupplierListSerializer,
    SupplierDetailSerializer,
    ContractorListSerializer,
    ContractorDetailSerializer,
    ContactPersonSerializer,
    ContactPersonCreateSerializer,
    NomenclatureListSerializer,
    NomenclatureDetailSerializer,
    NomenclatureMinimalSerializer,
    NomenclatureTreeSerializer,
    NomenclatureCategorySerializer,
    NomenclatureSupplierSerializer,
    NomenclatureSupplierInlineSerializer,
    DelayReasonSerializer,
)

from .bom import (
    BOMItemSerializer,
    BOMItemTreeSerializer,
    BOMStructureListSerializer,
    BOMStructureDetailSerializer,
    BOMStructureTreeSerializer,
    BOMComparisonSerializer,
    BOMImportSerializer,
)

from .project import (
    ProjectItemListSerializer,
    ProjectItemDetailSerializer,
    ProjectItemTreeSerializer,
    ProjectListSerializer,
    ProjectDetailSerializer,
    ProjectTreeSerializer,
    ProjectGanttSerializer,
    ProjectProgressUpdateSerializer,
    ProjectBulkProgressUpdateSerializer,
)


__all__ = [
    # Base
    'BaseModelSerializer',
    'UserMinimalSerializer',
    
    # Users
    'RoleSerializer',
    'RoleMinimalSerializer',
    'UserRoleSerializer',
    'UserListSerializer',
    'UserDetailSerializer',
    'UserCreateSerializer',
    'ChangePasswordSerializer',
    'LoginSerializer',
    'UserProfileSerializer',
    
    # Catalog
    'NomenclatureTypeSerializer',
    'SupplierListSerializer',
    'SupplierDetailSerializer',
    'ContractorListSerializer',
    'ContractorDetailSerializer',
    'NomenclatureListSerializer',
    'NomenclatureDetailSerializer',
    'NomenclatureMinimalSerializer',
    'NomenclatureTreeSerializer',
    'NomenclatureCategorySerializer',
    
    # BOM
    'BOMItemSerializer',
    'BOMItemTreeSerializer',
    'BOMStructureListSerializer',
    'BOMStructureDetailSerializer',
    'BOMStructureTreeSerializer',
    'BOMComparisonSerializer',
    'BOMImportSerializer',
    
    # Project
    'ProjectItemListSerializer',
    'ProjectItemDetailSerializer',
    'ProjectItemTreeSerializer',
    'ProjectListSerializer',
    'ProjectDetailSerializer',
    'ProjectTreeSerializer',
    'ProjectGanttSerializer',
    'ProjectProgressUpdateSerializer',
    'ProjectBulkProgressUpdateSerializer',
]
