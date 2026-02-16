"""
BOM Domain - Repository Interfaces.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from .aggregates import BOMStructure
from .entities import BOMVersion


class BOMStructureRepository(ABC):
    """Repository interface for BOMStructure aggregate."""
    
    @abstractmethod
    async def get_by_id(self, bom_id: UUID) -> Optional[BOMStructure]:
        """Get BOM structure by ID."""
        pass
    
    @abstractmethod
    async def get_by_root_item(self, root_item_id: UUID) -> Optional[BOMStructure]:
        """Get BOM structure by root item ID."""
        pass
    
    @abstractmethod
    async def get_all_for_item(self, item_id: UUID) -> List[BOMStructure]:
        """Get all BOM structures that contain an item."""
        pass
    
    @abstractmethod
    async def save(self, bom: BOMStructure) -> BOMStructure:
        """Save BOM structure."""
        pass
    
    @abstractmethod
    async def delete(self, bom_id: UUID) -> bool:
        """Delete BOM structure."""
        pass


class BOMVersionRepository(ABC):
    """Repository interface for BOM versions."""
    
    @abstractmethod
    async def get_by_id(self, version_id: UUID) -> Optional[BOMVersion]:
        """Get version by ID."""
        pass
    
    @abstractmethod
    async def get_versions_for_bom(self, bom_id: UUID) -> List[BOMVersion]:
        """Get all versions for a BOM."""
        pass
    
    @abstractmethod
    async def get_active_version(self, bom_id: UUID) -> Optional[BOMVersion]:
        """Get active version for a BOM."""
        pass
    
    @abstractmethod
    async def save(self, version: BOMVersion) -> BOMVersion:
        """Save BOM version."""
        pass
