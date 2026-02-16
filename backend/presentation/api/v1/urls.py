"""
API v1 URL Configuration.

All API endpoints for version 1.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views.users import (
    AuthViewSet,
    UserViewSet,
    RoleViewSet,
    UserRoleViewSet,
    SystemModuleViewSet,
    UserModuleAccessViewSet,
)
from .views.catalog import (
    CatalogCategoryViewSet,
    NomenclatureTypeViewSet,
    NomenclatureViewSet,
    NomenclatureSupplierViewSet,
    SupplierViewSet,
    ContractorViewSet,
    ContactPersonViewSet,
    DelayReasonViewSet,
    BankDetailsViewSet,
)
from .views.bom import (
    BOMStructureViewSet,
    BOMItemViewSet,
)
from .views.project import (
    ProjectViewSet,
    ProjectItemViewSet,
)
from .views.project_settings import (
    ManufacturingStatusViewSet,
    PurchaseStatusViewSet,
    ManufacturingProblemReasonViewSet,
    ManufacturingProblemSubreasonViewSet,
    PurchaseProblemReasonViewSet,
    PurchaseProblemSubreasonViewSet,
    ProjectItemProblemViewSet,
)
from .views.procurement import (
    PurchaseOrderViewSet,
    PurchaseOrderItemViewSet,
    ProcurementScheduleViewSet,
    GoodsReceiptViewSet,
    GoodsReceiptItemViewSet,
)
from .views.production import (
    ProductionOrderViewSet,
    ProductionTaskViewSet,
)
from .views.workplace import WorkplaceViewSet
from .views.dashboard import DashboardViewSet
from .views.inventory import (
    WarehouseViewSet,
    StockItemViewSet,
    StockBatchViewSet,
    StockMovementViewSet,
    StockReservationViewSet,
    InventoryDocumentViewSet,
    InventoryItemViewSet,
    StockTransferViewSet,
    MaterialRequirementViewSet,
    ContractorWriteOffViewSet,
    ContractorReceiptViewSet,
)

# Create router
router = DefaultRouter()

# Auth & Users
router.register(r'auth', AuthViewSet, basename='auth')
router.register(r'users', UserViewSet, basename='users')
router.register(r'roles', RoleViewSet, basename='roles')
router.register(r'user-roles', UserRoleViewSet, basename='user-roles')
router.register(r'system-modules', SystemModuleViewSet, basename='system-modules')
router.register(r'user-module-access', UserModuleAccessViewSet, basename='user-module-access')

# Catalog
router.register(r'catalog-categories', CatalogCategoryViewSet, basename='catalog-categories')
router.register(r'nomenclature-types', NomenclatureTypeViewSet, basename='nomenclature-types')
router.register(r'nomenclature', NomenclatureViewSet, basename='nomenclature')
router.register(r'nomenclature-suppliers', NomenclatureSupplierViewSet, basename='nomenclature-suppliers')
router.register(r'suppliers', SupplierViewSet, basename='suppliers')
router.register(r'contractors', ContractorViewSet, basename='contractors')
router.register(r'contact-persons', ContactPersonViewSet, basename='contact-persons')
router.register(r'delay-reasons', DelayReasonViewSet, basename='delay-reasons')
router.register(r'bank-details', BankDetailsViewSet, basename='bank-details')

# BOM
router.register(r'bom', BOMStructureViewSet, basename='bom')
router.register(r'bom-items', BOMItemViewSet, basename='bom-items')

# Projects
router.register(r'projects', ProjectViewSet, basename='projects')
router.register(r'project-items', ProjectItemViewSet, basename='project-items')

# Project Settings (Status and Problem Reason references)
router.register(r'manufacturing-statuses', ManufacturingStatusViewSet, basename='manufacturing-statuses')
router.register(r'purchase-statuses', PurchaseStatusViewSet, basename='purchase-statuses')
router.register(r'manufacturing-problem-reasons', ManufacturingProblemReasonViewSet, basename='manufacturing-problem-reasons')
router.register(r'manufacturing-problem-subreasons', ManufacturingProblemSubreasonViewSet, basename='manufacturing-problem-subreasons')
router.register(r'purchase-problem-reasons', PurchaseProblemReasonViewSet, basename='purchase-problem-reasons')
router.register(r'purchase-problem-subreasons', PurchaseProblemSubreasonViewSet, basename='purchase-problem-subreasons')
router.register(r'project-item-problems', ProjectItemProblemViewSet, basename='project-item-problems')

# Procurement
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchase-orders')
router.register(r'purchase-order-items', PurchaseOrderItemViewSet, basename='purchase-order-items')
router.register(r'procurement-schedule', ProcurementScheduleViewSet, basename='procurement-schedule')
router.register(r'goods-receipts', GoodsReceiptViewSet, basename='goods-receipts')
router.register(r'goods-receipt-items', GoodsReceiptItemViewSet, basename='goods-receipt-items')

# Production
router.register(r'production-orders', ProductionOrderViewSet, basename='production-orders')
router.register(r'production-tasks', ProductionTaskViewSet, basename='production-tasks')

# Workplace (Employee workstation)
router.register(r'workplace', WorkplaceViewSet, basename='workplace')

# Dashboard (Executive management panel)
router.register(r'dashboard', DashboardViewSet, basename='dashboard')

# Warehouse / Inventory
router.register(r'warehouses', WarehouseViewSet, basename='warehouses')
router.register(r'stock-items', StockItemViewSet, basename='stock-items')
router.register(r'stock-batches', StockBatchViewSet, basename='stock-batches')
router.register(r'stock-movements', StockMovementViewSet, basename='stock-movements')
router.register(r'stock-reservations', StockReservationViewSet, basename='stock-reservations')
router.register(r'inventory-documents', InventoryDocumentViewSet, basename='inventory-documents')
router.register(r'inventory-items', InventoryItemViewSet, basename='inventory-items')
router.register(r'stock-transfers', StockTransferViewSet, basename='stock-transfers')
router.register(r'material-requirements', MaterialRequirementViewSet, basename='material-requirements')
router.register(r'contractor-writeoffs', ContractorWriteOffViewSet, basename='contractor-writeoffs')
router.register(r'contractor-receipts', ContractorReceiptViewSet, basename='contractor-receipts')

app_name = 'api_v1'

urlpatterns = [
    path('', include(router.urls)),
]
