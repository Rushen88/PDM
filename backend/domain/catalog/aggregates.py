"""
Catalog Domain - Aggregates.

NomenclatureItem is the main aggregate root for the catalog domain.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Set
from uuid import UUID

from domain.shared.base_aggregate import AggregateRoot
from domain.shared.value_objects import (
    NomenclatureCategory,
    DrawingNumber,
    Quantity,
)
from domain.shared.events import (
    NomenclatureItemCreated,
    NomenclatureItemUpdated,
    SupplierAssigned,
)
from domain.shared.exceptions import (
    ValidationException,
    BusinessRuleViolationException,
)

from .entities import SupplierOffer


@dataclass
class NomenclatureItem(AggregateRoot):
    """
    Aggregate root for nomenclature items.
    
    This is the core entity for all items in the catalog:
    - Materials, Standard Products, Other Products (purchased)
    - Parts, Assembly Units, Subsystems, Systems (manufactured)
    
    The category determines which fields are applicable.
    """
    
    # Core identification
    code: str = ""  # Unique item code
    name: str = ""
    category: NomenclatureCategory = NomenclatureCategory.MATERIAL
    nomenclature_type_id: Optional[UUID] = None
    
    # Drawing information (for manufactured items)
    drawing_number: Optional[DrawingNumber] = None
    
    # Description and specifications
    description: Optional[str] = None
    specifications: Optional[str] = None  # Technical specifications
    
    # Unit of measure
    unit: str = "шт"
    
    # For purchased items - supplier offers
    _supplier_offers: List[SupplierOffer] = field(default_factory=list)
    default_supplier_id: Optional[UUID] = None
    
    # Status
    is_active: bool = True
    
    # Tags for filtering/searching
    tags: Set[str] = field(default_factory=set)
    
    def __post_init__(self):
        if not self.name:
            raise ValidationException("Item name is required", "name")
        if not self.code:
            raise ValidationException("Item code is required", "code")
    
    # =========================================================================
    # PROPERTIES
    # =========================================================================
    
    @property
    def is_purchased(self) -> bool:
        """Check if this item is purchased (not manufactured)."""
        return self.category.is_purchased
    
    @property
    def is_manufactured(self) -> bool:
        """Check if this item is manufactured."""
        return self.category.is_manufactured
    
    @property
    def supplier_offers(self) -> List[SupplierOffer]:
        """Get all supplier offers."""
        return self._supplier_offers.copy()
    
    @property
    def default_offer(self) -> Optional[SupplierOffer]:
        """Get the default supplier offer."""
        for offer in self._supplier_offers:
            if offer.is_default and offer.is_valid:
                return offer
        # Return first valid offer if no default set
        for offer in self._supplier_offers:
            if offer.is_valid:
                return offer
        return None
    
    @property
    def default_lead_time_days(self) -> int:
        """Get default lead time in days."""
        offer = self.default_offer
        if offer:
            return offer.delivery_terms.lead_time_days
        return 7  # Default fallback
    
    # =========================================================================
    # COMMANDS
    # =========================================================================
    
    def update_basic_info(
        self,
        name: Optional[str] = None,
        description: Optional[str] = None,
        specifications: Optional[str] = None,
        unit: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> None:
        """Update basic information."""
        changes = {}
        
        if name is not None and name != self.name:
            self.name = name
            changes["name"] = name
        
        if description is not None and description != self.description:
            self.description = description
            changes["description"] = description
        
        if specifications is not None and specifications != self.specifications:
            self.specifications = specifications
            changes["specifications"] = specifications
        
        if unit is not None and unit != self.unit:
            self.unit = unit
            changes["unit"] = unit
        
        if changes:
            self.updated_by = user_id
            self.increment_version()
            self.add_domain_event(NomenclatureItemUpdated(
                item_id=self.id,
                changes=changes,
                updated_by=user_id
            ))
    
    def set_drawing_number(
        self,
        drawing_number: DrawingNumber,
        user_id: Optional[UUID] = None
    ) -> None:
        """Set or update the drawing number."""
        if not self.is_manufactured:
            raise BusinessRuleViolationException(
                "DRAWING_FOR_MANUFACTURED_ONLY",
                "Drawing numbers can only be set for manufactured items"
            )
        
        self.drawing_number = drawing_number
        self.updated_by = user_id
        self.increment_version()
    
    def add_supplier_offer(
        self,
        offer: SupplierOffer,
        set_as_default: bool = False,
        user_id: Optional[UUID] = None
    ) -> None:
        """Add a supplier offer."""
        if not self.is_purchased:
            raise BusinessRuleViolationException(
                "SUPPLIER_FOR_PURCHASED_ONLY",
                "Supplier offers can only be added to purchased items"
            )
        
        # Check if supplier already has an offer
        for existing in self._supplier_offers:
            if existing.supplier_id == offer.supplier_id:
                raise BusinessRuleViolationException(
                    "DUPLICATE_SUPPLIER_OFFER",
                    f"Supplier already has an offer for this item"
                )
        
        self._supplier_offers.append(offer)
        
        if set_as_default or len(self._supplier_offers) == 1:
            self._set_default_supplier(offer.supplier_id)
        
        self.updated_by = user_id
        self.increment_version()
        
        self.add_domain_event(SupplierAssigned(
            item_id=self.id,
            supplier_id=offer.supplier_id,
            is_default=set_as_default
        ))
    
    def remove_supplier_offer(
        self,
        supplier_id: UUID,
        user_id: Optional[UUID] = None
    ) -> None:
        """Remove a supplier offer."""
        offer_to_remove = None
        for offer in self._supplier_offers:
            if offer.supplier_id == supplier_id:
                offer_to_remove = offer
                break
        
        if not offer_to_remove:
            raise ValidationException(
                f"No offer from supplier {supplier_id} found",
                "supplier_id",
                supplier_id
            )
        
        self._supplier_offers.remove(offer_to_remove)
        
        # If removed offer was default, set new default
        if self.default_supplier_id == supplier_id:
            self.default_supplier_id = None
            if self._supplier_offers:
                self._set_default_supplier(self._supplier_offers[0].supplier_id)
        
        self.updated_by = user_id
        self.increment_version()
    
    def set_default_supplier(
        self,
        supplier_id: UUID,
        user_id: Optional[UUID] = None
    ) -> None:
        """Set the default supplier."""
        self._set_default_supplier(supplier_id)
        self.updated_by = user_id
        self.increment_version()
    
    def _set_default_supplier(self, supplier_id: UUID) -> None:
        """Internal method to set default supplier."""
        found = False
        for offer in self._supplier_offers:
            if offer.supplier_id == supplier_id:
                offer.is_default = True
                self.default_supplier_id = supplier_id
                found = True
            else:
                offer.is_default = False
        
        if not found:
            raise ValidationException(
                f"No offer from supplier {supplier_id} found",
                "supplier_id",
                supplier_id
            )
    
    def add_tag(self, tag: str) -> None:
        """Add a tag."""
        self.tags.add(tag.lower().strip())
        self.increment_version()
    
    def remove_tag(self, tag: str) -> None:
        """Remove a tag."""
        self.tags.discard(tag.lower().strip())
        self.increment_version()
    
    def deactivate(self, user_id: Optional[UUID] = None) -> None:
        """Deactivate the item."""
        self.is_active = False
        self.updated_by = user_id
        self.increment_version()
    
    def activate(self, user_id: Optional[UUID] = None) -> None:
        """Activate the item."""
        self.is_active = True
        self.updated_by = user_id
        self.increment_version()
    
    # =========================================================================
    # VALIDATION
    # =========================================================================
    
    def validate(self) -> None:
        """Validate aggregate invariants."""
        if not self.name:
            raise ValidationException("Item name is required", "name")
        
        if not self.code:
            raise ValidationException("Item code is required", "code")
        
        if self.is_manufactured and not self.drawing_number:
            # Warning, not error - drawing can be added later
            pass
        
        if self.is_purchased:
            # At least one supplier is recommended but not required
            pass
    
    # =========================================================================
    # FACTORY METHODS
    # =========================================================================
    
    @classmethod
    def create_material(
        cls,
        code: str,
        name: str,
        nomenclature_type_id: Optional[UUID] = None,
        unit: str = "кг",
        description: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> NomenclatureItem:
        """Factory method to create a material."""
        item = cls(
            code=code,
            name=name,
            category=NomenclatureCategory.MATERIAL,
            nomenclature_type_id=nomenclature_type_id,
            unit=unit,
            description=description,
            created_by=user_id,
        )
        item.add_domain_event(NomenclatureItemCreated(
            item_id=item.id,
            category=NomenclatureCategory.MATERIAL.value,
            name=name,
            created_by=user_id
        ))
        return item
    
    @classmethod
    def create_standard_product(
        cls,
        code: str,
        name: str,
        nomenclature_type_id: Optional[UUID] = None,
        unit: str = "шт",
        description: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> NomenclatureItem:
        """Factory method to create a standard product."""
        item = cls(
            code=code,
            name=name,
            category=NomenclatureCategory.STANDARD_PRODUCT,
            nomenclature_type_id=nomenclature_type_id,
            unit=unit,
            description=description,
            created_by=user_id,
        )
        item.add_domain_event(NomenclatureItemCreated(
            item_id=item.id,
            category=NomenclatureCategory.STANDARD_PRODUCT.value,
            name=name,
            created_by=user_id
        ))
        return item
    
    @classmethod
    def create_part(
        cls,
        code: str,
        name: str,
        drawing_number: DrawingNumber,
        unit: str = "шт",
        description: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> NomenclatureItem:
        """Factory method to create a part (manufactured)."""
        item = cls(
            code=code,
            name=name,
            category=NomenclatureCategory.PART,
            drawing_number=drawing_number,
            unit=unit,
            description=description,
            created_by=user_id,
        )
        item.add_domain_event(NomenclatureItemCreated(
            item_id=item.id,
            category=NomenclatureCategory.PART.value,
            name=name,
            created_by=user_id
        ))
        return item
    
    @classmethod
    def create_assembly_unit(
        cls,
        code: str,
        name: str,
        drawing_number: DrawingNumber,
        description: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> NomenclatureItem:
        """Factory method to create an assembly unit."""
        item = cls(
            code=code,
            name=name,
            category=NomenclatureCategory.ASSEMBLY_UNIT,
            drawing_number=drawing_number,
            unit="шт",
            description=description,
            created_by=user_id,
        )
        item.add_domain_event(NomenclatureItemCreated(
            item_id=item.id,
            category=NomenclatureCategory.ASSEMBLY_UNIT.value,
            name=name,
            created_by=user_id
        ))
        return item
    
    @classmethod
    def create_subsystem(
        cls,
        code: str,
        name: str,
        drawing_number: DrawingNumber,
        description: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> NomenclatureItem:
        """Factory method to create a subsystem."""
        item = cls(
            code=code,
            name=name,
            category=NomenclatureCategory.SUBSYSTEM,
            drawing_number=drawing_number,
            unit="шт",
            description=description,
            created_by=user_id,
        )
        item.add_domain_event(NomenclatureItemCreated(
            item_id=item.id,
            category=NomenclatureCategory.SUBSYSTEM.value,
            name=name,
            created_by=user_id
        ))
        return item
    
    @classmethod
    def create_system(
        cls,
        code: str,
        name: str,
        drawing_number: DrawingNumber,
        description: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> NomenclatureItem:
        """Factory method to create a system."""
        item = cls(
            code=code,
            name=name,
            category=NomenclatureCategory.SYSTEM,
            drawing_number=drawing_number,
            unit="шт",
            description=description,
            created_by=user_id,
        )
        item.add_domain_event(NomenclatureItemCreated(
            item_id=item.id,
            category=NomenclatureCategory.SYSTEM.value,
            name=name,
            created_by=user_id
        ))
        return item
