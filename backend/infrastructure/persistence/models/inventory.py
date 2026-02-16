"""
Inventory ORM Models.

Models for warehouse and stock management.
"""

from django.db import models, transaction
from django.conf import settings

from .base import BaseModelWithHistory, ActiveManager, AllObjectsManager
from .catalog import NomenclatureItem
from .project import Project, ProjectItem


class Warehouse(BaseModelWithHistory):
    """
    Warehouse - physical location for storing items.
    """
    
    code = models.CharField(
        max_length=20,
        unique=True,
        verbose_name="Код склада"
    )
    name = models.CharField(
        max_length=200,
        verbose_name="Наименование"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    address = models.TextField(
        blank=True,
        verbose_name="Адрес"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'warehouses'
        verbose_name = 'Склад'
        verbose_name_plural = 'Склады'
        ordering = ['name']
    
    def __str__(self):
        return f"[{self.code}] {self.name}"


class StockItem(BaseModelWithHistory):
    """
    Stock Item - current stock level for an item in a warehouse.
    """
    
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.CASCADE,
        related_name='stock_items',
        verbose_name="Склад"
    )
    nomenclature_item = models.ForeignKey(
        NomenclatureItem,
        on_delete=models.CASCADE,
        related_name='stock_items',
        verbose_name="Номенклатура"
    )
    
    # Quantities
    quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        default=0,
        verbose_name="Количество"
    )
    reserved_quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        default=0,
        verbose_name="Зарезервировано"
    )
    unit = models.CharField(
        max_length=20,
        default='шт',
        verbose_name="Единица измерения"
    )
    
    # Minimum stock level for alerts
    min_quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        null=True,
        blank=True,
        verbose_name="Минимальный запас"
    )
    
    # Location within warehouse
    location = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Место хранения"
    )
    
    # Last inventory date
    last_inventory_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Дата последней инвентаризации"
    )
    
    class Meta:
        db_table = 'stock_items'
        verbose_name = 'Складской запас'
        verbose_name_plural = 'Складские запасы'
        unique_together = [['warehouse', 'nomenclature_item']]
    
    def __str__(self):
        return f"{self.nomenclature_item} @ {self.warehouse}: {self.quantity}"
    
    @property
    def available_quantity(self):
        """Available quantity (total minus reserved)."""
        return self.quantity - self.reserved_quantity
    
    @property
    def is_low_stock(self):
        """Check if stock is below minimum level."""
        if self.min_quantity is None:
            return False
        return self.available_quantity < self.min_quantity


class StockReservation(BaseModelWithHistory):
    """
    Stock Reservation - reserve stock for a specific project/task.
    """
    
    STATUS_CHOICES = [
        ('pending', 'Ожидает'),
        ('confirmed', 'Подтверждено'),
        ('released', 'Выдано'),
        ('cancelled', 'Отменено'),
    ]
    
    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.CASCADE,
        related_name='reservations',
        verbose_name="Складской запас"
    )
    
    # What it's reserved for
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='stock_reservations',
        verbose_name="Проект"
    )
    project_item = models.ForeignKey(
        ProjectItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_reservations',
        verbose_name="Элемент проекта"
    )
    
    # Quantity
    quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Зарезервированное количество"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        verbose_name="Статус"
    )
    
    # Required date
    required_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Требуемая дата"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    class Meta:
        db_table = 'stock_reservations'
        verbose_name = 'Резервирование'
        verbose_name_plural = 'Резервирования'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Резерв: {self.quantity} x {self.stock_item.nomenclature_item} для {self.project}"


class StockMovement(BaseModelWithHistory):
    """
    Stock Movement - record of stock changes (receipt, issue, adjustment).
    """
    
    TYPE_CHOICES = [
        ('receipt', 'Приход'),
        ('issue', 'Расход'),
        ('transfer_out', 'Перемещение (отправка)'),
        ('transfer_in', 'Перемещение (приём)'),
        ('transfer', 'Перемещение'),
        ('adjustment', 'Корректировка'),
        ('return', 'Возврат'),
        ('inventory', 'Инвентаризация'),
        ('contractor_writeoff', 'Списание подрядчику'),
        ('contractor_receipt', 'Приёмка от подрядчика'),
        ('production', 'Производство'),
        ('consumption', 'Потребление'),
    ]
    
    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.CASCADE,
        related_name='movements',
        verbose_name="Складской запас"
    )
    
    # Movement type
    movement_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        verbose_name="Тип движения"
    )
    
    # Quantity (positive for receipt, negative for issue)
    quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Количество"
    )
    
    # Balance after movement
    balance_after = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Остаток после"
    )
    
    # Reference
    project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_movements',
        verbose_name="Проект"
    )
    project_item = models.ForeignKey(
        ProjectItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_movements',
        verbose_name="Элемент проекта"
    )
    
    # For transfers
    destination_warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incoming_movements',
        verbose_name="Склад назначения"
    )
    
    # Source document
    source_document = models.CharField(
        max_length=100,
        blank=True,
        default='',
        verbose_name="Документ-основание"
    )
    
    # Who performed the movement
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='stock_movements',
        verbose_name="Выполнил"
    )
    performed_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата операции"
    )
    
    # Notes
    reason = models.CharField(
        max_length=500,
        blank=True,
        verbose_name="Причина"
    )
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    class Meta:
        db_table = 'stock_movements'
        verbose_name = 'Движение по складу'
        verbose_name_plural = 'Движения по складу'
        ordering = ['-performed_at']
        indexes = [
            models.Index(fields=['stock_item', 'performed_at']),
            models.Index(fields=['project', 'performed_at']),
        ]
    
    def __str__(self):
        return f"{self.get_movement_type_display()}: {self.quantity} ({self.performed_at})"


class StockBatch(BaseModelWithHistory):
    """
    Stock Batch (Lot) - tracking of batches/lots for inventory items.
    
    Example: A cable spool of 100m is a single batch. When we use 0.5m,
    we track remaining 99.5m in the same batch.
    """
    
    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.CASCADE,
        related_name='batches',
        verbose_name="Складской запас"
    )
    
    # Batch identification
    batch_number = models.CharField(
        max_length=50,
        verbose_name="Номер партии"
    )
    
    # Quantities
    initial_quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Начальное количество"
    )
    current_quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Текущий остаток"
    )
    
    # Batch metadata
    receipt_date = models.DateField(
        verbose_name="Дата поступления"
    )
    expiry_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Срок годности"
    )
    
    # Supplier info
    supplier_batch_number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Номер партии поставщика"
    )
    
    # Purchase order reference
    purchase_order = models.ForeignKey(
        'PurchaseOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_batches',
        verbose_name="Заказ на закупку"
    )
    
    # Unit price for this batch
    unit_cost = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Цена за единицу"
    )
    
    # Status
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )
    
    class Meta:
        db_table = 'stock_batches'
        verbose_name = 'Партия'
        verbose_name_plural = 'Партии'
        ordering = ['receipt_date', 'batch_number']
        unique_together = [['stock_item', 'batch_number']]
    
    def __str__(self):
        return f"Партия {self.batch_number}: {self.current_quantity} ({self.stock_item.nomenclature_item})"
    
    @property
    def is_empty(self):
        return self.current_quantity <= 0
    
    @property
    def is_expired(self):
        from django.utils import timezone
        if self.expiry_date:
            return self.expiry_date < timezone.now().date()
        return False


class InventoryDocument(BaseModelWithHistory):
    """
    Inventory Document - document for inventory count/adjustment.
    """
    
    STATUS_CHOICES = [
        ('draft', 'Черновик'),
        ('in_progress', 'В работе'),
        ('completed', 'Завершена'),
        ('cancelled', 'Отменена'),
    ]
    
    TYPE_CHOICES = [
        ('full', 'Полная инвентаризация'),
        ('partial', 'Частичная инвентаризация'),
        ('spot_check', 'Выборочная проверка'),
    ]
    
    # Identification
    number = models.CharField(
        max_length=50,
        unique=True,
        verbose_name="Номер документа"
    )
    
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='inventory_documents',
        verbose_name="Склад"
    )
    
    # Type and status
    document_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default='full',
        verbose_name="Тип"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name="Статус"
    )
    
    # Dates
    planned_date = models.DateField(
        verbose_name="Плановая дата"
    )
    actual_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Фактическая дата"
    )
    
    # Responsible persons
    responsible = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='inventory_documents_responsible',
        verbose_name="Ответственный"
    )
    commission_members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='inventory_documents_commission',
        verbose_name="Члены комиссии"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    result_notes = models.TextField(
        blank=True,
        verbose_name="Результаты инвентаризации"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'inventory_documents'
        verbose_name = 'Документ инвентаризации'
        verbose_name_plural = 'Документы инвентаризации'
        ordering = ['-planned_date']
    
    def __str__(self):
        return f"Инвентаризация {self.number} ({self.warehouse})"

    @classmethod
    def generate_number(cls):
        """Генерация номера инвентаризации в формате ИНВ-YYYYMMDD-XXXX."""
        from django.utils import timezone
        today = timezone.now().date()
        prefix = f"ИНВ-{today.strftime('%Y%m%d')}-"
        # Учитываем даже soft-deleted документы, иначе можно получить дубликат номера
        count = cls.all_objects.filter(number__startswith=prefix).count() + 1
        return f"{prefix}{count:04d}"

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = self.generate_number()
        super().save(*args, **kwargs)
    
    def complete(self, user=None):
        """Complete inventory and apply all adjustments."""
        from django.utils import timezone
        
        if self.status != 'in_progress':
            raise ValueError("Можно завершить только инвентаризацию в статусе 'В работе'")
        
        with transaction.atomic():
            blocked_items = []
            for item in self.items.filter(is_counted=True):
                if item.actual_quantity is None:
                    continue
                reserved_qty = item.stock_item.reserved_quantity or 0
                if item.actual_quantity < reserved_qty:
                    blocked_items.append({
                        'name': item.stock_item.nomenclature_item.name,
                        'reserved': reserved_qty,
                        'unit': item.stock_item.unit,
                    })

            if blocked_items:
                details = '; '.join(
                    [f"{i['name']} — {i['reserved']} {i['unit']}" for i in blocked_items]
                )
                raise ValueError(
                    "Инвентаризация не может быть завершена: уменьшение затрагивает зарезервированные позиции. "
                    "Освободите резерв по проектам (переведите нужные позиции в статус «Ожидает заказа») и повторите. "
                    f"Резерв: {details}."
                )

            for item in self.items.filter(is_counted=True):
                if item.difference != 0:
                    # Create stock movement for adjustment
                    movement = StockMovement.objects.create(
                        stock_item=item.stock_item,
                        movement_type='adjustment',
                        quantity=item.difference,
                        balance_after=item.actual_quantity,
                        source_document=f"Инвентаризация {self.number}",
                        performed_by=user,
                        reason=f"Корректировка по инвентаризации. Учётное: {item.system_quantity}, факт: {item.actual_quantity}"
                    )
                    
                    # Update stock item quantity
                    item.stock_item.quantity = item.actual_quantity
                    item.stock_item.last_inventory_date = timezone.now().date()
                    item.stock_item.save()
            
            self.status = 'completed'
            self.actual_date = timezone.now().date()
            self.save()


class InventoryItem(BaseModelWithHistory):
    """
    Inventory Item - line item in inventory document.
    """
    
    inventory_document = models.ForeignKey(
        InventoryDocument,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Документ инвентаризации"
    )
    stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.PROTECT,
        related_name='inventory_items',
        verbose_name="Складской запас"
    )
    
    # Quantities
    system_quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Количество по учёту"
    )
    actual_quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        null=True,
        blank=True,
        verbose_name="Фактическое количество"
    )
    
    # Status
    is_counted = models.BooleanField(
        default=False,
        verbose_name="Подсчитано"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    class Meta:
        db_table = 'inventory_items'
        verbose_name = 'Позиция инвентаризации'
        verbose_name_plural = 'Позиции инвентаризации'
        unique_together = [['inventory_document', 'stock_item']]
    
    def __str__(self):
        return f"{self.stock_item.nomenclature_item} - {self.inventory_document.number}"
    
    @property
    def difference(self):
        """Calculate difference between actual and system quantity."""
        if self.actual_quantity is None:
            return 0
        return self.actual_quantity - self.system_quantity
    
    @property
    def difference_percent(self):
        """Calculate percentage difference."""
        if self.system_quantity == 0:
            return 100 if self.actual_quantity else 0
        return (self.difference / self.system_quantity) * 100


class StockTransfer(BaseModelWithHistory):
    """
    Stock Transfer Document - document for moving items between warehouses.
    
    This allows tracking of inventory movements between different warehouse locations
    with proper documentation and approval workflow.
    """
    
    STATUS_CHOICES = [
        ('draft', 'Черновик'),
        ('pending', 'Ожидает подтверждения'),
        ('in_transit', 'В пути'),
        ('completed', 'Завершён'),
        ('cancelled', 'Отменён'),
    ]
    
    # Identification
    number = models.CharField(
        max_length=50,
        unique=True,
        verbose_name="Номер документа"
    )
    
    # Warehouses
    source_warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='outgoing_transfers',
        verbose_name="Склад-отправитель"
    )
    destination_warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='incoming_transfers',
        verbose_name="Склад-получатель"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name="Статус"
    )
    
    # Dates
    created_date = models.DateField(
        auto_now_add=True,
        verbose_name="Дата создания"
    )
    shipped_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Дата отправки"
    )
    received_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Дата получения"
    )
    
    # Responsible persons
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_transfers',
        verbose_name="Создал"
    )
    shipped_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shipped_transfers',
        verbose_name="Отправил"
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='received_transfers',
        verbose_name="Получил"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    # Reason for transfer (e.g., warehouse deletion, project needs, etc.)
    reason = models.CharField(
        max_length=500,
        blank=True,
        verbose_name="Причина перемещения"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'stock_transfers'
        verbose_name = 'Перемещение между складами'
        verbose_name_plural = 'Перемещения между складами'
        ordering = ['-created_date']
    
    def __str__(self):
        return f"Перемещение {self.number}: {self.source_warehouse} → {self.destination_warehouse}"
    
    def clean(self):
        from django.core.exceptions import ValidationError
        if self.source_warehouse == self.destination_warehouse:
            raise ValidationError("Склад-отправитель и склад-получатель должны быть разными")
    
    def ship(self, user=None):
        """Ship the transfer - deduct from source warehouse."""
        from django.utils import timezone
        
        if self.status != 'pending':
            raise ValueError("Можно отправить только документ в статусе 'Ожидает подтверждения'")
        
        with transaction.atomic():
            for item in self.items.all():
                # Create outgoing movement
                StockMovement.objects.create(
                    stock_item=item.source_stock_item,
                    movement_type='transfer_out',
                    quantity=-item.quantity,
                    balance_after=item.source_stock_item.quantity - item.quantity,
                    source_document=f"Перемещение {self.number}",
                    performed_by=user,
                    reason=f"Перемещение на склад {self.destination_warehouse}"
                )
                
                # Update source stock item
                item.source_stock_item.quantity -= item.quantity
                item.source_stock_item.save()
            
            self.status = 'in_transit'
            self.shipped_date = timezone.now().date()
            self.shipped_by = user
            self.save()
    
    def receive(self, user=None):
        """Receive the transfer - add to destination warehouse."""
        from django.utils import timezone
        
        if self.status != 'in_transit':
            raise ValueError("Можно получить только документ в статусе 'В пути'")
        
        with transaction.atomic():
            for item in self.items.all():
                # Get or create destination stock item
                dest_stock_item, created = StockItem.objects.get_or_create(
                    warehouse=self.destination_warehouse,
                    nomenclature_item=item.source_stock_item.nomenclature_item,
                    defaults={
                        'quantity': 0,
                        'min_quantity': item.source_stock_item.min_quantity,
                    }
                )
                
                # Create incoming movement
                StockMovement.objects.create(
                    stock_item=dest_stock_item,
                    movement_type='transfer_in',
                    quantity=item.quantity,
                    balance_after=dest_stock_item.quantity + item.quantity,
                    source_document=f"Перемещение {self.number}",
                    performed_by=user,
                    reason=f"Перемещение со склада {self.source_warehouse}"
                )
                
                # Update destination stock item
                dest_stock_item.quantity += item.quantity
                dest_stock_item.save()
                
                # Update transfer item with destination reference
                item.destination_stock_item = dest_stock_item
                item.save()
            
            self.status = 'completed'
            self.received_date = timezone.now().date()
            self.received_by = user
            self.save()


class StockTransferItem(BaseModelWithHistory):
    """
    Stock Transfer Item - line item in transfer document.
    """
    
    transfer = models.ForeignKey(
        StockTransfer,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Документ перемещения"
    )
    
    # Source stock item (from which warehouse)
    source_stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.PROTECT,
        related_name='transfer_items_out',
        verbose_name="Позиция на складе-отправителе"
    )
    
    # Destination stock item (to which warehouse) - set after receive
    destination_stock_item = models.ForeignKey(
        StockItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfer_items_in',
        verbose_name="Позиция на складе-получателе"
    )
    
    # Quantity to transfer
    quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Количество"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    class Meta:
        db_table = 'stock_transfer_items'
        verbose_name = 'Позиция перемещения'
        verbose_name_plural = 'Позиции перемещения'
    
    def __str__(self):
        return f"{self.source_stock_item.nomenclature_item} - {self.quantity}"
    
    def clean(self):
        from django.core.exceptions import ValidationError
        if self.quantity > self.source_stock_item.quantity:
            raise ValidationError(
                f"Недостаточно товара на складе. Доступно: {self.source_stock_item.quantity}"
            )


class ProblemReason(BaseModelWithHistory):
    """
    Справочник причин проблем для потребностей в материалах.
    
    Примеры причин:
    - Не заказано вовремя (order_by_date прошла, а статус waiting_order)
    - Задержка поставки (delivery_date прошла, а товар не получен)
    - Отказ поставщика
    - Брак при приёмке
    """
    
    code = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name="Код"
    )
    name = models.CharField(
        max_length=200,
        verbose_name="Наименование"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    is_system = models.BooleanField(
        default=False,
        verbose_name="Системная",
        help_text="Системные причины устанавливаются автоматически"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'problem_reasons'
        verbose_name = 'Причина проблемы'
        verbose_name_plural = 'Причины проблем'
        ordering = ['name']
    
    def __str__(self):
        return self.name


class MaterialRequirement(BaseModelWithHistory):
    """
    Material Requirement - потребность в материалах/комплектующих.
    
    Согласно ERP-требованиям:
    - Потребности формируются автоматически из проектов (нет ручного создания)
    - Статусы: Ожидает заказа → В заказе → На складе (строго 3 статуса)
    - Статус = фактическое состояние документа
    - Проблема ≠ статус (отдельный флаг с причиной из справочника)
    
    Логика проблем:
    - Если order_by_date (дата "заказать до") прошла, а статус = waiting_order → проблема
    - Если delivery_date (срок поставки) прошла, а товар не получен → проблема
    
    Связь с заказом: одна потребность может быть только в одном заказе.
    """
    
    # Статусы согласно ERP-требованиям (строго 3 рабочих статуса)
    STATUS_CHOICES = [
        ('waiting_order', 'Ожидает заказа'),   # Начальный статус - надо включить в заказ
        ('in_order', 'В заказе'),              # Включена в заказ на закупку
        ('closed', 'На складе'),               # Товар на складе (получен)
        ('written_off', 'Списано'),            # Списано
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Низкий'),
        ('normal', 'Нормальный'),
        ('high', 'Высокий'),
        ('critical', 'Критический'),
    ]
    
    # Reference to nomenclature item
    nomenclature_item = models.ForeignKey(
        'NomenclatureItem',
        on_delete=models.CASCADE,
        related_name='material_requirements',
        verbose_name="Номенклатурная позиция"
    )
    
    # =========================================================
    # Связь с проектной структурой (согласно ТЗ)
    # Потребность привязана к конкретному месту в проекте
    # =========================================================
    project = models.ForeignKey(
        'Project',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='material_requirements',
        verbose_name="Проект"
    )
    project_item = models.ForeignKey(
        'ProjectItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='material_requirements',
        verbose_name="Позиция проекта (система/подсистема/работа)"
    )
    bom_item = models.ForeignKey(
        'BOMItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='material_requirements',
        verbose_name="Позиция BOM"
    )
    
    # Requirement identification
    calculation_date = models.DateTimeField(
        auto_now=True,
        verbose_name="Дата расчёта"
    )
    
    # Quantities
    total_required = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        default=0,
        verbose_name="Общая потребность"
    )
    total_available = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        default=0,
        verbose_name="Доступно на складах"
    )
    total_reserved = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        default=0,
        verbose_name="Зарезервировано"
    )
    total_in_order = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        default=0,
        verbose_name="В заказах"
    )
    to_order = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        default=0,
        verbose_name="К заказу"
    )
    
    # =========================================================
    # ERP-поля для управления сроками и проблемами
    # =========================================================
    
    # Дата, до которой нужно разместить заказ
    order_by_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        verbose_name="Заказать до",
        help_text="Дата, до которой нужно оформить заказ у поставщика"
    )
    
    # Срок поставки (дата, когда товар должен прийти на склад)
    delivery_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        verbose_name="Срок поставки",
        help_text="Дата, к которой товар должен быть на складе"
    )
    
    # Связь с конкретным поставщиком для этой потребности
    supplier = models.ForeignKey(
        'Supplier',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='material_requirements',
        verbose_name="Поставщик"
    )
    
    # Связь с заказом (одна потребность = один заказ, нельзя дублировать)
    purchase_order = models.ForeignKey(
        'PurchaseOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='linked_requirements',
        verbose_name="Заказ на закупку",
        help_text="Заказ, в который включена данная потребность"
    )
    
    # =========================================================
    # Флаг и причина проблемы (отдельно от статуса!)
    # =========================================================
    has_problem = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Есть проблема",
        help_text="Флаг наличия проблемы (не заказано вовремя, задержка и т.д.)"
    )
    problem_reason = models.ForeignKey(
        'ProblemReason',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='material_requirements',
        verbose_name="Причина проблемы",
        help_text="Причина из справочника причин проблем"
    )
    problem_notes = models.TextField(
        blank=True,
        verbose_name="Комментарий к проблеме"
    )
    
    # Safety stock and timing
    safety_stock = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        default=0,
        verbose_name="Страховой запас"
    )
    lead_time_days = models.PositiveIntegerField(
        default=14,
        verbose_name="Срок поставки (дней)"
    )
    
    # Consumption tracking (for partial consumption items)
    avg_daily_consumption = models.DecimalField(
        max_digits=15,
        decimal_places=6,
        default=0,
        verbose_name="Среднее дневное потребление"
    )
    days_until_depletion = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="Дней до исчерпания"
    )
    reorder_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Дата заказа"
    )
    
    # Status and priority
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='waiting_order',  # Новый дефолт вместо calculated
        db_index=True,
        verbose_name="Статус"
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default='normal',
        verbose_name="Приоритет"
    )
    
    # Legacy M2M поле - deprecated, используйте purchase_order FK
    purchase_orders = models.ManyToManyField(
        'PurchaseOrder',
        blank=True,
        related_name='material_requirements_legacy',
        verbose_name="Заказы на закупку (legacy)"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'material_requirements'
        verbose_name = 'Потребность в материалах и комплектующих'
        verbose_name_plural = 'Потребности в материалах и комплектующих'
        ordering = ['priority', '-calculation_date']
        constraints = [
            # Одна потребность может быть только в одном заказе
            models.UniqueConstraint(
                fields=['nomenclature_item', 'project', 'project_item', 'purchase_order'],
                name='unique_requirement_in_order',
                condition=models.Q(purchase_order__isnull=False)
            ),
        ]
    
    def __str__(self):
        return f"Потребность: {self.nomenclature_item} - К заказу: {self.to_order}"
    
    def check_problems(self):
        """
        Проверка и установка флага проблемы.
        Вызывается автоматически при сохранении.
        """
        from django.utils import timezone
        from infrastructure.persistence.models.procurement import PurchaseOrderItem
        today = timezone.now().date()
        
        # Сбросить проблему если потребность закрыта/списана
        if self.status in ['closed', 'written_off']:
            # Сбрасываем только флаг проблемы, причину не трогаем (сохраняем историю)
            self.has_problem = False
            return
        
        # Проблема 1: Не заказано вовремя
        if (self.status == 'waiting_order' and 
            self.order_by_date and 
            today > self.order_by_date):
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
        # иначе используем ожидаемую дату заказа, и только потом delivery_date.
        expected_delivery_date = None
        ordered_late = False
        if self.status == 'in_order':
            if self.purchase_order_id:
                po_item_qs = PurchaseOrderItem.objects.filter(
                    order_id=self.purchase_order_id,
                    nomenclature_item_id=self.nomenclature_item_id,
                )
                if self.project_item_id:
                    po_item_qs = po_item_qs.filter(project_item_id=self.project_item_id)
                po_item = po_item_qs.order_by('-created_at').select_related('order').first()
                if po_item:
                    if po_item.order and po_item.order.order_date and self.order_by_date:
                        if po_item.order.order_date > self.order_by_date:
                            ordered_late = True
                    expected_delivery_date = (
                        po_item.expected_delivery_date
                        or po_item.order.expected_delivery_date
                    )
                else:
                    expected_delivery_date = self.purchase_order.expected_delivery_date
            expected_delivery_date = expected_delivery_date or self.delivery_date

        if self.status == 'in_order' and ordered_late:
            self.has_problem = True
            reason = ProblemReason.objects.filter(
                code='ordered_late',
                is_active=True
            ).first()
            if reason:
                self.problem_reason = reason

        if (
            self.status == 'in_order'
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

        if self.status == 'in_order' and ordered_late:
            return
        
        # Нет проблем
        self.has_problem = False
        self.problem_reason = None
    
    def save(self, *args, **kwargs):
        # Проверить проблемы перед сохранением
        self.check_problems()
        super().save(*args, **kwargs)
    
    @property
    def deficit(self):
        """Calculate current deficit."""
        return max(0, self.total_required - self.total_available - self.total_in_order + self.total_reserved)
    
    @property
    def is_critical(self):
        """Check if requirement is critical (need to order now)."""
        if self.days_until_depletion is not None:
            return self.days_until_depletion <= self.lead_time_days
        return self.deficit > 0
    
    def calculate_reorder_date(self):
        """Calculate when to place order based on consumption and lead time."""
        from django.utils import timezone
        
        if self.avg_daily_consumption > 0 and self.total_available > 0:
            # Days until stock depletes
            days_to_deplete = int(
                (self.total_available - self.total_reserved) / self.avg_daily_consumption
            )
            self.days_until_depletion = days_to_deplete
            
            # When to order = depletion date - lead time
            order_in_days = max(0, days_to_deplete - self.lead_time_days)
            self.reorder_date = timezone.now().date() + timezone.timedelta(days=order_in_days)
        else:
            self.days_until_depletion = None
            self.reorder_date = None
    
    @classmethod
    def calculate_for_item(cls, nomenclature_item):
        """
        Calculate material requirement for a nomenclature item across all active projects.
        
        This considers:
        - BOM requirements from active projects
        - Current stock levels across all warehouses
        - Reserved quantities
        - Items already in purchase orders
        - Historical consumption for partial-use items
        """
        from django.db.models import Sum, F
        from django.utils import timezone
        
        # Get or create requirement record
        requirement, created = cls.objects.get_or_create(
            nomenclature_item=nomenclature_item,
            defaults={'status': 'waiting_order'}
        )
        
        # Calculate total required from active projects
        # (BOM items in projects with status 'in_progress' or 'planning')
        from infrastructure.persistence.models import Project, BOMItem
        
        total_required = BOMItem.objects.filter(
            nomenclature_item=nomenclature_item,
            deleted_at__isnull=True,
            bom__project__status__in=['planning', 'in_progress'],
            bom__deleted_at__isnull=True
        ).aggregate(
            total=Sum('quantity')
        )['total'] or 0
        
        # Get total available across all warehouses
        total_available = StockItem.objects.filter(
            nomenclature_item=nomenclature_item,
            deleted_at__isnull=True
        ).aggregate(
            total=Sum('quantity')
        )['total'] or 0
        
        # Get total reserved
        total_reserved = StockReservation.objects.filter(
            stock_item__nomenclature_item=nomenclature_item,
            status__in=['pending', 'confirmed'],
            deleted_at__isnull=True
        ).aggregate(
            total=Sum('quantity')
        )['total'] or 0
        
        # Get total in pending purchase orders
        from infrastructure.persistence.models import PurchaseOrderItem
        total_in_order = PurchaseOrderItem.objects.filter(
            nomenclature_item=nomenclature_item,
            purchase_order__status__in=['draft', 'ordered', 'partially_delivered'],
            deleted_at__isnull=True
        ).aggregate(
            total=Sum('quantity')
        )['total'] or 0
        
        # Calculate average daily consumption from last 90 days
        ninety_days_ago = timezone.now() - timezone.timedelta(days=90)
        consumption = StockMovement.objects.filter(
            stock_item__nomenclature_item=nomenclature_item,
            movement_type__in=['consumption', 'production'],
            quantity__lt=0,
            performed_at__gte=ninety_days_ago,
            deleted_at__isnull=True
        ).aggregate(
            total=Sum('quantity')
        )['total'] or 0
        
        avg_daily_consumption = abs(consumption) / 90 if consumption else 0
        
        # Update requirement
        requirement.total_required = total_required
        requirement.total_available = total_available
        requirement.total_reserved = total_reserved
        requirement.total_in_order = total_in_order
        requirement.avg_daily_consumption = avg_daily_consumption
        
        # Calculate to_order amount
        available_for_use = total_available - total_reserved + total_in_order
        requirement.to_order = max(0, total_required - available_for_use + requirement.safety_stock)
        
        # Calculate reorder date
        requirement.calculate_reorder_date()
        
        # Set priority based on criticality
        if requirement.is_critical:
            if requirement.days_until_depletion and requirement.days_until_depletion < 7:
                requirement.priority = 'critical'
            else:
                requirement.priority = 'high'
        elif requirement.to_order > 0:
            requirement.priority = 'normal'
        else:
            requirement.priority = 'low'
        
        requirement.save()
        return requirement

    @classmethod
    def sync_from_project_items(cls):
        """
        Синхронизация потребностей из позиций проектов (ProjectItem).
        
        Согласно ERP-требованиям:
        - Потребности формируются автоматически из активных проектов
        - Одна потребность = одна позиция проекта с is_purchased=True
        - Статус потребности = статус позиции проекта
        """
        from infrastructure.persistence.models import Project, ProjectItem
        from django.utils import timezone
        
        synced = []
        
        # Получить все закупаемые позиции из АКТИВНЫХ проектов
        # Согласно ERP-требованиям: только проекты в статусе 'В работе' (in_progress)
        # Проекты в планировании - НЕ должны создавать потребности
        active_statuses = ['in_progress']  # Только активные проекты!
        
        purchased_items = ProjectItem.objects.filter(
            project__status__in=active_statuses,
            nomenclature_item__catalog_category__is_purchased=True,
            supplier__isnull=False  # Только позиции с назначенным поставщиком
        ).select_related(
            'project', 
            'nomenclature_item', 
            'supplier',
            'problem_reason'
        )

        active_item_ids = set(purchased_items.values_list('id', flat=True))
        
        for item in purchased_items:
            # Статус потребности = статус позиции
            req_status = item.purchase_status
            if req_status not in ['waiting_order', 'in_order', 'closed', 'written_off']:
                req_status = 'waiting_order'  # Fallback
            
            # Создать или обновить потребность
            requirement, created = cls.objects.update_or_create(
                project=item.project,
                project_item=item,
                nomenclature_item=item.nomenclature_item,
                defaults={
                    'status': req_status,
                    'total_required': item.quantity,
                    'order_by_date': item.order_date,
                    'delivery_date': item.required_date,
                    'supplier': item.supplier,
                    'has_problem': item.has_problem,
                    'problem_reason': item.problem_reason,
                    'problem_notes': getattr(item, 'problem_notes', ''),
                    'priority': 'high' if item.has_problem else 'normal',
                }
            )
            
            # Обновить количества со склада
            total_available = StockItem.objects.filter(
                nomenclature_item=item.nomenclature_item,
            ).aggregate(total=models.Sum('quantity'))['total'] or 0
            
            # Резервы ДРУГИХ позиций (не текущей) - они занимают часть остатка
            total_reserved_others = StockReservation.objects.filter(
                stock_item__nomenclature_item=item.nomenclature_item,
                status__in=['pending', 'confirmed'],
            ).exclude(
                project_item=item  # Исключаем резервы для текущей позиции
            ).aggregate(total=models.Sum('quantity'))['total'] or 0
            
            # Резервы для текущей позиции - уже обеспечено
            reserved_for_this = StockReservation.objects.filter(
                project_item=item,
                status__in=['pending', 'confirmed'],
            ).aggregate(total=models.Sum('quantity'))['total'] or 0
            
            # Свободно на складе = всего - зарезервировано другими
            free_stock = max(0, total_available - total_reserved_others)
            
            # К заказу = потребность - (уже зарезервировано для этой позиции + свободный остаток)
            already_covered = reserved_for_this + free_stock
            
            requirement.total_available = total_available
            requirement.total_reserved = total_reserved_others + reserved_for_this  # Для отображения общего резерва
            requirement.to_order = max(0, item.quantity - already_covered)
            requirement.save()

            # Если статус потребности изменился и больше не in_order, отвязать от заказа
            if requirement.purchase_order and req_status != 'in_order':
                from django.db.models.deletion import ProtectedError
                from infrastructure.persistence.models import PurchaseOrderItem
                po_items = PurchaseOrderItem.objects.filter(
                    order=requirement.purchase_order,
                    project_item=item,
                    nomenclature_item=item.nomenclature_item,
                )
                try:
                    po_items.delete()
                    requirement.purchase_order = None
                    requirement.save(update_fields=['purchase_order'])
                except ProtectedError:
                    # Если по строке уже есть приёмка, не удаляем и не отвязываем
                    pass
            
            synced.append(requirement)

        # Удалить потребности для удалённых/неактуальных позиций проекта
        obsolete_requirements = cls.objects.filter(
            project__status__in=active_statuses,
            project_item__isnull=False,
            is_active=True,
            deleted_at__isnull=True
        ).exclude(project_item_id__in=active_item_ids)

        for req in obsolete_requirements:
            req.soft_delete()
        
        return synced


class ContractorWriteOff(BaseModelWithHistory):
    """
    Документ передачи материалов/комплектующих подрядчику (списание со склада).
    
    Согласно ERP-требованиям:
    - При передаче работы подрядчику с поставкой материалов от заказчика
    - Списываются материалы со склада
    - Создаётся документ для учёта
    """
    
    STATUS_CHOICES = [
        ('draft', 'Черновик'),
        ('confirmed', 'Подтверждено'),
        ('cancelled', 'Отменено'),
    ]
    
    # Идентификация
    number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name="Номер документа"
    )
    
    # Подрядчик
    contractor = models.ForeignKey(
        'Contractor',
        on_delete=models.PROTECT,
        related_name='writeoffs',
        verbose_name="Подрядчик"
    )
    
    # Склад-источник
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='contractor_writeoffs',
        verbose_name="Склад"
    )
    
    # Проект (опционально)
    project = models.ForeignKey(
        'Project',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contractor_writeoffs',
        verbose_name="Проект"
    )
    
    # Элемент проекта (работа, которую делает подрядчик)
    project_item = models.ForeignKey(
        'ProjectItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contractor_writeoffs',
        verbose_name="Позиция проекта"
    )
    
    # Статус
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name="Статус"
    )
    
    # Даты
    writeoff_date = models.DateField(
        verbose_name="Дата передачи"
    )
    
    # Кто передал
    transferred_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='contractor_writeoffs',
        verbose_name="Передал"
    )
    
    # Примечания
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'contractor_writeoffs'
        verbose_name = 'Передача подрядчику'
        verbose_name_plural = 'Передачи подрядчикам'
        ordering = ['-writeoff_date', '-created_at']
    
    def __str__(self):
        return f"Передача {self.number} подрядчику {self.contractor} от {self.writeoff_date}"

    @classmethod
    def generate_number(cls):
        """Генерация номера передачи подрядчику в формате ПРД-XXXX."""
        from django.db.models import Max
        import re

        last_num = cls.objects.aggregate(max_num=Max('number'))['max_num']
        if last_num:
            match = re.search(r'ПРД-(\d+)', last_num)
            next_num = int(match.group(1)) + 1 if match else 1
        else:
            next_num = 1
        return f"ПРД-{next_num:04d}"

    def save(self, *args, **kwargs):
        from django.utils import timezone
        if not self.number:
            self.number = self.generate_number()
        if not self.writeoff_date:
            self.writeoff_date = timezone.now().date()
        super().save(*args, **kwargs)
    
    def confirm(self, user=None):
        """
        Подтверждение передачи.
        Списывает материалы со склада.
        """
        from django.db import transaction
        
        if self.status != 'draft':
            raise ValueError("Можно подтвердить только черновик")
        
        with transaction.atomic():
            for item in self.items.all():
                # Найти позицию на складе
                stock_item = StockItem.objects.filter(
                    warehouse=self.warehouse,
                    nomenclature_item=item.nomenclature_item,
                    deleted_at__isnull=True
                ).first()
                
                if not stock_item:
                    raise ValueError(
                        f"Номенклатура {item.nomenclature_item} отсутствует на складе {self.warehouse}"
                    )
                
                if stock_item.quantity < item.quantity:
                    raise ValueError(
                        f"Недостаточно {item.nomenclature_item} на складе. "
                        f"Доступно: {stock_item.quantity}, требуется: {item.quantity}"
                    )
                
                # Списать со склада
                stock_item.quantity -= item.quantity
                stock_item.save()
                
                # Создать запись о движении
                StockMovement.objects.create(
                    stock_item=stock_item,
                    movement_type='contractor_writeoff',
                    quantity=-item.quantity,
                    balance_after=stock_item.quantity,
                    source_document=f"Передача подрядчику {self.number}",
                    performed_by=user or self.transferred_by,
                    reason=f"Передача подрядчику {self.contractor.name}",
                )
            
            self.status = 'confirmed'
            self.save()


class ContractorWriteOffItem(BaseModelWithHistory):
    """
    Позиция в документе передачи подрядчику.
    """
    
    writeoff = models.ForeignKey(
        ContractorWriteOff,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Документ передачи"
    )
    
    # Номенклатура
    nomenclature_item = models.ForeignKey(
        'NomenclatureItem',
        on_delete=models.PROTECT,
        related_name='contractor_writeoff_items',
        verbose_name="Номенклатура"
    )
    
    # Количество
    quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Количество"
    )
    
    # Примечания
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    class Meta:
        db_table = 'contractor_writeoff_items'
        verbose_name = 'Позиция передачи'
        verbose_name_plural = 'Позиции передачи'
    
    def __str__(self):
        return f"{self.writeoff.number}: {self.nomenclature_item} x{self.quantity}"


class ContractorReceipt(BaseModelWithHistory):
    """
    Документ приёмки от подрядчика (поступление готовых изделий).
    
    Согласно ERP-требованиям:
    - После изготовления подрядчиком
    - Приходует на склад готовые изделия
    """
    
    STATUS_CHOICES = [
        ('draft', 'Черновик'),
        ('confirmed', 'Подтверждено'),
        ('cancelled', 'Отменено'),
    ]
    
    # Идентификация
    number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name="Номер документа"
    )
    
    # Подрядчик
    contractor = models.ForeignKey(
        'Contractor',
        on_delete=models.PROTECT,
        related_name='receipts',
        verbose_name="Подрядчик"
    )
    
    # Склад-приёмник
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name='contractor_receipts',
        verbose_name="Склад"
    )
    
    # Проект
    project = models.ForeignKey(
        'Project',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contractor_receipts',
        verbose_name="Проект"
    )
    
    # Связь с документом передачи (опционально)
    writeoff = models.ForeignKey(
        ContractorWriteOff,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='receipts',
        verbose_name="Документ передачи"
    )
    
    # Статус
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name="Статус"
    )
    
    # Даты
    receipt_date = models.DateField(
        verbose_name="Дата приёмки"
    )
    
    # Кто принял
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='contractor_receipts',
        verbose_name="Принял"
    )
    
    # Примечания
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'contractor_receipts'
        verbose_name = 'Приёмка от подрядчика'
        verbose_name_plural = 'Приёмки от подрядчиков'
        ordering = ['-receipt_date', '-created_at']
    
    def __str__(self):
        return f"Приёмка {self.number} от {self.contractor} {self.receipt_date}"

    @classmethod
    def generate_number(cls):
        """Генерация номера приёмки от подрядчика в формате ПРМ-XXXX."""
        from django.db.models import Max
        import re

        last_num = cls.objects.aggregate(max_num=Max('number'))['max_num']
        if last_num:
            match = re.search(r'ПРМ-(\d+)', last_num)
            next_num = int(match.group(1)) + 1 if match else 1
        else:
            next_num = 1
        return f"ПРМ-{next_num:04d}"

    def save(self, *args, **kwargs):
        from django.utils import timezone
        if not self.number:
            self.number = self.generate_number()
        if not self.receipt_date:
            self.receipt_date = timezone.now().date()
        super().save(*args, **kwargs)
    
    def confirm(self, user=None):
        """
        Подтверждение приёмки.
        Приходует изделия на склад.
        """
        from django.db import transaction
        
        if self.status != 'draft':
            raise ValueError("Можно подтвердить только черновик")
        
        with transaction.atomic():
            for item in self.items.all():
                # Найти или создать позицию на складе
                stock_item, created = StockItem.objects.get_or_create(
                    warehouse=self.warehouse,
                    nomenclature_item=item.nomenclature_item,
                    defaults={
                        'quantity': 0,
                        'unit': item.nomenclature_item.unit or 'шт',
                    }
                )
                
                # Приходовать на склад
                stock_item.quantity += item.quantity
                stock_item.save()
                
                # Создать запись о движении
                StockMovement.objects.create(
                    stock_item=stock_item,
                    movement_type='contractor_receipt',
                    quantity=item.quantity,
                    balance_after=stock_item.quantity,
                    source_document=f"Приёмка от подрядчика {self.number}",
                    performed_by=user or self.received_by,
                    reason=f"Приёмка от подрядчика {self.contractor.name}",
                )
                
                # Обновить статус позиции проекта если есть связь
                if item.project_item:
                    item.project_item.contractor_status = 'completed'
                    item.project_item.save(update_fields=['contractor_status', 'updated_at'])
            
            self.status = 'confirmed'
            self.save()


class ContractorReceiptItem(BaseModelWithHistory):
    """
    Позиция в документе приёмки от подрядчика.
    """
    
    receipt = models.ForeignKey(
        ContractorReceipt,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Документ приёмки"
    )
    
    # Номенклатура (готовое изделие)
    nomenclature_item = models.ForeignKey(
        'NomenclatureItem',
        on_delete=models.PROTECT,
        related_name='contractor_receipt_items',
        verbose_name="Номенклатура"
    )
    
    # Позиция проекта (опционально)
    project_item = models.ForeignKey(
        'ProjectItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contractor_receipt_items',
        verbose_name="Позиция проекта"
    )
    
    # Количество
    quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Количество"
    )
    
    # Примечания
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    class Meta:
        db_table = 'contractor_receipt_items'
        verbose_name = 'Позиция приёмки'
        verbose_name_plural = 'Позиции приёмки'
    
    def __str__(self):
        return f"{self.receipt.number}: {self.nomenclature_item} x{self.quantity}"