"""
Catalog Domain - Repository Interfaces (Ports).

These are abstract interfaces that define how the domain interacts with persistence.
The actual implementations are in the infrastructure layer.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from domain.shared.value_objects import NomenclatureCategory

from .aggregates import NomenclatureItem
from .entities import (
    NomenclatureType,
    Supplier,
    Contractor,
    DelayReason,
    SupplierOffer,
)


class NomenclatureItemRepository(ABC):
    """Repository interface for NomenclatureItem aggregate."""
    
    @abstractmethod
    async def get_by_id(self, item_id: UUID) -> Optional[NomenclatureItem]:
        """Get item by ID."""
        pass
    
    @abstractmethod
    async def get_by_code(self, code: str) -> Optional[NomenclatureItem]:
        """Get item by code."""
        pass
    
    @abstractmethod
    async def get_by_category(
        self,
        category: NomenclatureCategory,
        include_inactive: bool = False
    ) -> List[NomenclatureItem]:
        """Get all items in a category."""
        pass
    
    @abstractmethod
    async def search(
        self,
        query: str,
        category: Optional[NomenclatureCategory] = None,
        limit: int = 50
    ) -> List[NomenclatureItem]:
        """Search items by name, code, or tags."""
        pass
    
    @abstractmethod
    async def save(self, item: NomenclatureItem) -> NomenclatureItem:
        """Save (create or update) an item."""
        pass
    
    @abstractmethod
    async def delete(self, item_id: UUID) -> bool:
        """Hard delete an item (use with caution)."""
        pass
    
    @abstractmethod
    async def exists(self, code: str) -> bool:
        """Check if item with code exists."""
        pass


class NomenclatureTypeRepository(ABC):
    """Repository interface for NomenclatureType."""
    
    @abstractmethod
    async def get_by_id(self, type_id: UUID) -> Optional[NomenclatureType]:
        """Get type by ID."""
        pass
    
    @abstractmethod
    async def get_by_category(
        self,
        category: NomenclatureCategory
    ) -> List[NomenclatureType]:
        """Get all types for a category."""
        pass
    
    @abstractmethod
    async def save(self, ntype: NomenclatureType) -> NomenclatureType:
        """Save a nomenclature type."""
        pass
    
    @abstractmethod
    async def delete(self, type_id: UUID) -> bool:
        """Delete a type."""
        pass


class SupplierRepository(ABC):
    """Repository interface for Supplier."""
    
    @abstractmethod
    async def get_by_id(self, supplier_id: UUID) -> Optional[Supplier]:
        """Get supplier by ID."""
        pass
    
    @abstractmethod
    async def get_all(self, include_inactive: bool = False) -> List[Supplier]:
        """Get all suppliers."""
        pass
    
    @abstractmethod
    async def search(self, query: str, limit: int = 50) -> List[Supplier]:
        """Search suppliers by name."""
        pass
    
    @abstractmethod
    async def save(self, supplier: Supplier) -> Supplier:
        """Save a supplier."""
        pass
    
    @abstractmethod
    async def delete(self, supplier_id: UUID) -> bool:
        """Delete a supplier."""
        pass


class ContractorRepository(ABC):
    """Repository interface for Contractor."""
    
    @abstractmethod
    async def get_by_id(self, contractor_id: UUID) -> Optional[Contractor]:
        """Get contractor by ID."""
        pass
    
    @abstractmethod
    async def get_all(self, include_inactive: bool = False) -> List[Contractor]:
        """Get all contractors."""
        pass
    
    @abstractmethod
    async def search(self, query: str, limit: int = 50) -> List[Contractor]:
        """Search contractors by name."""
        pass
    
    @abstractmethod
    async def save(self, contractor: Contractor) -> Contractor:
        """Save a contractor."""
        pass
    
    @abstractmethod
    async def delete(self, contractor_id: UUID) -> bool:
        """Delete a contractor."""
        pass


class DelayReasonRepository(ABC):
    """Repository interface for DelayReason."""
    
    @abstractmethod
    async def get_by_id(self, reason_id: UUID) -> Optional[DelayReason]:
        """Get reason by ID."""
        pass
    
    @abstractmethod
    async def get_for_procurement(self) -> List[DelayReason]:
        """Get reasons applicable to procurement."""
        pass
    
    @abstractmethod
    async def get_for_production(self) -> List[DelayReason]:
        """Get reasons applicable to production."""
        pass
    
    @abstractmethod
    async def save(self, reason: DelayReason) -> DelayReason:
        """Save a delay reason."""
        pass
    
    @abstractmethod
    async def delete(self, reason_id: UUID) -> bool:
        """Delete a reason."""
        pass
