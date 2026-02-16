"""
Base Entity class for all domain entities.

Entities have identity and lifecycle.
Two entities are equal if they have the same ID.
"""

from __future__ import annotations
from abc import ABC
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4


@dataclass
class Entity(ABC):
    """
    Base class for all domain entities.
    
    Entities are objects that have a distinct identity that runs through time
    and different representations. They are defined by their identity, not their attributes.
    """
    
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    
    def __eq__(self, other: Any) -> bool:
        if not isinstance(other, Entity):
            return False
        return self.id == other.id
    
    def __hash__(self) -> int:
        return hash(self.id)
    
    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} id={self.id}>"


@dataclass
class VersionedEntity(Entity):
    """
    Entity with optimistic locking support.
    Used for entities that need concurrent modification protection.
    """
    
    version: int = 1
    
    def increment_version(self) -> None:
        """Increment version for optimistic locking."""
        self.version += 1
        self.updated_at = datetime.utcnow()


@dataclass
class AuditableEntity(VersionedEntity):
    """
    Entity with full audit trail support.
    Tracks who created and modified the entity.
    """
    
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[UUID] = None
    
    @property
    def is_deleted(self) -> bool:
        """Check if entity is soft-deleted."""
        return self.deleted_at is not None
    
    def soft_delete(self, user_id: UUID) -> None:
        """Mark entity as deleted without removing from database."""
        self.deleted_at = datetime.utcnow()
        self.deleted_by = user_id
        self.increment_version()
    
    def restore(self, user_id: UUID) -> None:
        """Restore soft-deleted entity."""
        self.deleted_at = None
        self.deleted_by = None
        self.updated_by = user_id
        self.increment_version()
