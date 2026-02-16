"""
Persistence Models Package.

All Django ORM models for the PDM system.
"""

# Base mixins and managers
from .base import (
    TimeStampedMixin,
    SoftDeleteMixin,
    VersionedMixin,
    AuditMixin,
    ActiveManager,
    AllObjectsManager,
)

# User models
from .users import (
    User,
    Role,
    UserRole,
    ModuleAccessChoices,
    SystemModule,
    UserModuleAccess,
    RoleModuleAccess,
)

# Catalog models
from .catalog import (
    CatalogCategory,
    NomenclatureItem,
    NomenclatureType,
    NomenclatureSupplier,
    NomenclatureCategoryChoices,
    Supplier,
    Contractor,
    ContactPerson,
    DelayReason,
    SupplierOffer,  # Alias for backward compatibility
    BankDetails,
)

# BOM models
from .bom import (
    BOMStructure,
    BOMItem,
)

# Project models
from .project import (
    Project,
    ProjectItem,
    ProjectStatusChoices,
    ManufacturingStatusChoices,
    ContractorStatusChoices,
    PurchaseStatusChoices,
    ManufacturerTypeChoices,
    MaterialSupplyTypeChoices,
    UserAssignment,
)

# Project settings models
from .project_settings import (
    ManufacturingStatus,
    PurchaseStatus,
    ManufacturingProblemReason,
    ManufacturingProblemSubreason,
    PurchaseProblemReason,
    PurchaseProblemSubreason,
    ProjectItemProblem,
)

# Procurement models
from .procurement import (
    PurchaseOrder,
    PurchaseOrderItem,
    GoodsReceipt,
    GoodsReceiptItem,
)

# Inventory models
from .inventory import (
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

# Production models
from .production import (
    ProductionOrder,
    ProductionTask,
    ProductionProgress,
)

# Audit models
from .audit import (
    AuditLog,
    ProgressSnapshot,
    SystemSetting,
)


__all__ = [
    # Base
    'TimeStampedMixin',
    'SoftDeleteMixin',
    'VersionedMixin',
    'AuditMixin',
    'ActiveManager',
    'AllObjectsManager',
    
    # Users
    'User',
    'Role',
    'UserRole',
    'ModuleAccessChoices',
    'SystemModule',
    'UserModuleAccess',
    'RoleModuleAccess',
    
    # Catalog
    'CatalogCategory',
    'NomenclatureItem',
    'NomenclatureType',
    'NomenclatureSupplier',
    'NomenclatureCategoryChoices',
    'Supplier',
    'Contractor',
    'ContactPerson',
    'DelayReason',
    'SupplierOffer',
    'BankDetails',
    
    # BOM
    'BOMStructure',
    'BOMItem',
    
    # Project
    'Project',
    'ProjectItem',
    'ProjectStatusChoices',
    'ManufacturingStatusChoices',
    'ContractorStatusChoices',
    'PurchaseStatusChoices',
    'ManufacturerTypeChoices',
    'MaterialSupplyTypeChoices',
    'UserAssignment',
    
    # Project Settings
    'ManufacturingStatus',
    'PurchaseStatus',
    'ManufacturingProblemReason',
    'ManufacturingProblemSubreason',
    'PurchaseProblemReason',
    'PurchaseProblemSubreason',
    'ProjectItemProblem',
    
    # Procurement
    'PurchaseOrder',
    'PurchaseOrderItem',
    'GoodsReceipt',
    'GoodsReceiptItem',
    
    # Inventory
    'Warehouse',
    'StockItem',
    'StockReservation',
    'StockMovement',
    'StockBatch',
    'InventoryDocument',
    'InventoryItem',
    'StockTransfer',
    'StockTransferItem',
    'MaterialRequirement',
    'ProblemReason',
    'ContractorWriteOff',
    'ContractorWriteOffItem',
    'ContractorReceipt',
    'ContractorReceiptItem',
    
    # Production
    'ProductionOrder',
    'ProductionTask',
    'ProductionProgress',
    
    # Audit
    'AuditLog',
    'ProgressSnapshot',
    'SystemSetting',
]
