"""
Project Domain - Entities.

Entities for project items and assignments.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from domain.shared.base_entity import AuditableEntity
from domain.shared.value_objects import (
    NomenclatureCategory,
    ManufacturingStatus,
    PurchaseStatus,
    ManufacturerType,
    MaterialSupplyType,
    DateRange,
    Quantity,
    Progress,
)


@dataclass
class ProjectItem(AuditableEntity):
    """
    An item within a project - either manufactured or purchased.
    
    This is the working copy of a BOM item for a specific project.
    It tracks the actual execution: dates, status, responsible persons, etc.
    """
    
    project_id: UUID
    bom_item_id: Optional[UUID] = None  # Reference to source BOM item
    nomenclature_item_id: UUID  # Reference to catalog item
    parent_project_item_id: Optional[UUID] = None  # For tree structure
    
    # Item identification
    category: NomenclatureCategory = NomenclatureCategory.MATERIAL
    name: str = ""
    drawing_number: Optional[str] = None
    
    # Quantity
    quantity: Quantity = field(default_factory=lambda: Quantity(Decimal('1'), "шт"))
    
    # For manufactured items
    manufacturing_status: ManufacturingStatus = ManufacturingStatus.NOT_STARTED
    manufacturer_type: ManufacturerType = ManufacturerType.INTERNAL
    contractor_id: Optional[UUID] = None  # If manufactured by contractor
    material_supply_type: MaterialSupplyType = MaterialSupplyType.OUR_SUPPLY
    
    # For purchased items
    purchase_status: PurchaseStatus = PurchaseStatus.PENDING
    supplier_id: Optional[UUID] = None
    article_number: Optional[str] = None  # Артикул
    
    # Dates
    dates: DateRange = field(default_factory=DateRange)
    required_date: Optional[date] = None  # When item is needed
    
    # Responsibility
    responsible_user_id: Optional[UUID] = None
    
    # Progress
    progress_percent: Decimal = Decimal('0')
    
    # Delay tracking
    delay_reason_id: Optional[UUID] = None
    delay_notes: Optional[str] = None
    
    # Position in structure
    position: int = 0
    
    # Notes
    notes: Optional[str] = None
    
    @property
    def is_purchased(self) -> bool:
        """Check if this is a purchased item."""
        return self.category.is_purchased
    
    @property
    def is_manufactured(self) -> bool:
        """Check if this is a manufactured item."""
        return self.category.is_manufactured
    
    @property
    def is_completed(self) -> bool:
        """Check if item is completed."""
        if self.is_manufactured:
            return self.manufacturing_status == ManufacturingStatus.COMPLETED
        else:
            return self.purchase_status in (
                PurchaseStatus.DELIVERED,
                PurchaseStatus.NOT_REQUIRED
            )
    
    @property
    def is_overdue(self) -> bool:
        """Check if item is overdue."""
        if self.is_completed:
            return False
        if self.required_date:
            return date.today() > self.required_date
        return self.dates.is_overdue
    
    @property
    def has_problems(self) -> bool:
        """Check if item has any problems."""
        return (
            self.is_overdue or
            self.delay_reason_id is not None or
            self.purchase_status == PurchaseStatus.DELAYED or
            self.manufacturing_status in (
                ManufacturingStatus.SUSPENDED,
                ManufacturingStatus.REJECTED
            )
        )
    
    # =========================================================================
    # COMMANDS
    # =========================================================================
    
    def update_manufacturing_status(
        self,
        new_status: ManufacturingStatus,
        user_id: Optional[UUID] = None
    ) -> None:
        """Update manufacturing status."""
        if not self.is_manufactured:
            raise ValueError("Cannot set manufacturing status on purchased item")
        
        old_status = self.manufacturing_status
        self.manufacturing_status = new_status
        
        # Update progress based on status
        self.progress_percent = Decimal(str(new_status.progress_percent))
        
        # Update actual dates if needed
        if new_status == ManufacturingStatus.IN_PROGRESS and not self.dates.actual_start:
            self.dates = DateRange(
                planned_start=self.dates.planned_start,
                planned_end=self.dates.planned_end,
                actual_start=date.today(),
                actual_end=self.dates.actual_end
            )
        elif new_status == ManufacturingStatus.COMPLETED:
            self.dates = DateRange(
                planned_start=self.dates.planned_start,
                planned_end=self.dates.planned_end,
                actual_start=self.dates.actual_start or date.today(),
                actual_end=date.today()
            )
        
        self.updated_by = user_id
        self.increment_version()
    
    def update_purchase_status(
        self,
        new_status: PurchaseStatus,
        user_id: Optional[UUID] = None
    ) -> None:
        """Update purchase status."""
        if not self.is_purchased:
            raise ValueError("Cannot set purchase status on manufactured item")
        
        self.purchase_status = new_status
        
        # Update progress
        if new_status in (PurchaseStatus.DELIVERED, PurchaseStatus.NOT_REQUIRED):
            self.progress_percent = Decimal('100')
        elif new_status == PurchaseStatus.ORDERED:
            self.progress_percent = Decimal('25')
        elif new_status == PurchaseStatus.IN_TRANSIT:
            self.progress_percent = Decimal('75')
        
        self.updated_by = user_id
        self.increment_version()
    
    def set_dates(
        self,
        planned_start: Optional[date] = None,
        planned_end: Optional[date] = None,
        actual_start: Optional[date] = None,
        actual_end: Optional[date] = None,
        user_id: Optional[UUID] = None
    ) -> None:
        """Set or update dates."""
        self.dates = DateRange(
            planned_start=planned_start or self.dates.planned_start,
            planned_end=planned_end or self.dates.planned_end,
            actual_start=actual_start or self.dates.actual_start,
            actual_end=actual_end or self.dates.actual_end
        )
        self.updated_by = user_id
        self.increment_version()
    
    def set_required_date(
        self,
        required_date: date,
        user_id: Optional[UUID] = None
    ) -> None:
        """Set the date when this item is required."""
        self.required_date = required_date
        self.updated_by = user_id
        self.increment_version()
    
    def assign_responsible(
        self,
        user_id: UUID,
        assigned_by: Optional[UUID] = None
    ) -> None:
        """Assign a responsible user."""
        self.responsible_user_id = user_id
        self.updated_by = assigned_by
        self.increment_version()
    
    def set_contractor(
        self,
        contractor_id: UUID,
        material_supply_type: MaterialSupplyType = MaterialSupplyType.OUR_SUPPLY,
        user_id: Optional[UUID] = None
    ) -> None:
        """Set contractor for manufactured item."""
        if not self.is_manufactured:
            raise ValueError("Cannot set contractor on purchased item")
        
        self.manufacturer_type = ManufacturerType.CONTRACTOR
        self.contractor_id = contractor_id
        self.material_supply_type = material_supply_type
        self.updated_by = user_id
        self.increment_version()
    
    def set_supplier(
        self,
        supplier_id: UUID,
        article_number: Optional[str] = None,
        user_id: Optional[UUID] = None
    ) -> None:
        """Set supplier for purchased item."""
        if not self.is_purchased:
            raise ValueError("Cannot set supplier on manufactured item")
        
        self.supplier_id = supplier_id
        if article_number:
            self.article_number = article_number
        self.updated_by = user_id
        self.increment_version()
    
    def report_delay(
        self,
        reason_id: UUID,
        notes: Optional[str] = None,
        user_id: Optional[UUID] = None
    ) -> None:
        """Report a delay with reason."""
        self.delay_reason_id = reason_id
        self.delay_notes = notes
        self.updated_by = user_id
        self.increment_version()
    
    def clear_delay(self, user_id: Optional[UUID] = None) -> None:
        """Clear delay information."""
        self.delay_reason_id = None
        self.delay_notes = None
        self.updated_by = user_id
        self.increment_version()


@dataclass
class UserAssignment(AuditableEntity):
    """
    Assignment of a user to a project or project item.
    
    Tracks who is responsible for what and when the assignment was made.
    """
    
    project_id: UUID
    project_item_id: Optional[UUID] = None  # None = project-level assignment
    user_id: UUID
    role: str = "responsible"  # responsible, reviewer, observer
    assigned_at: datetime = field(default_factory=datetime.utcnow)
    assigned_by_id: Optional[UUID] = None
    notes: Optional[str] = None
    is_active: bool = True
    
    def deactivate(self, user_id: Optional[UUID] = None) -> None:
        """Deactivate the assignment."""
        self.is_active = False
        self.updated_by = user_id
        self.increment_version()
