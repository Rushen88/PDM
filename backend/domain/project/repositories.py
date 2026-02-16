"""
Project Domain - Repository Interfaces.
"""

from abc import ABC, abstractmethod
from datetime import date
from typing import List, Optional
from uuid import UUID

from domain.shared.value_objects import ProjectStatus

from .aggregates import Project
from .entities import ProjectItem, UserAssignment


class ProjectRepository(ABC):
    """Repository interface for Project aggregate."""
    
    @abstractmethod
    async def get_by_id(self, project_id: UUID) -> Optional[Project]:
        """Get project by ID."""
        pass
    
    @abstractmethod
    async def get_all(
        self,
        status: Optional[ProjectStatus] = None,
        include_inactive: bool = False
    ) -> List[Project]:
        """Get all projects, optionally filtered by status."""
        pass
    
    @abstractmethod
    async def get_active_projects(self) -> List[Project]:
        """Get all active (in-progress) projects."""
        pass
    
    @abstractmethod
    async def get_overdue_projects(self) -> List[Project]:
        """Get all overdue projects."""
        pass
    
    @abstractmethod
    async def get_by_manager(self, user_id: UUID) -> List[Project]:
        """Get projects managed by a user."""
        pass
    
    @abstractmethod
    async def save(self, project: Project) -> Project:
        """Save project."""
        pass
    
    @abstractmethod
    async def delete(self, project_id: UUID) -> bool:
        """Delete project."""
        pass


class ProjectItemRepository(ABC):
    """Repository interface for ProjectItem."""
    
    @abstractmethod
    async def get_by_id(self, item_id: UUID) -> Optional[ProjectItem]:
        """Get project item by ID."""
        pass
    
    @abstractmethod
    async def get_by_project(self, project_id: UUID) -> List[ProjectItem]:
        """Get all items for a project."""
        pass
    
    @abstractmethod
    async def get_overdue_items(
        self,
        project_id: Optional[UUID] = None
    ) -> List[ProjectItem]:
        """Get overdue items, optionally for a specific project."""
        pass
    
    @abstractmethod
    async def get_items_by_responsible(
        self,
        user_id: UUID,
        project_id: Optional[UUID] = None
    ) -> List[ProjectItem]:
        """Get items assigned to a user."""
        pass
    
    @abstractmethod
    async def save(self, item: ProjectItem) -> ProjectItem:
        """Save project item."""
        pass
    
    @abstractmethod
    async def save_many(self, items: List[ProjectItem]) -> List[ProjectItem]:
        """Save multiple project items."""
        pass
    
    @abstractmethod
    async def delete(self, item_id: UUID) -> bool:
        """Delete project item."""
        pass


class UserAssignmentRepository(ABC):
    """Repository interface for UserAssignment."""
    
    @abstractmethod
    async def get_by_id(self, assignment_id: UUID) -> Optional[UserAssignment]:
        """Get assignment by ID."""
        pass
    
    @abstractmethod
    async def get_by_project(self, project_id: UUID) -> List[UserAssignment]:
        """Get all assignments for a project."""
        pass
    
    @abstractmethod
    async def get_by_user(self, user_id: UUID) -> List[UserAssignment]:
        """Get all assignments for a user."""
        pass
    
    @abstractmethod
    async def save(self, assignment: UserAssignment) -> UserAssignment:
        """Save assignment."""
        pass
    
    @abstractmethod
    async def delete(self, assignment_id: UUID) -> bool:
        """Delete assignment."""
        pass
