"""
Base Aggregate Root class.

Aggregates are clusters of domain objects that can be treated as a single unit.
The Aggregate Root is the only entry point to the aggregate.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List

from .base_entity import AuditableEntity
from .events import DomainEvent


@dataclass
class AggregateRoot(AuditableEntity):
    """
    Base class for all aggregate roots.
    
    An aggregate is a cluster of domain objects that can be treated as a single unit.
    The aggregate root is the entry point to the aggregate, and all external references
    should only point to the aggregate root.
    
    Key responsibilities:
    - Enforce invariants across the aggregate
    - Manage the lifecycle of contained entities
    - Emit domain events for significant state changes
    """
    
    _domain_events: List[DomainEvent] = field(default_factory=list, repr=False)
    
    def add_domain_event(self, event: DomainEvent) -> None:
        """Add a domain event to be dispatched after persistence."""
        self._domain_events.append(event)
    
    def clear_domain_events(self) -> List[DomainEvent]:
        """Clear and return all pending domain events."""
        events = self._domain_events.copy()
        self._domain_events.clear()
        return events
    
    @property
    def domain_events(self) -> List[DomainEvent]:
        """Get all pending domain events."""
        return self._domain_events.copy()
    
    def validate(self) -> None:
        """
        Validate aggregate invariants.
        Override in subclasses to implement domain-specific validation.
        Raises DomainException if invariants are violated.
        """
        pass
