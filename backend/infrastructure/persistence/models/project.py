"""
Project ORM Models.

Models for project (Stand) execution tracking.
"""

from django.db import models, transaction
from django.db.models import Max
from django.conf import settings

from .base import BaseModelWithHistory, ActiveManager, AllObjectsManager
from .catalog import NomenclatureItem, Contractor, Supplier, DelayReason
from .bom import BOMStructure, BOMItem


class ProjectStatusChoices(models.TextChoices):
    """Project status choices."""
    
    DRAFT = 'draft', 'Черновик'
    PLANNING = 'planning', 'Планирование'
    IN_PROGRESS = 'in_progress', 'В работе'
    ON_HOLD = 'on_hold', 'Приостановлен'
    COMPLETED = 'completed', 'Завершён'
    CANCELLED = 'cancelled', 'Отменён'


class ManufacturingStatusChoices(models.TextChoices):
    """
    Статусы собственного изготовления - СТРОГО 4 статуса.
    
    Согласно ERP-требованиям:
    - NOT_STARTED: начальный статус (по умолчанию)
    - IN_PROGRESS: в работе (проставляется вручную)
    - SUSPENDED: приостановлено (проблемный статус, проставляется вручную)
    - COMPLETED: изготовлено (финальный статус)
    """
    
    NOT_STARTED = 'not_started', 'Не начато'
    IN_PROGRESS = 'in_progress', 'В работе'
    SUSPENDED = 'suspended', 'Приостановлено'
    COMPLETED = 'completed', 'Изготовлено'


class ContractorStatusChoices(models.TextChoices):
    """
    Статусы изготовления подрядчиком.
    
    Согласно ERP-требованиям:
    - SENT_TO_CONTRACTOR: передано подрядчику (автоматически при передаче)
    - IN_PROGRESS_BY_CONTRACTOR: в работе подрядчиком (старт работ)
    - SUSPENDED_BY_CONTRACTOR: приостановлено подрядчиком (проблемный статус)
    - MANUFACTURED_BY_CONTRACTOR: изготовлено подрядчиком
    - COMPLETED: изготовлено (финальный, автоматически при поступлении на склад)
    """
    
    SENT_TO_CONTRACTOR = 'sent_to_contractor', 'Передано подрядчику'
    IN_PROGRESS_BY_CONTRACTOR = 'in_progress_by_contractor', 'В работе подрядчиком'
    SUSPENDED_BY_CONTRACTOR = 'suspended_by_contractor', 'Приостановлено подрядчиком'
    MANUFACTURED_BY_CONTRACTOR = 'manufactured_by_contractor', 'Изготовлено подрядчиком'
    COMPLETED = 'completed', 'Изготовлено'


class PurchaseStatusChoices(models.TextChoices):
    """
    Статусы закупки - СТРОГО 3 рабочих статуса.
    
    Согласно ERP-требованиям:
    - Статус = фактическое состояние объекта
    - Проблема ≠ статус (отдельный флаг has_problem + problem_reason)
    - Статусы меняются автоматически через документы системы
    
    Логика:
    - WAITING_ORDER: начальный статус, позиция ожидает добавления в заказ
    - IN_ORDER: позиция добавлена в заказ и заказ переведён в статус "Заказан"
    - CLOSED: товар поступил на склад
    """
    
    WAITING_ORDER = 'waiting_order', 'Ожидает заказа'
    IN_ORDER = 'in_order', 'В заказе'
    CLOSED = 'closed', 'На складе'
    WRITTEN_OFF = 'written_off', 'Списано'


class ManufacturerTypeChoices(models.TextChoices):
    """Who manufactures the item."""
    
    INTERNAL = 'internal', 'Своими силами'
    CONTRACTOR = 'contractor', 'Подрядчик'


class MaterialSupplyTypeChoices(models.TextChoices):
    """Who supplies materials."""
    
    OUR_SUPPLY = 'our_supply', 'Материалы и комплектующие закупаем мы'
    CONTRACTOR_SUPPLY = 'contractor_supply', 'Материалы и комплектующие закупает подрядчик'


class Project(BaseModelWithHistory):
    """
    Project (Stand) - the main entity for project execution.
    
    A project represents a specific instance of manufacturing a product.
    The structure is a SNAPSHOT of BOM at creation time, allowing modifications
    without affecting the original BOM.
    """
    
    # Identification
    name = models.CharField(
        max_length=500,
        verbose_name="Наименование"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    
    # Root nomenclature item - THE MAIN PRODUCT being manufactured
    # This is the starting point for structure expansion
    root_nomenclature = models.ForeignKey(
        NomenclatureItem,
        on_delete=models.PROTECT,  # Cannot delete nomenclature if used in project
        related_name='root_in_projects',
        null=True,
        blank=True,
        verbose_name="Корневое изделие"
    )
    
    # Reference to BOM template (optional, for traceability)
    bom = models.ForeignKey(
        BOMStructure,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='projects',
        verbose_name="Структура изделия (BOM)"
    )
    
    # Legacy field - keep for compatibility but prefer root_nomenclature
    nomenclature_item = models.ForeignKey(
        NomenclatureItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='projects',
        verbose_name="Номенклатура стенда (legacy)"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=ProjectStatusChoices.choices,
        default=ProjectStatusChoices.DRAFT,
        db_index=True,
        verbose_name="Статус"
    )
    
    # Dates
    planned_start = models.DateField(
        null=True,
        blank=True,
        verbose_name="Плановая дата начала"
    )
    planned_end = models.DateField(
        null=True,
        blank=True,
        verbose_name="Плановая дата окончания"
    )
    actual_start = models.DateField(
        null=True,
        blank=True,
        verbose_name="Фактическая дата начала"
    )
    actual_end = models.DateField(
        null=True,
        blank=True,
        verbose_name="Фактическая дата окончания"
    )
    
    # Progress
    progress_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        verbose_name="Процент выполнения"
    )
    last_progress_calculation = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Последний расчёт прогресса"
    )
    
    # Project manager
    project_manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_projects',
        verbose_name="Руководитель проекта"
    )
    
    # Structure modified flag - indicates structure differs from original BOM
    structure_modified = models.BooleanField(
        default=False,
        verbose_name="Структура изменена",
        help_text="Структура проекта отличается от исходного BOM"
    )
    
    # Flags
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'projects'
        verbose_name = 'Проект'
        verbose_name_plural = 'Проекты'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'is_active']),
            models.Index(fields=['planned_end']),
            models.Index(fields=['root_nomenclature']),
        ]
    
    def __str__(self):
        return f"{self.name}"
    
    @property
    def root_item(self):
        """Get the root ProjectItem of this project."""
        return self.items.filter(parent_item__isnull=True).first()
    
    def get_validation_errors(self):
        """
        Validate project before activation.
        Returns list of validation error messages with details.
        """
        errors = []
        
        # Check root item exists
        if not self.root_item:
            errors.append({
                'code': 'NO_ROOT_ITEM',
                'message': "Отсутствует корневой элемент структуры проекта",
                'items': []
            })
            return errors  # Cannot continue without root
        
        # Check manufactured items have required fields
        manufactured_items = self.items.filter(
            nomenclature_item__catalog_category__is_purchased=False
        )
        
        # 1. Check responsible for manufactured items
        items_without_responsible = manufactured_items.filter(responsible__isnull=True)
        if items_without_responsible.exists():
            errors.append({
                'code': 'NO_RESPONSIBLE',
                'message': f"Не назначены ответственные для {items_without_responsible.count()} изготавливаемых позиций",
                'items': list(items_without_responsible.values('id', 'name')[:20])
            })
        
        # 2. Check contractor assigned when manufacturer_type=contractor
        items_contractor_not_assigned = manufactured_items.filter(
            manufacturer_type='contractor',
            contractor__isnull=True
        )
        if items_contractor_not_assigned.exists():
            errors.append({
                'code': 'NO_CONTRACTOR',
                'message': f"Не указаны подрядчики для {items_contractor_not_assigned.count()} позиций",
                'items': list(items_contractor_not_assigned.values('id', 'name')[:20])
            })
        
        # 3. Check planned_start for manufactured items (exclude contractor items)
        # Позиции, отданные подрядчику, не требуют planned_start
        items_without_start = manufactured_items.filter(
            planned_start__isnull=True
        ).exclude(
            manufacturer_type='contractor'  # Исключаем позиции подрядчика
        )
        if items_without_start.exists():
            errors.append({
                'code': 'NO_PLANNED_START',
                'message': f"Не указаны плановые даты начала для {items_without_start.count()} изготавливаемых позиций (собственное изготовление)",
                'items': list(items_without_start.values('id', 'name')[:20])
            })
        
        # 4. Check purchased items have suppliers
        purchased_items = self.items.filter(
            nomenclature_item__catalog_category__is_purchased=True
        )
        
        purchased_without_supplier = purchased_items.filter(
            supplier__isnull=True,
            purchase_by_contractor=False
        )
        if purchased_without_supplier.exists():
            errors.append({
                'code': 'NO_SUPPLIER',
                'message': f"Не указаны поставщики для {purchased_without_supplier.count()} закупаемых позиций",
                'items': list(purchased_without_supplier.values('id', 'name')[:20])
            })
        
        # 5. Check required_date for purchased items
        purchased_without_date = purchased_items.filter(
            required_date__isnull=True,
            purchase_by_contractor=False
        )
        if purchased_without_date.exists():
            errors.append({
                'code': 'NO_REQUIRED_DATE',
                'message': f"Не указаны требуемые даты поставки для {purchased_without_date.count()} закупаемых позиций",
                'items': list(purchased_without_date.values('id', 'name')[:20])
            })
        
        # 6. Check date conflicts (child planned_end > parent planned_start)
        items_with_date_conflicts = []
        for item in self.items.filter(parent_item__isnull=False):
            if item.planned_end and item.parent_item and item.parent_item.planned_start:
                if item.planned_end > item.parent_item.planned_start:
                    items_with_date_conflicts.append({
                        'id': str(item.id),
                        'name': item.name,
                        'planned_end': str(item.planned_end),
                        'parent_name': item.parent_item.name,
                        'parent_planned_start': str(item.parent_item.planned_start)
                    })
        
        if items_with_date_conflicts:
            errors.append({
                'code': 'DATE_CONFLICT',
                'message': f"Конфликты дат у {len(items_with_date_conflicts)} позиций (окончание дочернего позже начала родительского)",
                'items': items_with_date_conflicts[:20]
            })
        
        return errors

    def can_activate(self):
        """Check if project can be activated."""
        return len(self.get_validation_errors()) == 0

    def calculate_progress(self):
        """Calculate and update project progress based on item statuses."""
        from django.utils import timezone
        from decimal import Decimal

        def calculate_item_progress(item):
            return Decimal(str(item.calculate_progress()))

        root_items = self.items.filter(parent_item__isnull=True)
        if not root_items.exists():
            self.progress_percent = Decimal('0')
        else:
            total = sum(calculate_item_progress(item) for item in root_items)
            self.progress_percent = total / root_items.count()

        self.last_progress_calculation = timezone.now()
        self.save(update_fields=['progress_percent', 'last_progress_calculation'])

        return self.progress_percent


class ProjectItemSequence(models.Model):
    """Global sequence for ProjectItem item_number values."""

    key = models.CharField(
        max_length=50,
        primary_key=True,
        verbose_name="Ключ"
    )
    last_value = models.PositiveBigIntegerField(
        default=0,
        verbose_name="Последнее значение"
    )

    class Meta:
        db_table = 'project_item_sequences'
        verbose_name = 'Счётчик ID позиций проекта'
        verbose_name_plural = 'Счётчики ID позиций проекта'


class ProjectItem(BaseModelWithHistory):
    """
    Project Item - working copy of a BOM item for a specific project.
    
    Contains execution information: dates, status, responsible persons.
    """
    
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Проект"
    )
    
    # Reference to source
    bom_item = models.ForeignKey(
        BOMItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='project_items',
        verbose_name="Элемент BOM"
    )
    nomenclature_item = models.ForeignKey(
        NomenclatureItem,
        on_delete=models.CASCADE,
        related_name='project_items',
        verbose_name="Номенклатура"
    )
    
    # Tree structure
    parent_item = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        verbose_name="Родительский элемент"
    )
    
    # Item info - category теперь произвольная строка (code из CatalogCategory)
    category = models.CharField(
        max_length=50,
        db_index=True,
        verbose_name="Категория"
    )
    name = models.CharField(
        max_length=500,
        verbose_name="Наименование"
    )
    drawing_number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Номер чертежа"
    )
    
    # Quantity
    quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        default=1,
        verbose_name="Количество"
    )
    unit = models.CharField(
        max_length=20,
        default='шт',
        verbose_name="Единица измерения"
    )
    
    # Manufacturing info (for manufactured items)
    manufacturing_status = models.CharField(
        max_length=30,
        choices=ManufacturingStatusChoices.choices,
        default=ManufacturingStatusChoices.NOT_STARTED,
        db_index=True,
        verbose_name="Статус изготовления (свои силы)"
    )
    contractor_status = models.CharField(
        max_length=30,
        choices=ContractorStatusChoices.choices,
        default=ContractorStatusChoices.SENT_TO_CONTRACTOR,
        blank=True,
        db_index=True,
        verbose_name="Статус изготовления (подрядчик)"
    )
    manufacturer_type = models.CharField(
        max_length=20,
        choices=ManufacturerTypeChoices.choices,
        default=ManufacturerTypeChoices.INTERNAL,
        verbose_name="Изготовитель"
    )
    contractor = models.ForeignKey(
        Contractor,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='project_items',
        verbose_name="Подрядчик"
    )
    material_supply_type = models.CharField(
        max_length=30,
        choices=MaterialSupplyTypeChoices.choices,
        default=MaterialSupplyTypeChoices.OUR_SUPPLY,
        verbose_name="Снабжение материалами"
    )
    
    # Purchase info (for purchased items)
    purchase_status = models.CharField(
        max_length=30,
        choices=PurchaseStatusChoices.choices,
        default=PurchaseStatusChoices.WAITING_ORDER,
        db_index=True,
        verbose_name="Статус закупки"
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='project_items',
        verbose_name="Поставщик"
    )
    purchase_by_contractor = models.BooleanField(
        default=False,
        verbose_name="Закупается подрядчиком"
    )
    article_number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Артикул"
    )
    
    # Dates
    planned_start = models.DateField(
        null=True,
        blank=True,
        verbose_name="Плановая дата начала"
    )
    planned_end = models.DateField(
        null=True,
        blank=True,
        verbose_name="Плановая дата окончания"
    )
    actual_start = models.DateField(
        null=True,
        blank=True,
        verbose_name="Фактическая дата начала"
    )
    actual_end = models.DateField(
        null=True,
        blank=True,
        verbose_name="Фактическая дата окончания"
    )
    required_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        verbose_name="Требуемая дата поставки"
    )
    order_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Дата оформления заказа",
        help_text="Когда надо оформить закупку (рассчитывается от required_date и срока поставки)"
    )
    
    # =========================================================
    # Флаг и причина проблемы (согласно ERP-требованиям)
    # Проблема ≠ статус, это отдельный флаг
    # =========================================================
    has_problem = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Есть проблема",
        help_text="Флаг наличия проблемы (задержка, брак, срыв сроков и т.д.)"
    )
    problem_reason = models.ForeignKey(
        'ProblemReason',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='project_items',
        verbose_name="Причина проблемы",
        help_text="Причина из справочника причин проблем"
    )
    problem_notes = models.TextField(
        blank=True,
        verbose_name="Комментарий к проблеме"
    )
    
    # Responsibility
    responsible = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='responsible_for_items',
        verbose_name="Ответственный"
    )
    
    # Progress
    progress_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        verbose_name="Процент выполнения"
    )
    
    # Delay tracking
    delay_reason = models.ForeignKey(
        DelayReason,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='project_items',
        verbose_name="Причина задержки"
    )
    delay_notes = models.TextField(
        blank=True,
        verbose_name="Комментарий к задержке"
    )

    # =========================================================
    # Аналитика причин проблем/отклонений (с подпричинами)
    # Для изготовляемых и закупаемых позиций раздельные справочники
    # =========================================================
    manufacturing_problem_reason = models.ForeignKey(
        'ManufacturingProblemReason',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='project_items',
        verbose_name="Причина (аналитика, производство)"
    )
    manufacturing_problem_subreason = models.ForeignKey(
        'ManufacturingProblemSubreason',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='project_items',
        verbose_name="Подпричина (аналитика, производство)"
    )
    purchase_problem_reason = models.ForeignKey(
        'PurchaseProblemReason',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='project_items',
        verbose_name="Причина (аналитика, закупки)"
    )
    purchase_problem_subreason = models.ForeignKey(
        'PurchaseProblemSubreason',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='project_items',
        verbose_name="Подпричина (аналитика, закупки)"
    )
    
    # Position
    position = models.PositiveIntegerField(
        default=0,
        verbose_name="Позиция"
    )

    # Global sequential ID for UI display
    item_number = models.PositiveBigIntegerField(
        null=True,
        blank=True,
        unique=True,
        db_index=True,
        verbose_name="ID позиции"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'project_items'
        verbose_name = 'Элемент проекта'
        verbose_name_plural = 'Элементы проекта'
        ordering = ['project', 'position']
        indexes = [
            models.Index(fields=['project', 'parent_item']),
            models.Index(fields=['project', 'category']),
            models.Index(fields=['manufacturing_status']),
            models.Index(fields=['purchase_status']),
            models.Index(fields=['responsible']),
        ]
    
    def __str__(self):
        project_name = getattr(self.project, 'name', None)
        return f"{project_name}: {self.name}"
    
    @property
    def is_purchased(self):
        """
        Определяет, является ли позиция закупаемой.
        Использует связанную номенклатуру и её категорию.
        """
        if self.nomenclature_item and self.nomenclature_item.catalog_category:
            return self.nomenclature_item.catalog_category.is_purchased
        # Fallback: если нет связи, определяем по статусу закупки
        return self.purchase_status in [
            PurchaseStatusChoices.WAITING_ORDER,
            PurchaseStatusChoices.IN_ORDER,
            PurchaseStatusChoices.CLOSED,
            PurchaseStatusChoices.WRITTEN_OFF,
        ]
    
    @property
    def is_manufactured(self):
        """Является ли позиция изготавливаемой."""
        return not self.is_purchased
    
    @property
    def is_completed(self):
        if self.is_manufactured:
            return self.manufacturing_status == ManufacturingStatusChoices.COMPLETED
        else:
            return self.purchase_status in [
                PurchaseStatusChoices.CLOSED,
                PurchaseStatusChoices.WRITTEN_OFF,
            ]
    
    @property
    def is_overdue(self):
        if self.is_completed:
            return False
        from datetime import date
        if self.required_date:
            return date.today() > self.required_date
        if self.planned_end:
            return date.today() > self.planned_end
        return False
    
    def calculate_purchase_dates(self, parent_start_date=None):
        """
        Calculate purchase dates based on parent's start date and supplier lead time.
        
        delivery_date = parent_start_date - 1 day
        order_date = delivery_date - supplier_lead_time
        """
        from datetime import timedelta
        from infrastructure.persistence.models import NomenclatureSupplier
        
        if not self.is_purchased or self.purchase_by_contractor:
            return None
        
        # Get parent's planned start or use provided date
        if parent_start_date is None and self.parent_item:
            parent_start_date = self.parent_item.planned_start
        
        if not parent_start_date:
            return None
        
        # Delivery must be 1 day before parent starts
        delivery_date = parent_start_date - timedelta(days=1)
        
        # Get supplier lead time
        lead_time_days = 0
        if self.supplier and self.nomenclature_item:
            nom_supplier = NomenclatureSupplier.objects.filter(
                nomenclature_item=self.nomenclature_item,
                supplier=self.supplier,
                is_active=True
            ).first()
            if nom_supplier:
                lead_time_days = nom_supplier.delivery_days or 0
        
        # Order date
        order_date = delivery_date - timedelta(days=lead_time_days)
        
        return {
            'required_date': delivery_date,
            'order_date': order_date,
            'planned_end': delivery_date,  # Expected delivery
        }
    
    def cascade_dates_to_children(self, save=True):
        """
        Cascade date calculations to all child items.
        
        For manufactured children: planned_end = this item's planned_start
        For purchased children: calculate based on parent's planned_start
        """
        from datetime import timedelta
        
        if not self.planned_start:
            return []
        
        updated_items = []
        
        for child in self.children.all():
            if child.is_purchased:
                if child.purchase_by_contractor:
                    child.required_date = None
                    child.order_date = None
                    child.planned_end = None
                    if save:
                        child.save(update_fields=['required_date', 'order_date', 'planned_end'])
                    updated_items.append(child)
                else:
                    # Calculate purchase dates
                    dates = child.calculate_purchase_dates(self.planned_start)
                    if dates:
                        child.required_date = dates['required_date']
                        child.order_date = dates['order_date']
                        child.planned_end = dates['planned_end']
                        if save:
                            child.save(update_fields=['required_date', 'order_date', 'planned_end'])
                        updated_items.append(child)
            else:
                # Manufactured: must be done before parent starts
                child.planned_end = self.planned_start - timedelta(days=1)
                if save:
                    child.save(update_fields=['planned_end'])
                updated_items.append(child)
            
            # Recursively update grandchildren
            updated_items.extend(child.cascade_dates_to_children(save=save))
        
        return updated_items
    
    def has_date_conflicts(self):
        """Check if this item has date conflicts with parent."""
        if not self.parent_item:
            return False
        
        if self.planned_end and self.parent_item.planned_start:
            return self.planned_end > self.parent_item.planned_start
        
        return False
    
    def check_problems(self):
        """
        Автоматическая проверка и установка флага проблемы.
        
        Согласно ERP-требованиям:
        1. Если позиция не заказана (статус "Ожидает заказа") и сегодня > order_date:
           → has_problem = True, причина = "Не заказано вовремя"
        2. Если позиция в заказе (статус "В заказе") и сегодня > required_date:
           → has_problem = True, причина = "Задержка поставки"
        """
        from django.utils import timezone
        from infrastructure.persistence.models import ProblemReason
        from infrastructure.persistence.models.inventory import MaterialRequirement
        from infrastructure.persistence.models.procurement import PurchaseOrderItem
        
        today = timezone.now().date()
        
        # Только для закупаемых позиций
        if not self.is_purchased:
            return
        
        # Если позиция закрыта/списана - сбрасываем только флаг проблемы
        # Причина проблемы остаётся для истории (согласно ТЗ)
        if self.purchase_status in ['closed', 'written_off']:
            if self.has_problem:
                self.has_problem = False
                # problem_reason НЕ обнуляем - оставляем для истории
            return
        
        requirement = MaterialRequirement.objects.filter(
            project_item_id=self.id,
            is_active=True,
            deleted_at__isnull=True
        ).order_by('-created_at').first()

        order_by_date = self.order_date
        if not order_by_date and requirement and requirement.order_by_date:
            order_by_date = requirement.order_by_date

        # Проблема 1: Не заказано вовремя
        if (self.purchase_status == 'waiting_order' and 
            order_by_date and 
            today > order_by_date):
            self.has_problem = True
            # Попытка найти системную причину
            reason = ProblemReason.objects.filter(
                code='not_ordered_on_time',
                is_active=True
            ).first()
            if reason:
                self.problem_reason = reason
            return
        
        # Проблема 2: Задержка поставки
        # По ТЗ сравниваем с ожидаемой датой поставки из заказа (по позиции),
        # иначе используем ожидаемую дату заказа, и только потом required_date.
        expected_delivery_date = None
        ordered_late = False
        has_confirmed_po = PurchaseOrderItem.objects.filter(
            project_item_id=self.id
        ).exclude(order__status='draft').exists()
        has_requirement_po = bool(
            requirement and requirement.purchase_order and requirement.purchase_order.status in ['ordered', 'partially_delivered', 'closed']
        )
        if self.purchase_status == 'in_order' or has_confirmed_po or has_requirement_po:
            po_item = (
                PurchaseOrderItem.objects.filter(project_item_id=self.id)
                .exclude(order__status='draft')
                .select_related('order')
                .order_by('-created_at')
                .first()
            )
            if po_item:
                if po_item.order and po_item.order.order_date and order_by_date:
                    if po_item.order.order_date > order_by_date:
                        ordered_late = True
                expected_delivery_date = (
                    po_item.expected_delivery_date
                    or po_item.order.expected_delivery_date
                )
            elif has_requirement_po:
                po = requirement.purchase_order
                if po.order_date and order_by_date and po.order_date > order_by_date:
                    ordered_late = True
                expected_delivery_date = po.expected_delivery_date
            expected_delivery_date = expected_delivery_date or self.required_date

        if (self.purchase_status == 'in_order' or has_confirmed_po or has_requirement_po) and ordered_late:
            self.has_problem = True
            reason = ProblemReason.objects.filter(
                code='ordered_late',
                is_active=True
            ).first()
            if reason:
                self.problem_reason = reason

        if (
            (self.purchase_status == 'in_order' or has_confirmed_po or has_requirement_po)
            and expected_delivery_date
            and today > expected_delivery_date
        ):
            self.has_problem = True
            reason = ProblemReason.objects.filter(
                code='delivery_delay',
                is_active=True
            ).first()
            if reason:
                self.problem_reason = reason
            return

        if (self.purchase_status == 'in_order' or has_confirmed_po or has_requirement_po) and ordered_late:
            return
        
        # Нет проблем
        if self.has_problem:
            self.has_problem = False
            self.problem_reason = None
    
    def save(self, *args, **kwargs):
        """Переопределение save для автонумерации и проверки проблем."""

        # 1) Глобальная автонумерация ID позиции (item_number)
        # ВАЖНО: это значение используется в UI как "ID позиции" и должно быть сквозным.
        if not self.item_number:
            with transaction.atomic():
                seq, _ = ProjectItemSequence.objects.select_for_update().get_or_create(key='project_item')

                # На случай ручных правок/миграций: не выдавать уже существующие номера.
                max_existing = ProjectItem.objects.aggregate(max_item_number=Max('item_number')).get('max_item_number')
                if max_existing is not None and max_existing > (seq.last_value or 0):
                    seq.last_value = max_existing

                seq.last_value += 1
                seq.save(update_fields=['last_value'])
                self.item_number = seq.last_value

        # 2) Проверка проблем (до сохранения) для закупаемых
        if self.is_purchased:
            self.check_problems()

        super().save(*args, **kwargs)
    
    def calculate_progress(self):
        """
        Calculate progress for this item based on children or status.
        
        Логика расчёта прогресса:
        1. Для листовых позиций (без детей):
           - Изготовлено (completed) = 100%
           - Любой другой статус = 0%
        2. Для родительских позиций:
           - Среднее арифметическое от прогресса дочерних элементов
           - Вес каждого дочернего элемента одинаковый
        """
        from decimal import Decimal
        
        children = self.children.all()

        # Если сам элемент в финальном статусе, прогресс всегда 100%
        # (даже если у него есть дочерние элементы).
        if self.is_purchased:
            if self.purchase_status in ['closed', 'written_off']:
                return Decimal('100')
        else:
            if self.manufacturer_type == 'contractor':
                if self.contractor_status == 'completed':
                    return Decimal('100')
            else:
                if self.manufacturing_status == 'completed':
                    return Decimal('100')
        
        if not children.exists():
            # Leaf node - progress is based on final status only
            if self.is_purchased:
                # Для закупаемых: 100% если закрыта/списано
                return Decimal('100') if self.purchase_status in ['closed', 'written_off'] else Decimal('0')
            else:
                # Для изготавливаемых: 100% только если статус "Изготовлено"
                if self.manufacturer_type == 'contractor':
                    # Подрядчик - смотрим contractor_status
                    return Decimal('100') if self.contractor_status == 'completed' else Decimal('0')
                else:
                    # Своими силами - смотрим manufacturing_status
                    return Decimal('100') if self.manufacturing_status == 'completed' else Decimal('0')
        
        # Parent node - average of children (equal weight)
        total = sum(child.calculate_progress() for child in children)
        return total / children.count() if children.count() > 0 else Decimal('0')


class UserAssignment(BaseModelWithHistory):
    """
    User assignment to a project or project item.
    """
    
    ROLE_CHOICES = [
        ('responsible', 'Ответственный'),
        ('reviewer', 'Проверяющий'),
        ('observer', 'Наблюдатель'),
    ]
    
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='assignments',
        verbose_name="Проект"
    )
    project_item = models.ForeignKey(
        ProjectItem,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='assignments',
        verbose_name="Элемент проекта"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='project_assignments',
        verbose_name="Пользователь"
    )
    
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='responsible',
        verbose_name="Роль"
    )
    
    assigned_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата назначения"
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assignments_made',
        verbose_name="Назначено пользователем"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активно"
    )
    
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'user_assignments'
        verbose_name = 'Назначение пользователя'
        verbose_name_plural = 'Назначения пользователей'
        unique_together = [['project', 'project_item', 'user', 'role']]
    
    def __str__(self):
        item = self.project_item.name if self.project_item else "весь проект"
        return f"{self.user} - {self.get_role_display()} ({item})"
