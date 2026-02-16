"""
Shared Value Objects used across multiple domains.

Value Objects are immutable objects that describe characteristics of a thing.
Two value objects are equal if all their properties are equal.
"""

from __future__ import annotations
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
import re


# =============================================================================
# ENUMERATIONS
# =============================================================================

class NomenclatureCategory(str, Enum):
    """Category of nomenclature items."""
    
    # Purchased items (закупаемые)
    MATERIAL = "material"                    # Материалы
    STANDARD_PRODUCT = "standard_product"    # Стандартные изделия
    OTHER_PRODUCT = "other_product"          # Прочие изделия
    
    # Manufactured items (изготавливаемые)
    PART = "part"                            # Детали
    ASSEMBLY_UNIT = "assembly_unit"          # Сборочные единицы
    SUBSYSTEM = "subsystem"                  # Подсистемы
    SYSTEM = "system"                        # Системы
    STAND = "stand"                          # Стенд (конечное изделие)
    
    @property
    def is_purchased(self) -> bool:
        """Check if this category is purchased (not manufactured)."""
        return self in (
            NomenclatureCategory.MATERIAL,
            NomenclatureCategory.STANDARD_PRODUCT,
            NomenclatureCategory.OTHER_PRODUCT,
        )
    
    @property
    def is_manufactured(self) -> bool:
        """Check if this category is manufactured (not purchased)."""
        return not self.is_purchased
    
    @classmethod
    def purchased_categories(cls) -> list[NomenclatureCategory]:
        """Get all purchased categories."""
        return [c for c in cls if c.is_purchased]
    
    @classmethod
    def manufactured_categories(cls) -> list[NomenclatureCategory]:
        """Get all manufactured categories."""
        return [c for c in cls if c.is_manufactured]


class ManufacturingStatus(str, Enum):
    """Status of manufacturing tasks."""
    
    NOT_STARTED = "not_started"          # Не начато
    IN_PROGRESS = "in_progress"          # В процессе изготовления
    SUSPENDED = "suspended"              # Приостановлено
    WAITING_MATERIALS = "waiting_materials"  # Ожидание материалов
    QUALITY_CHECK = "quality_check"      # На контроле качества
    COMPLETED = "completed"              # Изготовлено
    REJECTED = "rejected"                # Брак
    
    @property
    def is_terminal(self) -> bool:
        """Check if this is a terminal (final) status."""
        return self in (ManufacturingStatus.COMPLETED, ManufacturingStatus.REJECTED)
    
    @property
    def progress_percent(self) -> int:
        """Get progress percentage for this status."""
        mapping = {
            ManufacturingStatus.NOT_STARTED: 0,
            ManufacturingStatus.IN_PROGRESS: 50,
            ManufacturingStatus.SUSPENDED: 25,
            ManufacturingStatus.WAITING_MATERIALS: 10,
            ManufacturingStatus.QUALITY_CHECK: 90,
            ManufacturingStatus.COMPLETED: 100,
            ManufacturingStatus.REJECTED: 0,
        }
        return mapping.get(self, 0)


class PurchaseStatus(str, Enum):
    """Status of purchase/procurement items."""
    
    NOT_REQUIRED = "not_required"        # Не требуется (на складе)
    PENDING = "pending"                  # Ожидает заказа
    ORDERED = "ordered"                  # Заказано
    IN_TRANSIT = "in_transit"            # В пути
    DELIVERED = "delivered"              # Доставлено
    DELAYED = "delayed"                  # Задержка поставки
    PARTIALLY_DELIVERED = "partially_delivered"  # Частично доставлено
    CANCELLED = "cancelled"              # Отменено
    
    @property
    def is_terminal(self) -> bool:
        """Check if this is a terminal (final) status."""
        return self in (
            PurchaseStatus.NOT_REQUIRED,
            PurchaseStatus.DELIVERED,
            PurchaseStatus.CANCELLED,
        )
    
    @property
    def is_available(self) -> bool:
        """Check if item is available (in stock or delivered)."""
        return self in (PurchaseStatus.NOT_REQUIRED, PurchaseStatus.DELIVERED)


class ProjectStatus(str, Enum):
    """Status of a project (Stand)."""
    
    DRAFT = "draft"                      # Черновик
    PLANNING = "planning"                # Планирование
    IN_PROGRESS = "in_progress"          # В работе
    ON_HOLD = "on_hold"                  # Приостановлен
    COMPLETED = "completed"              # Завершён
    CANCELLED = "cancelled"              # Отменён


class ManufacturerType(str, Enum):
    """Who manufactures the item."""
    
    INTERNAL = "internal"                # Своими силами
    CONTRACTOR = "contractor"            # Подрядчик


class MaterialSupplyType(str, Enum):
    """Who supplies materials for manufacturing."""
    
    OUR_SUPPLY = "our_supply"            # Мы снабжаем материалами
    CONTRACTOR_SUPPLY = "contractor_supply"  # Подрядчик сам закупает


# =============================================================================
# VALUE OBJECTS
# =============================================================================

@dataclass(frozen=True)
class Money:
    """
    Value object representing monetary amount.
    Immutable and includes currency.
    """
    
    amount: Decimal
    currency: str = "RUB"
    
    def __post_init__(self):
        if self.amount < 0:
            raise ValueError("Amount cannot be negative")
        if len(self.currency) != 3:
            raise ValueError("Currency must be a 3-letter code")
    
    def __add__(self, other: Money) -> Money:
        if self.currency != other.currency:
            raise ValueError(f"Cannot add {self.currency} and {other.currency}")
        return Money(self.amount + other.amount, self.currency)
    
    def __mul__(self, factor: Decimal | int | float) -> Money:
        return Money(self.amount * Decimal(str(factor)), self.currency)
    
    def __str__(self) -> str:
        return f"{self.amount:.2f} {self.currency}"


@dataclass(frozen=True)
class Quantity:
    """
    Value object representing quantity with unit of measure.
    """
    
    value: Decimal
    unit: str  # Unit of measure (шт, кг, м, etc.)
    
    def __post_init__(self):
        if self.value < 0:
            raise ValueError("Quantity cannot be negative")
    
    def __add__(self, other: Quantity) -> Quantity:
        if self.unit != other.unit:
            raise ValueError(f"Cannot add {self.unit} and {other.unit}")
        return Quantity(self.value + other.value, self.unit)
    
    def __sub__(self, other: Quantity) -> Quantity:
        if self.unit != other.unit:
            raise ValueError(f"Cannot subtract {self.unit} and {other.unit}")
        result = self.value - other.value
        if result < 0:
            raise ValueError("Result quantity cannot be negative")
        return Quantity(result, self.unit)
    
    def __mul__(self, factor: int | float | Decimal) -> Quantity:
        return Quantity(self.value * Decimal(str(factor)), self.unit)
    
    def __str__(self) -> str:
        return f"{self.value} {self.unit}"


@dataclass(frozen=True)
class DrawingNumber:
    """
    Value object representing a drawing number.
    Follows hierarchical naming convention.
    
    Example: СТЕНД-001.СИС-01.ПС-02.СЕ-03
    """
    
    value: str
    
    def __post_init__(self):
        if not self.value:
            raise ValueError("Drawing number cannot be empty")
        # Validate format (basic validation)
        if len(self.value) > 100:
            raise ValueError("Drawing number too long")
    
    @property
    def parent_number(self) -> Optional[DrawingNumber]:
        """Get parent drawing number (one level up in hierarchy)."""
        parts = self.value.rsplit('.', 1)
        if len(parts) > 1:
            return DrawingNumber(parts[0])
        return None
    
    @property
    def hierarchy_level(self) -> int:
        """Get hierarchy level (number of dots + 1)."""
        return self.value.count('.') + 1
    
    def is_child_of(self, parent: DrawingNumber) -> bool:
        """Check if this drawing is a child of another."""
        return self.value.startswith(parent.value + '.')
    
    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class DateRange:
    """
    Value object representing a date range with planned and actual dates.
    """
    
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    actual_start: Optional[date] = None
    actual_end: Optional[date] = None
    
    def __post_init__(self):
        if self.planned_start and self.planned_end:
            if self.planned_start > self.planned_end:
                raise ValueError("Planned start cannot be after planned end")
        if self.actual_start and self.actual_end:
            if self.actual_start > self.actual_end:
                raise ValueError("Actual start cannot be after actual end")
    
    @property
    def planned_duration_days(self) -> Optional[int]:
        """Get planned duration in days."""
        if self.planned_start and self.planned_end:
            return (self.planned_end - self.planned_start).days
        return None
    
    @property
    def actual_duration_days(self) -> Optional[int]:
        """Get actual duration in days."""
        if self.actual_start and self.actual_end:
            return (self.actual_end - self.actual_start).days
        return None
    
    @property
    def delay_days(self) -> Optional[int]:
        """Get delay in days (positive = late, negative = early)."""
        if self.planned_end and self.actual_end:
            return (self.actual_end - self.planned_end).days
        return None
    
    @property
    def is_overdue(self) -> bool:
        """Check if task is overdue (past planned end, not completed)."""
        if self.planned_end and not self.actual_end:
            return date.today() > self.planned_end
        return False
    
    @property
    def is_delayed(self) -> bool:
        """Check if task was completed late."""
        delay = self.delay_days
        return delay is not None and delay > 0


@dataclass(frozen=True)
class DeliveryTerms:
    """
    Value object representing delivery terms from a supplier.
    """
    
    lead_time_days: int  # Срок поставки в днях
    min_order_quantity: Optional[Decimal] = None
    price: Optional[Money] = None
    
    def __post_init__(self):
        if self.lead_time_days < 0:
            raise ValueError("Lead time cannot be negative")
    
    def calculate_order_date(self, required_date: date) -> date:
        """Calculate when to place order to receive by required date."""
        from datetime import timedelta
        return required_date - timedelta(days=self.lead_time_days)


@dataclass(frozen=True)
class Address:
    """
    Value object representing a postal address.
    """
    
    country: str = "Россия"
    region: Optional[str] = None
    city: Optional[str] = None
    street: Optional[str] = None
    building: Optional[str] = None
    postal_code: Optional[str] = None
    
    @property
    def full_address(self) -> str:
        """Get full address as a single string."""
        parts = [
            self.postal_code,
            self.country,
            self.region,
            self.city,
            self.street,
            self.building,
        ]
        return ', '.join(p for p in parts if p)


@dataclass(frozen=True)
class ContactInfo:
    """
    Value object representing contact information.
    """
    
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    
    def __post_init__(self):
        if self.email and not self._is_valid_email(self.email):
            raise ValueError(f"Invalid email: {self.email}")
    
    @staticmethod
    def _is_valid_email(email: str) -> bool:
        """Basic email validation."""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))


@dataclass(frozen=True)
class LegalEntity:
    """
    Value object representing legal entity information.
    """
    
    name: str
    inn: Optional[str] = None  # ИНН
    kpp: Optional[str] = None  # КПП
    ogrn: Optional[str] = None  # ОГРН
    legal_address: Optional[Address] = None
    actual_address: Optional[Address] = None
    contact_info: Optional[ContactInfo] = None
    
    def __post_init__(self):
        if not self.name:
            raise ValueError("Legal entity name is required")


@dataclass(frozen=True)
class Progress:
    """
    Value object representing progress percentage.
    """
    
    percent: Decimal
    
    def __post_init__(self):
        if not (0 <= self.percent <= 100):
            raise ValueError("Progress must be between 0 and 100")
    
    @classmethod
    def zero(cls) -> Progress:
        return cls(Decimal('0'))
    
    @classmethod
    def complete(cls) -> Progress:
        return cls(Decimal('100'))
    
    @property
    def is_complete(self) -> bool:
        return self.percent >= 100
    
    def __str__(self) -> str:
        return f"{self.percent:.1f}%"
