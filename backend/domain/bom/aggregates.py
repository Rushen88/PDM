"""
BOM Domain - Aggregates.

BOMStructure is the aggregate root that manages the hierarchical
Bill of Materials for a product.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, List, Optional, Set, Tuple
from uuid import UUID

from domain.shared.base_aggregate import AggregateRoot
from domain.shared.value_objects import (
    NomenclatureCategory,
    Quantity,
    DrawingNumber,
)
from domain.shared.events import (
    BOMStructureCreated,
    BOMItemAdded,
    BOMItemRemoved,
    BOMVersionCreated,
)
from domain.shared.exceptions import (
    ValidationException,
    BusinessRuleViolationException,
    CircularReferenceException,
    EntityNotFoundException,
)

from .entities import BOMItem, BOMVersion


# Valid child categories for each parent category
VALID_CHILDREN: Dict[NomenclatureCategory, Set[NomenclatureCategory]] = {
    NomenclatureCategory.STAND: {
        NomenclatureCategory.SYSTEM,
    },
    NomenclatureCategory.SYSTEM: {
        NomenclatureCategory.SUBSYSTEM,
        NomenclatureCategory.ASSEMBLY_UNIT,
        NomenclatureCategory.PART,
        NomenclatureCategory.MATERIAL,
        NomenclatureCategory.STANDARD_PRODUCT,
        NomenclatureCategory.OTHER_PRODUCT,
    },
    NomenclatureCategory.SUBSYSTEM: {
        NomenclatureCategory.SUBSYSTEM,
        NomenclatureCategory.ASSEMBLY_UNIT,
        NomenclatureCategory.PART,
        NomenclatureCategory.MATERIAL,
        NomenclatureCategory.STANDARD_PRODUCT,
        NomenclatureCategory.OTHER_PRODUCT,
    },
    NomenclatureCategory.ASSEMBLY_UNIT: {
        NomenclatureCategory.PART,
        NomenclatureCategory.MATERIAL,
        NomenclatureCategory.STANDARD_PRODUCT,
        NomenclatureCategory.OTHER_PRODUCT,
    },
    NomenclatureCategory.PART: {
        NomenclatureCategory.MATERIAL,
    },
}


@dataclass
class BOMStructure(AggregateRoot):
    """
    Aggregate root for Bill of Materials structure.
    
    Manages the hierarchical tree of components for a product.
    A BOM defines what items are needed to manufacture a product
    and in what quantities.
    
    Key responsibilities:
    - Maintain the tree structure of components
    - Validate parent-child relationships based on categories
    - Prevent circular references
    - Version control for BOM changes
    """
    
    # Root item (the product being manufactured)
    root_item_id: UUID
    root_category: NomenclatureCategory
    
    # Name/description
    name: str = ""
    description: Optional[str] = None
    
    # Version tracking
    current_version: int = 1
    
    # BOM items (flat list, tree structure via parent_item_id)
    _items: List[BOMItem] = field(default_factory=list)
    
    # Version history
    _versions: List[BOMVersion] = field(default_factory=list)
    
    # Status
    is_active: bool = True
    is_locked: bool = False  # Prevent modifications when True
    
    def __post_init__(self):
        if not self.root_item_id:
            raise ValidationException("Root item ID is required", "root_item_id")
        
        # Add root item to items list
        if not any(item.parent_item_id is None for item in self._items):
            root_item = BOMItem(
                bom_id=self.id,
                parent_item_id=None,
                child_item_id=self.root_item_id,
                child_category=self.root_category,
            )
            self._items.append(root_item)
    
    # =========================================================================
    # PROPERTIES
    # =========================================================================
    
    @property
    def items(self) -> List[BOMItem]:
        """Get all BOM items."""
        return self._items.copy()
    
    @property
    def root_item(self) -> BOMItem:
        """Get the root BOM item."""
        for item in self._items:
            if item.is_root:
                return item
        raise ValidationException("Root item not found in BOM structure")
    
    @property
    def versions(self) -> List[BOMVersion]:
        """Get version history."""
        return self._versions.copy()
    
    # =========================================================================
    # TREE NAVIGATION
    # =========================================================================
    
    def get_children(self, parent_item_id: UUID) -> List[BOMItem]:
        """Get all direct children of an item."""
        return [
            item for item in self._items
            if item.parent_item_id == parent_item_id
        ]
    
    def get_item_by_child_id(
        self,
        child_item_id: UUID,
        parent_item_id: Optional[UUID] = None
    ) -> Optional[BOMItem]:
        """Get BOM item by child nomenclature item ID."""
        for item in self._items:
            if item.child_item_id == child_item_id:
                if parent_item_id is None or item.parent_item_id == parent_item_id:
                    return item
        return None
    
    def get_all_descendants(self, parent_item_id: UUID) -> List[BOMItem]:
        """Get all descendants (children, grandchildren, etc.) of an item."""
        descendants = []
        children = self.get_children(parent_item_id)
        
        for child in children:
            descendants.append(child)
            descendants.extend(self.get_all_descendants(child.child_item_id))
        
        return descendants
    
    def get_path_to_root(self, item_id: UUID) -> List[BOMItem]:
        """Get the path from an item to the root."""
        path = []
        current_id = item_id
        
        while current_id is not None:
            item = self.get_item_by_child_id(current_id)
            if item:
                path.append(item)
                current_id = item.parent_item_id
            else:
                break
        
        return path
    
    def get_level(self, item_id: UUID) -> int:
        """Get the level (depth) of an item in the tree (root = 0)."""
        return len(self.get_path_to_root(item_id)) - 1
    
    # =========================================================================
    # COMMANDS
    # =========================================================================
    
    def add_item(
        self,
        parent_item_id: UUID,
        child_item_id: UUID,
        child_category: NomenclatureCategory,
        quantity: Quantity,
        position: Optional[int] = None,
        notes: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> BOMItem:
        """
        Add an item to the BOM structure.
        
        Validates:
        - BOM is not locked
        - Parent exists in the structure
        - Child category is valid for parent category
        - No circular reference
        - Item doesn't already exist under this parent
        """
        if self.is_locked:
            raise BusinessRuleViolationException(
                "BOM_LOCKED",
                "Cannot modify a locked BOM structure"
            )
        
        # Find parent item
        parent_item = self.get_item_by_child_id(parent_item_id)
        if not parent_item:
            raise EntityNotFoundException("BOMItem", parent_item_id)
        
        # Validate category relationship
        self._validate_category_relationship(parent_item.child_category, child_category)
        
        # Check for circular reference
        self._check_circular_reference(parent_item_id, child_item_id)
        
        # Check if item already exists under this parent
        existing = self.get_item_by_child_id(child_item_id, parent_item_id)
        if existing:
            raise BusinessRuleViolationException(
                "DUPLICATE_BOM_ITEM",
                f"Item {child_item_id} already exists under parent {parent_item_id}"
            )
        
        # Determine position
        if position is None:
            siblings = self.get_children(parent_item_id)
            position = len(siblings) + 1
        
        # Create new BOM item
        bom_item = BOMItem(
            bom_id=self.id,
            parent_item_id=parent_item_id,
            child_item_id=child_item_id,
            child_category=child_category,
            quantity=quantity,
            position=position,
            notes=notes,
            created_by=user_id,
        )
        
        self._items.append(bom_item)
        self.updated_by = user_id
        self.increment_version()
        
        self.add_domain_event(BOMItemAdded(
            bom_id=self.id,
            parent_id=parent_item_id,
            child_id=child_item_id,
            quantity=str(quantity)
        ))
        
        return bom_item
    
    def remove_item(
        self,
        child_item_id: UUID,
        parent_item_id: Optional[UUID] = None,
        remove_descendants: bool = False,
        user_id: Optional[UUID] = None,
    ) -> None:
        """
        Remove an item from the BOM structure.
        
        If remove_descendants is True, also removes all children.
        Otherwise, raises error if item has children.
        """
        if self.is_locked:
            raise BusinessRuleViolationException(
                "BOM_LOCKED",
                "Cannot modify a locked BOM structure"
            )
        
        item = self.get_item_by_child_id(child_item_id, parent_item_id)
        if not item:
            raise EntityNotFoundException("BOMItem", child_item_id)
        
        if item.is_root:
            raise BusinessRuleViolationException(
                "CANNOT_REMOVE_ROOT",
                "Cannot remove root item from BOM structure"
            )
        
        # Check for children
        children = self.get_children(child_item_id)
        if children:
            if remove_descendants:
                # Remove all descendants first
                for child in self.get_all_descendants(child_item_id):
                    self._items.remove(child)
            else:
                raise BusinessRuleViolationException(
                    "HAS_CHILDREN",
                    "Cannot remove item with children. Set remove_descendants=True to remove all."
                )
        
        self._items.remove(item)
        self.updated_by = user_id
        self.increment_version()
        
        self.add_domain_event(BOMItemRemoved(
            bom_id=self.id,
            parent_id=item.parent_item_id,
            child_id=child_item_id
        ))
    
    def update_quantity(
        self,
        child_item_id: UUID,
        parent_item_id: Optional[UUID],
        new_quantity: Quantity,
        user_id: Optional[UUID] = None,
    ) -> None:
        """Update quantity for an item."""
        if self.is_locked:
            raise BusinessRuleViolationException(
                "BOM_LOCKED",
                "Cannot modify a locked BOM structure"
            )
        
        item = self.get_item_by_child_id(child_item_id, parent_item_id)
        if not item:
            raise EntityNotFoundException("BOMItem", child_item_id)
        
        item.update_quantity(new_quantity)
        self.updated_by = user_id
        self.increment_version()
    
    def create_version(
        self,
        reason: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> BOMVersion:
        """Create a new version snapshot of the BOM."""
        # Create snapshot of current state
        snapshot = {
            "items": [
                {
                    "id": str(item.id),
                    "parent_item_id": str(item.parent_item_id) if item.parent_item_id else None,
                    "child_item_id": str(item.child_item_id),
                    "child_category": item.child_category.value,
                    "quantity": str(item.quantity),
                    "position": item.position,
                }
                for item in self._items
            ]
        }
        
        version = BOMVersion(
            bom_id=self.id,
            version_number=self.current_version,
            reason=reason,
            snapshot=snapshot,
            created_by=user_id,
        )
        
        self._versions.append(version)
        self.current_version += 1
        self.updated_by = user_id
        self.increment_version()
        
        self.add_domain_event(BOMVersionCreated(
            bom_id=self.id,
            old_version=self.current_version - 1,
            new_version=self.current_version,
            reason=reason
        ))
        
        return version
    
    def lock(self, user_id: Optional[UUID] = None) -> None:
        """Lock the BOM to prevent modifications."""
        self.is_locked = True
        self.updated_by = user_id
        self.increment_version()
    
    def unlock(self, user_id: Optional[UUID] = None) -> None:
        """Unlock the BOM to allow modifications."""
        self.is_locked = False
        self.updated_by = user_id
        self.increment_version()
    
    # =========================================================================
    # VALIDATION
    # =========================================================================
    
    def _validate_category_relationship(
        self,
        parent_category: NomenclatureCategory,
        child_category: NomenclatureCategory
    ) -> None:
        """Validate that the child category is valid for the parent category."""
        valid_children = VALID_CHILDREN.get(parent_category, set())
        
        if child_category not in valid_children:
            raise BusinessRuleViolationException(
                "INVALID_CATEGORY_RELATIONSHIP",
                f"Cannot add {child_category.value} as a child of {parent_category.value}. "
                f"Valid children: {[c.value for c in valid_children]}"
            )
    
    def _check_circular_reference(
        self,
        parent_item_id: UUID,
        child_item_id: UUID
    ) -> None:
        """Check for circular reference when adding an item."""
        # If child_item_id is an ancestor of parent_item_id, we have a cycle
        path = self.get_path_to_root(parent_item_id)
        ancestor_ids = {item.child_item_id for item in path}
        
        if child_item_id in ancestor_ids:
            raise CircularReferenceException(
                list(ancestor_ids) + [child_item_id]
            )
    
    def validate(self) -> None:
        """Validate aggregate invariants."""
        # Check that we have a root item
        root_items = [item for item in self._items if item.is_root]
        if len(root_items) != 1:
            raise ValidationException(
                f"BOM must have exactly one root item, found {len(root_items)}"
            )
        
        # Check that all non-root items have valid parents
        for item in self._items:
            if not item.is_root:
                parent = self.get_item_by_child_id(item.parent_item_id)
                if not parent:
                    raise ValidationException(
                        f"Item {item.child_item_id} has invalid parent {item.parent_item_id}"
                    )
    
    # =========================================================================
    # CALCULATIONS
    # =========================================================================
    
    def calculate_total_quantity(
        self,
        child_item_id: UUID,
        root_quantity: Decimal = Decimal('1')
    ) -> Quantity:
        """
        Calculate total quantity of an item needed, considering all paths
        from root to the item.
        
        Example: If item A contains 2 of B, and B contains 3 of C,
        then total C needed for 1 A is 2 * 3 = 6.
        """
        total = Decimal('0')
        unit = "шт"
        
        def find_paths(current_id: UUID, accumulated_qty: Decimal):
            nonlocal total, unit
            
            for item in self._items:
                if item.child_item_id == current_id:
                    current_qty = accumulated_qty * item.quantity.value
                    unit = item.quantity.unit
                    
                    if item.is_root:
                        total += current_qty
                    else:
                        find_paths(item.parent_item_id, current_qty)
        
        find_paths(child_item_id, root_quantity)
        
        return Quantity(total, unit)
    
    def get_purchased_items(self) -> List[Tuple[BOMItem, Quantity]]:
        """
        Get all purchased items in the BOM with their total quantities.
        Returns list of (BOMItem, total_quantity) tuples.
        """
        result = []
        
        for item in self._items:
            if item.is_purchased:
                total_qty = self.calculate_total_quantity(item.child_item_id)
                result.append((item, total_qty))
        
        return result
    
    def get_manufactured_items(self) -> List[Tuple[BOMItem, Quantity]]:
        """
        Get all manufactured items in the BOM with their total quantities.
        Returns list of (BOMItem, total_quantity) tuples.
        """
        result = []
        
        for item in self._items:
            if item.is_manufactured:
                total_qty = self.calculate_total_quantity(item.child_item_id)
                result.append((item, total_qty))
        
        return result
    
    # =========================================================================
    # FACTORY METHODS
    # =========================================================================
    
    @classmethod
    def create_for_stand(
        cls,
        stand_id: UUID,
        name: str,
        description: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> BOMStructure:
        """Factory method to create BOM for a Stand."""
        bom = cls(
            root_item_id=stand_id,
            root_category=NomenclatureCategory.STAND,
            name=name,
            description=description,
            created_by=user_id,
        )
        
        bom.add_domain_event(BOMStructureCreated(
            bom_id=bom.id,
            root_item_id=stand_id,
            version=1
        ))
        
        return bom
    
    @classmethod
    def create_for_system(
        cls,
        system_id: UUID,
        name: str,
        description: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> BOMStructure:
        """Factory method to create BOM for a System."""
        bom = cls(
            root_item_id=system_id,
            root_category=NomenclatureCategory.SYSTEM,
            name=name,
            description=description,
            created_by=user_id,
        )
        
        bom.add_domain_event(BOMStructureCreated(
            bom_id=bom.id,
            root_item_id=system_id,
            version=1
        ))
        
        return bom
