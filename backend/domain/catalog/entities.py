"""
Catalog Domain - Entities.

Entities for nomenclature items, suppliers, and contractors.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from domain.shared.base_entity import AuditableEntity
from domain.shared.value_objects import (
    NomenclatureCategory,
    Money,
    Quantity,
    LegalEntity,
    ContactInfo,
    Address,
    DeliveryTerms,
)


@dataclass
class NomenclatureType(AuditableEntity):
    """
    Type of nomenclature within a category.
    Example: "Крепёж" within STANDARD_PRODUCT category.
    
    Each type has a default unit of measure.
    """
    
    category: NomenclatureCategory
    name: str
    description: Optional[str] = None
    default_unit: str = "шт"  # Default unit of measure
    
    def __post_init__(self):
        if not self.name:
            raise ValueError("Nomenclature type name is required")


@dataclass
class Supplier(AuditableEntity):
    """
    Supplier entity - a company that supplies materials/products.
    """
    
    legal_entity: LegalEntity
    contact_info: Optional[ContactInfo] = None
    payment_terms: Optional[str] = None  # e.g., "100% prepayment"
    default_delivery_days: int = 7
    rating: Optional[Decimal] = None  # 0-5 rating
    notes: Optional[str] = None
    is_active: bool = True
    
    @property
    def name(self) -> str:
        return self.legal_entity.name
    
    def deactivate(self) -> None:
        """Deactivate supplier."""
        self.is_active = False
        self.increment_version()
    
    def update_rating(self, new_rating: Decimal) -> None:
        """Update supplier rating."""
        if not (0 <= new_rating <= 5):
            raise ValueError("Rating must be between 0 and 5")
        self.rating = new_rating
        self.increment_version()


@dataclass
class Contractor(AuditableEntity):
    """
    Contractor entity - a company that manufactures items for us.
    """
    
    legal_entity: LegalEntity
    contact_info: Optional[ContactInfo] = None
    specialization: Optional[str] = None  # What they specialize in
    certifications: List[str] = field(default_factory=list)
    default_lead_time_days: int = 14
    rating: Optional[Decimal] = None
    notes: Optional[str] = None
    is_active: bool = True
    
    @property
    def name(self) -> str:
        return self.legal_entity.name
    
    def add_certification(self, certification: str) -> None:
        """Add a certification."""
        if certification not in self.certifications:
            self.certifications.append(certification)
            self.increment_version()


@dataclass
class DelayReason(AuditableEntity):
    """
    Reason for delay - used for both procurement and production delays.
    """
    
    name: str
    description: Optional[str] = None
    applies_to_procurement: bool = True
    applies_to_production: bool = True
    is_active: bool = True
    
    def __post_init__(self):
        if not self.name:
            raise ValueError("Delay reason name is required")


@dataclass
class SupplierOffer(AuditableEntity):
    """
    A supplier's offer for a specific nomenclature item.
    Links a supplier to a nomenclature item with pricing and delivery terms.
    """
    
    supplier_id: UUID
    nomenclature_item_id: UUID
    article_number: Optional[str] = None  # Артикул поставщика
    delivery_terms: DeliveryTerms = field(
        default_factory=lambda: DeliveryTerms(lead_time_days=7)
    )
    min_order_quantity: Optional[Quantity] = None
    is_default: bool = False
    is_active: bool = True
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    
    def set_as_default(self) -> None:
        """Mark this offer as the default for the item."""
        self.is_default = True
        self.increment_version()
    
    def update_price(self, new_price: Money) -> None:
        """Update the price."""
        self.delivery_terms = DeliveryTerms(
            lead_time_days=self.delivery_terms.lead_time_days,
            min_order_quantity=self.delivery_terms.min_order_quantity,
            price=new_price
        )
        self.increment_version()
    
    @property
    def is_valid(self) -> bool:
        """Check if offer is currently valid."""
        if not self.is_active:
            return False
        now = datetime.utcnow()
        if self.valid_from and now < self.valid_from:
            return False
        if self.valid_until and now > self.valid_until:
            return False
        return True
