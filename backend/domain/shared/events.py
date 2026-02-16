"""
Domain Events.

Domain events are records of significant business occurrences.
They are used for decoupling and eventual consistency.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID, uuid4


@dataclass(frozen=True)
class DomainEvent:
    """
    Base class for all domain events.
    
    Domain events are immutable records of something that happened in the domain.
    They are used for:
    - Decoupling bounded contexts
    - Triggering side effects (notifications, recalculations)
    - Event sourcing (if needed)
    - Audit trail
    """
    
    event_id: UUID = field(default_factory=uuid4)
    occurred_at: datetime = field(default_factory=datetime.utcnow)
    
    @property
    def event_type(self) -> str:
        """Get the event type name."""
        return self.__class__.__name__


# =============================================================================
# CATALOG EVENTS
# =============================================================================

@dataclass(frozen=True)
class NomenclatureItemCreated(DomainEvent):
    """Event raised when a new nomenclature item is created."""
    
    item_id: UUID
    category: str
    name: str
    created_by: Optional[UUID] = None


@dataclass(frozen=True)
class NomenclatureItemUpdated(DomainEvent):
    """Event raised when a nomenclature item is updated."""
    
    item_id: UUID
    changes: Dict[str, Any] = field(default_factory=dict)
    updated_by: Optional[UUID] = None


@dataclass(frozen=True)
class SupplierAssigned(DomainEvent):
    """Event raised when a supplier is assigned to a purchased item."""
    
    item_id: UUID
    supplier_id: UUID
    is_default: bool = False


# =============================================================================
# BOM EVENTS
# =============================================================================

@dataclass(frozen=True)
class BOMStructureCreated(DomainEvent):
    """Event raised when a BOM structure is created."""
    
    bom_id: UUID
    root_item_id: UUID
    version: int = 1


@dataclass(frozen=True)
class BOMItemAdded(DomainEvent):
    """Event raised when an item is added to a BOM structure."""
    
    bom_id: UUID
    parent_id: UUID
    child_id: UUID
    quantity: str  # Serialized Quantity


@dataclass(frozen=True)
class BOMItemRemoved(DomainEvent):
    """Event raised when an item is removed from a BOM structure."""
    
    bom_id: UUID
    parent_id: UUID
    child_id: UUID


@dataclass(frozen=True)
class BOMVersionCreated(DomainEvent):
    """Event raised when a new BOM version is created."""
    
    bom_id: UUID
    old_version: int
    new_version: int
    reason: Optional[str] = None


# =============================================================================
# PROJECT EVENTS
# =============================================================================

@dataclass(frozen=True)
class ProjectCreated(DomainEvent):
    """Event raised when a new project (Stand) is created."""
    
    project_id: UUID
    name: str
    created_by: Optional[UUID] = None


@dataclass(frozen=True)
class ProjectStatusChanged(DomainEvent):
    """Event raised when project status changes."""
    
    project_id: UUID
    old_status: str
    new_status: str
    changed_by: Optional[UUID] = None


@dataclass(frozen=True)
class ProjectItemAssigned(DomainEvent):
    """Event raised when an item is assigned to a project."""
    
    project_id: UUID
    item_id: UUID
    responsible_user_id: Optional[UUID] = None


@dataclass(frozen=True)
class ResponsibleAssigned(DomainEvent):
    """Event raised when a responsible person is assigned."""
    
    project_id: UUID
    item_id: UUID
    user_id: UUID
    apply_to_children: bool = False


# =============================================================================
# PRODUCTION EVENTS
# =============================================================================

@dataclass(frozen=True)
class ProductionTaskCreated(DomainEvent):
    """Event raised when a production task is created."""
    
    task_id: UUID
    project_id: UUID
    item_id: UUID
    manufacturer_type: str


@dataclass(frozen=True)
class ProductionStatusChanged(DomainEvent):
    """Event raised when production status changes."""
    
    task_id: UUID
    old_status: str
    new_status: str
    reason: Optional[str] = None
    changed_by: Optional[UUID] = None


@dataclass(frozen=True)
class ProductionDatesUpdated(DomainEvent):
    """Event raised when production dates are updated."""
    
    task_id: UUID
    planned_start: Optional[str] = None
    planned_end: Optional[str] = None
    actual_start: Optional[str] = None
    actual_end: Optional[str] = None


@dataclass(frozen=True)
class ContractorAssigned(DomainEvent):
    """Event raised when a contractor is assigned to production."""
    
    task_id: UUID
    contractor_id: UUID
    material_supply_type: str


# =============================================================================
# PROCUREMENT EVENTS
# =============================================================================

@dataclass(frozen=True)
class PurchaseOrderCreated(DomainEvent):
    """Event raised when a purchase order is created."""
    
    order_id: UUID
    project_id: UUID
    supplier_id: UUID


@dataclass(frozen=True)
class PurchaseItemStatusChanged(DomainEvent):
    """Event raised when purchase item status changes."""
    
    order_id: UUID
    item_id: UUID
    old_status: str
    new_status: str
    reason: Optional[str] = None


@dataclass(frozen=True)
class DeliveryDelayed(DomainEvent):
    """Event raised when a delivery is delayed."""
    
    order_id: UUID
    item_id: UUID
    original_date: str
    new_expected_date: str
    delay_reason_id: Optional[UUID] = None


@dataclass(frozen=True)
class ItemDelivered(DomainEvent):
    """Event raised when an item is delivered."""
    
    order_id: UUID
    item_id: UUID
    quantity: str
    delivery_date: str


# =============================================================================
# INVENTORY EVENTS
# =============================================================================

@dataclass(frozen=True)
class StockReceived(DomainEvent):
    """Event raised when stock is received."""
    
    item_id: UUID
    quantity: str
    source_order_id: Optional[UUID] = None


@dataclass(frozen=True)
class StockReserved(DomainEvent):
    """Event raised when stock is reserved for a project."""
    
    item_id: UUID
    quantity: str
    project_id: UUID
    production_task_id: Optional[UUID] = None


@dataclass(frozen=True)
class StockConsumed(DomainEvent):
    """Event raised when stock is consumed for production."""
    
    item_id: UUID
    quantity: str
    production_task_id: UUID


@dataclass(frozen=True)
class StockAdjusted(DomainEvent):
    """Event raised when stock is manually adjusted."""
    
    item_id: UUID
    old_quantity: str
    new_quantity: str
    reason: str
    adjusted_by: Optional[UUID] = None


# =============================================================================
# PROGRESS EVENTS
# =============================================================================

@dataclass(frozen=True)
class ProgressRecalculationRequested(DomainEvent):
    """Event raised when progress recalculation is needed."""
    
    project_id: UUID
    item_id: Optional[UUID] = None  # If None, recalculate entire project
    trigger_event: Optional[str] = None


@dataclass(frozen=True)
class ProgressUpdated(DomainEvent):
    """Event raised when progress is updated."""
    
    project_id: UUID
    item_id: UUID
    old_progress: str
    new_progress: str


@dataclass(frozen=True)
class MilestoneReached(DomainEvent):
    """Event raised when a project milestone is reached."""
    
    project_id: UUID
    milestone_name: str
    reached_at: datetime = field(default_factory=datetime.utcnow)
