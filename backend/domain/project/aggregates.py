"""
Project Domain - Aggregates.

Project (Stand) is the main aggregate root.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Dict, List, Optional, Set, Tuple
from uuid import UUID

from domain.shared.base_aggregate import AggregateRoot
from domain.shared.value_objects import (
    ProjectStatus,
    NomenclatureCategory,
    ManufacturingStatus,
    PurchaseStatus,
    Progress,
    DateRange,
    Quantity,
)
from domain.shared.events import (
    ProjectCreated,
    ProjectStatusChanged,
    ResponsibleAssigned,
    ProgressRecalculationRequested,
    ProgressUpdated,
)
from domain.shared.exceptions import (
    ValidationException,
    BusinessRuleViolationException,
    EntityNotFoundException,
    StatusTransitionException,
)

from .entities import ProjectItem, UserAssignment


# Valid status transitions
VALID_STATUS_TRANSITIONS: Dict[ProjectStatus, Set[ProjectStatus]] = {
    ProjectStatus.DRAFT: {ProjectStatus.PLANNING, ProjectStatus.CANCELLED},
    ProjectStatus.PLANNING: {ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD, ProjectStatus.CANCELLED},
    ProjectStatus.IN_PROGRESS: {ProjectStatus.ON_HOLD, ProjectStatus.COMPLETED, ProjectStatus.CANCELLED},
    ProjectStatus.ON_HOLD: {ProjectStatus.IN_PROGRESS, ProjectStatus.CANCELLED},
    ProjectStatus.COMPLETED: set(),  # No transitions from completed
    ProjectStatus.CANCELLED: set(),  # No transitions from cancelled
}


@dataclass
class Project(AggregateRoot):
    """
    Project (Stand) - the main aggregate root for project execution.
    
    A Project represents the actual execution of a Stand build.
    It contains all the items from the BOM template, with added
    execution information: dates, statuses, responsibilities, etc.
    
    Key responsibilities:
    - Track overall project status and progress
    - Manage project items (the working copies of BOM items)
    - Calculate completion percentages
    - Identify problems and delays
    - Manage user assignments
    """
    
    # Identification
    name: str = ""
    description: Optional[str] = None
    
    # Reference to BOM template
    bom_id: Optional[UUID] = None
    nomenclature_item_id: Optional[UUID] = None  # Reference to Stand nomenclature item
    
    # Status
    status: ProjectStatus = ProjectStatus.DRAFT
    
    # Dates
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    actual_start: Optional[date] = None
    actual_end: Optional[date] = None
    
    # Progress (calculated)
    progress_percent: Decimal = Decimal('0')
    last_progress_calculation: Optional[datetime] = None
    
    # Project items
    _items: List[ProjectItem] = field(default_factory=list)
    
    # User assignments
    _assignments: List[UserAssignment] = field(default_factory=list)
    
    # Project manager
    project_manager_id: Optional[UUID] = None
    
    # Flags
    is_active: bool = True
    
    def __post_init__(self):
        if not self.name:
            raise ValidationException("Project name is required", "name")
    
    # =========================================================================
    # PROPERTIES
    # =========================================================================
    
    @property
    def items(self) -> List[ProjectItem]:
        """Get all project items."""
        return self._items.copy()
    
    @property
    def assignments(self) -> List[UserAssignment]:
        """Get all user assignments."""
        return self._assignments.copy()
    
    @property
    def dates(self) -> DateRange:
        """Get project dates as DateRange."""
        return DateRange(
            planned_start=self.planned_start,
            planned_end=self.planned_end,
            actual_start=self.actual_start,
            actual_end=self.actual_end
        )
    
    @property
    def is_completed(self) -> bool:
        """Check if project is completed."""
        return self.status == ProjectStatus.COMPLETED
    
    @property
    def is_in_progress(self) -> bool:
        """Check if project is in progress."""
        return self.status == ProjectStatus.IN_PROGRESS
    
    @property
    def is_overdue(self) -> bool:
        """Check if project is overdue."""
        if self.is_completed:
            return False
        if self.planned_end:
            return date.today() > self.planned_end
        return False
    
    @property
    def days_remaining(self) -> Optional[int]:
        """Get days remaining until planned end."""
        if self.is_completed or not self.planned_end:
            return None
        return (self.planned_end - date.today()).days
    
    @property
    def delay_days(self) -> Optional[int]:
        """Get delay in days (positive = late)."""
        return self.dates.delay_days
    
    # =========================================================================
    # ITEM MANAGEMENT
    # =========================================================================
    
    def get_item_by_id(self, item_id: UUID) -> Optional[ProjectItem]:
        """Get project item by ID."""
        for item in self._items:
            if item.id == item_id:
                return item
        return None
    
    def get_items_by_category(self, category: NomenclatureCategory) -> List[ProjectItem]:
        """Get all items of a specific category."""
        return [item for item in self._items if item.category == category]
    
    def get_children(self, parent_item_id: Optional[UUID]) -> List[ProjectItem]:
        """Get direct children of an item."""
        return [
            item for item in self._items
            if item.parent_project_item_id == parent_item_id
        ]
    
    def get_root_items(self) -> List[ProjectItem]:
        """Get root items (systems directly under stand)."""
        return self.get_children(None)
    
    def get_all_descendants(self, parent_item_id: UUID) -> List[ProjectItem]:
        """Get all descendants of an item."""
        descendants = []
        children = self.get_children(parent_item_id)
        
        for child in children:
            descendants.append(child)
            descendants.extend(self.get_all_descendants(child.id))
        
        return descendants
    
    def get_purchased_items(self) -> List[ProjectItem]:
        """Get all purchased items."""
        return [item for item in self._items if item.is_purchased]
    
    def get_manufactured_items(self) -> List[ProjectItem]:
        """Get all manufactured items."""
        return [item for item in self._items if item.is_manufactured]
    
    def get_problematic_items(self) -> List[ProjectItem]:
        """Get all items with problems."""
        return [item for item in self._items if item.has_problems]
    
    def get_overdue_items(self) -> List[ProjectItem]:
        """Get all overdue items."""
        return [item for item in self._items if item.is_overdue]
    
    def add_item(self, item: ProjectItem) -> None:
        """Add an item to the project."""
        if self.status == ProjectStatus.COMPLETED:
            raise BusinessRuleViolationException(
                "PROJECT_COMPLETED",
                "Cannot add items to a completed project"
            )
        
        item.project_id = self.id
        self._items.append(item)
        self.increment_version()
        
        # Request progress recalculation
        self.add_domain_event(ProgressRecalculationRequested(
            project_id=self.id,
            item_id=item.id,
            trigger_event="item_added"
        ))
    
    def remove_item(self, item_id: UUID, user_id: Optional[UUID] = None) -> None:
        """Remove an item from the project."""
        if self.status == ProjectStatus.COMPLETED:
            raise BusinessRuleViolationException(
                "PROJECT_COMPLETED",
                "Cannot remove items from a completed project"
            )
        
        item = self.get_item_by_id(item_id)
        if not item:
            raise EntityNotFoundException("ProjectItem", item_id)
        
        # Check for children
        children = self.get_children(item_id)
        if children:
            raise BusinessRuleViolationException(
                "HAS_CHILDREN",
                "Cannot remove item with children"
            )
        
        self._items.remove(item)
        self.updated_by = user_id
        self.increment_version()
    
    # =========================================================================
    # STATUS MANAGEMENT
    # =========================================================================
    
    def change_status(
        self,
        new_status: ProjectStatus,
        user_id: Optional[UUID] = None
    ) -> None:
        """Change project status with validation."""
        if new_status == self.status:
            return
        
        valid_transitions = VALID_STATUS_TRANSITIONS.get(self.status, set())
        if new_status not in valid_transitions:
            raise StatusTransitionException(
                "Project",
                self.status.value,
                new_status.value,
                [s.value for s in valid_transitions]
            )
        
        old_status = self.status
        self.status = new_status
        
        # Update dates based on status
        if new_status == ProjectStatus.IN_PROGRESS and not self.actual_start:
            self.actual_start = date.today()
        elif new_status == ProjectStatus.COMPLETED:
            self.actual_end = date.today()
            self.progress_percent = Decimal('100')
        
        self.updated_by = user_id
        self.increment_version()
        
        self.add_domain_event(ProjectStatusChanged(
            project_id=self.id,
            old_status=old_status.value,
            new_status=new_status.value,
            changed_by=user_id
        ))
    
    def start(self, user_id: Optional[UUID] = None) -> None:
        """Start the project."""
        self.change_status(ProjectStatus.IN_PROGRESS, user_id)
    
    def complete(self, user_id: Optional[UUID] = None) -> None:
        """Complete the project."""
        # Verify all items are completed
        incomplete_items = [
            item for item in self._items
            if not item.is_completed
        ]
        if incomplete_items:
            raise BusinessRuleViolationException(
                "INCOMPLETE_ITEMS",
                f"Cannot complete project with {len(incomplete_items)} incomplete items"
            )
        
        self.change_status(ProjectStatus.COMPLETED, user_id)
    
    def put_on_hold(self, user_id: Optional[UUID] = None) -> None:
        """Put project on hold."""
        self.change_status(ProjectStatus.ON_HOLD, user_id)
    
    def cancel(self, user_id: Optional[UUID] = None) -> None:
        """Cancel the project."""
        self.change_status(ProjectStatus.CANCELLED, user_id)
    
    # =========================================================================
    # DATES MANAGEMENT
    # =========================================================================
    
    def set_planned_dates(
        self,
        start: date,
        end: date,
        user_id: Optional[UUID] = None
    ) -> None:
        """Set planned dates."""
        if start > end:
            raise ValidationException(
                "Planned start cannot be after planned end",
                "planned_start"
            )
        
        self.planned_start = start
        self.planned_end = end
        self.updated_by = user_id
        self.increment_version()
    
    # =========================================================================
    # RESPONSIBILITY MANAGEMENT
    # =========================================================================
    
    def assign_project_manager(
        self,
        user_id: UUID,
        assigned_by: Optional[UUID] = None
    ) -> None:
        """Assign project manager."""
        self.project_manager_id = user_id
        self.updated_by = assigned_by
        self.increment_version()
    
    def assign_responsible(
        self,
        item_id: UUID,
        user_id: UUID,
        apply_to_children: bool = False,
        assigned_by: Optional[UUID] = None
    ) -> None:
        """Assign responsible user to an item."""
        item = self.get_item_by_id(item_id)
        if not item:
            raise EntityNotFoundException("ProjectItem", item_id)
        
        item.assign_responsible(user_id, assigned_by)
        
        if apply_to_children:
            for child in self.get_all_descendants(item_id):
                child.assign_responsible(user_id, assigned_by)
        
        self.updated_by = assigned_by
        self.increment_version()
        
        self.add_domain_event(ResponsibleAssigned(
            project_id=self.id,
            item_id=item_id,
            user_id=user_id,
            apply_to_children=apply_to_children
        ))
    
    def add_assignment(self, assignment: UserAssignment) -> None:
        """Add a user assignment."""
        assignment.project_id = self.id
        self._assignments.append(assignment)
        self.increment_version()
    
    def get_assignments_for_user(self, user_id: UUID) -> List[UserAssignment]:
        """Get all assignments for a user."""
        return [a for a in self._assignments if a.user_id == user_id and a.is_active]
    
    # =========================================================================
    # PROGRESS CALCULATION
    # =========================================================================
    
    def calculate_progress(self) -> Decimal:
        """
        Calculate overall project progress.
        
        Progress is calculated as the average of all root items (systems).
        Each system's progress is the average of its children, etc.
        """
        root_items = self.get_root_items()
        
        if not root_items:
            return Decimal('0')
        
        total_progress = sum(
            self._calculate_item_progress(item)
            for item in root_items
        )
        
        return total_progress / len(root_items)
    
    def _calculate_item_progress(self, item: ProjectItem) -> Decimal:
        """Calculate progress for a single item and its children."""
        children = self.get_children(item.id)
        
        if not children:
            # Leaf item - return its own progress
            return item.progress_percent
        
        # Parent item - average of children
        total = sum(self._calculate_item_progress(child) for child in children)
        return total / len(children)
    
    def update_progress(self, user_id: Optional[UUID] = None) -> None:
        """Recalculate and update project progress."""
        old_progress = self.progress_percent
        self.progress_percent = self.calculate_progress()
        self.last_progress_calculation = datetime.utcnow()
        
        if old_progress != self.progress_percent:
            self.updated_by = user_id
            self.increment_version()
            
            self.add_domain_event(ProgressUpdated(
                project_id=self.id,
                item_id=self.id,
                old_progress=str(old_progress),
                new_progress=str(self.progress_percent)
            ))
    
    def get_progress_by_system(self) -> Dict[UUID, Decimal]:
        """Get progress breakdown by system."""
        result = {}
        for item in self.get_root_items():
            result[item.id] = self._calculate_item_progress(item)
        return result
    
    def get_progress_summary(self) -> Dict[str, any]:
        """Get a summary of project progress."""
        total_items = len(self._items)
        completed_items = len([i for i in self._items if i.is_completed])
        problematic_items = len(self.get_problematic_items())
        overdue_items = len(self.get_overdue_items())
        
        manufactured = self.get_manufactured_items()
        purchased = self.get_purchased_items()
        
        return {
            "overall_progress": float(self.progress_percent),
            "total_items": total_items,
            "completed_items": completed_items,
            "problematic_items": problematic_items,
            "overdue_items": overdue_items,
            "manufactured_count": len(manufactured),
            "manufactured_completed": len([i for i in manufactured if i.is_completed]),
            "purchased_count": len(purchased),
            "purchased_completed": len([i for i in purchased if i.is_completed]),
            "days_remaining": self.days_remaining,
            "is_overdue": self.is_overdue,
            "progress_by_system": {
                str(k): float(v) for k, v in self.get_progress_by_system().items()
            }
        }
    
    # =========================================================================
    # VALIDATION
    # =========================================================================
    
    def validate(self) -> None:
        """Validate aggregate invariants."""
        if not self.name:
            raise ValidationException("Project name is required", "name")
        
        if self.planned_start and self.planned_end:
            if self.planned_start > self.planned_end:
                raise ValidationException(
                    "Planned start cannot be after planned end",
                    "planned_start"
                )
    
    # =========================================================================
    # FACTORY METHODS
    # =========================================================================
    
    @classmethod
    def create(
        cls,
        name: str,
        bom_id: Optional[UUID] = None,
        nomenclature_item_id: Optional[UUID] = None,
        description: Optional[str] = None,
        project_manager_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
    ) -> Project:
        """Factory method to create a new project."""
        project = cls(
            name=name,
            bom_id=bom_id,
            nomenclature_item_id=nomenclature_item_id,
            description=description,
            project_manager_id=project_manager_id,
            created_by=user_id,
        )
        
        project.add_domain_event(ProjectCreated(
            project_id=project.id,
            name=name,
            created_by=user_id
        ))
        
        return project
