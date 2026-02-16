"""
BOM Domain - Entities.

BOMItem represents a single item in the Bill of Materials structure.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional
from uuid import UUID

from domain.shared.base_entity import AuditableEntity
from domain.shared.value_objects import Quantity, NomenclatureCategory


@dataclass
class BOMItem(AuditableEntity):
    """
    A single item in a BOM structure.
    
    Represents the relationship between a parent item and a child item,
    with the quantity needed.
    """
    
    bom_id: UUID  # Reference to the BOM structure
    parent_item_id: Optional[UUID]  # None for root item
    child_item_id: UUID  # Reference to NomenclatureItem
    child_category: NomenclatureCategory  # Category of the child item
    
    # Quantity of child item needed for one parent
    quantity: Quantity = field(default_factory=lambda: Quantity(Decimal('1'), "шт"))
    
    # Position/order within parent
    position: int = 0
    
    # Optional notes for this specific usage
    notes: Optional[str] = None
    
    # For manufactured items - can override drawing number
    drawing_number_override: Optional[str] = None
    
    @property
    def is_root(self) -> bool:
        """Check if this is the root item of the BOM."""
        return self.parent_item_id is None
    
    @property
    def is_purchased(self) -> bool:
        """Check if child item is purchased."""
        return self.child_category.is_purchased
    
    @property
    def is_manufactured(self) -> bool:
        """Check if child item is manufactured."""
        return self.child_category.is_manufactured
    
    def update_quantity(self, new_quantity: Quantity) -> None:
        """Update the quantity."""
        self.quantity = new_quantity
        self.increment_version()


@dataclass
class BOMVersion(AuditableEntity):
    """
    Version tracking for BOM structures.
    
    When a BOM is modified significantly, a new version is created
    to maintain history and allow rollback.
    """
    
    bom_id: UUID
    version_number: int
    reason: Optional[str] = None
    is_active: bool = True
    
    # Snapshot data (JSON of the BOM structure at this version)
    snapshot: Optional[dict] = None
    
    def deactivate(self) -> None:
        """Deactivate this version."""
        self.is_active = False
        self.increment_version()
