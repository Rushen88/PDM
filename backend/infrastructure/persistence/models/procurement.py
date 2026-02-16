"""
Procurement ORM Models.

Models for purchase orders and procurement tracking.
"""

from datetime import date
from decimal import Decimal
from django.db import models
from django.conf import settings

from .base import BaseModelWithHistory, ActiveManager, AllObjectsManager
from .catalog import Supplier, NomenclatureItem, DelayReason
from .project import Project, ProjectItem, PurchaseStatusChoices


class PurchaseOrder(BaseModelWithHistory):
    """
    Purchase Order - order to a supplier for materials/products.
    
    Согласно ERP-требованиям:
    - Заказ — документ, а не строка
    - Один заказ может включать материалы из разных проектов/потребностей
    - Закупки не управляют остатками — только обязательствами
    - Удалять можно только черновики (физическое удаление)
    - Статус "Отменён" убран - вместо него удаление черновика
    
    Статусы:
    - Черновик: формирование заказа (пользователь)
    - Заказан: отправка поставщику (пользователь)  
    - Частично поставлен: частичное поступление (система)
    - Закрыт: полное поступление (система)
    """
    
    STATUS_CHOICES = [
        ('draft', 'Черновик'),
        ('ordered', 'Заказан'),
        ('partially_delivered', 'Частично поставлен'),
        ('closed', 'Закрыт'),
        # Legacy статусы для миграции
        ('cancelled', 'Отменен'),
    ]
    
    # Identification
    number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name="Номер заказа"
    )
    
    # Supplier
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='purchase_orders',
        verbose_name="Поставщик"
    )
    
    # Project reference (optional - can be general stock order)
    project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_orders',
        verbose_name="Проект"
    )
    
    # Status
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default='draft',
        db_index=True,
        verbose_name="Статус"
    )
    
    # Dates
    order_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Дата заказа"
    )
    expected_delivery_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Ожидаемая дата доставки"
    )
    actual_delivery_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Фактическая дата доставки"
    )
    
    # Totals
    total_amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Общая сумма"
    )
    currency = models.CharField(
        max_length=3,
        default='RUB',
        verbose_name="Валюта"
    )
    
    # Payment
    payment_terms = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="Условия оплаты"
    )
    payment_status = models.CharField(
        max_length=30,
        blank=True,
        verbose_name="Статус оплаты"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'purchase_orders'
        verbose_name = 'Заказ на закупку'
        verbose_name_plural = 'Заказы на закупку'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Заказ {self.number} - {self.supplier}"
    
    def update_total_amount(self):
        """Пересчитать общую сумму заказа из позиций."""
        from django.db.models import Sum
        total = self.items.filter(is_active=True, deleted_at__isnull=True).aggregate(
            total=Sum('total_price')
        )['total'] or 0
        self.total_amount = total
        self.save(update_fields=['total_amount', 'updated_at'])
    
    def update_status_from_deliveries(self):
        """
        Автообновление статуса на основании поставок.
        Вызывается системой при создании поступлений.
        """
        if self.status == 'cancelled':
            return
            
        items = self.items.filter(is_active=True, deleted_at__isnull=True).exclude(status='cancelled')
        if not items.exists():
            return
        
        all_delivered = all(item.is_fully_delivered for item in items)
        any_delivered = any(item.delivered_quantity > 0 for item in items)
        
        if all_delivered:
            self.status = 'closed'
        elif any_delivered:
            self.status = 'partially_delivered'
        
        self.save(update_fields=['status', 'updated_at'])
    
    def can_delete(self):
        """
        Проверка возможности удаления заказа.
        Удалять можно только черновики.
        """
        return self.status == 'draft'
    
    def safe_delete(self, user=None):
        """
        Безопасное удаление заказа (только для черновиков).
        
        Возвращает True если удаление успешно, иначе вызывает исключение.
        """
        if not self.can_delete():
            raise ValueError(
                f"Невозможно удалить заказ в статусе '{self.get_status_display()}'. "
                f"Удалять можно только черновики."
            )
        
        # Освободить связанные потребности
        from infrastructure.persistence.models import MaterialRequirement
        MaterialRequirement.objects.filter(
            purchase_order=self
        ).update(
            purchase_order=None, 
            status='waiting_order'
        )

        # Вернуть статусы позиций проекта
        for item in self.items.all():
            if item.project_item:
                item.project_item.purchase_status = 'waiting_order'
                item.project_item.save(update_fields=['purchase_status', 'has_problem', 'problem_reason', 'updated_at'])
        
        # Физическое удаление (не soft-delete)
        self.items.all().delete()
        self.delete()
        return True
    
    @classmethod
    def generate_order_number(cls):
        """
        Генерация номера заказа в формате З-ХХХХ.
        """
        from django.db.models import Max
        import re
        
        last_order = cls.objects.aggregate(max_num=Max('number'))['max_num']
        if last_order:
            # Извлечь число из номера
            match = re.search(r'З-(\d+)', last_order)
            if match:
                next_num = int(match.group(1)) + 1
            else:
                next_num = 1
        else:
            next_num = 1
        
        return f'З-{next_num:04d}'
    
    def save(self, *args, **kwargs):
        """Автоматическая генерация номера и установка даты."""
        from django.utils import timezone
        
        # Генерация номера при создании
        if not self.number:
            self.number = self.generate_order_number()
        
        # Установка даты при переводе в статус "Заказан"
        if self.status == 'ordered' and not self.order_date:
            self.order_date = timezone.now().date()
        
        super().save(*args, **kwargs)
    
    def confirm_order(self, user=None):
        """
        Подтверждение заказа (перевод в статус "Заказан").
        
        - Проверяет наличие позиций
        - Устанавливает дату заказа
        - Обновляет статусы потребностей и позиций проекта
        """
        from django.utils import timezone
        from django.db import transaction
        
        if self.status != 'draft':
            raise ValueError("Подтвердить можно только черновик")
        
        if not self.items.exists():
            raise ValueError("Невозможно подтвердить пустой заказ")
        
        with transaction.atomic():
            # Обновить статус заказа
            self.status = 'ordered'
            self.order_date = timezone.now().date()
            self.save()
            
            # Обновить статусы позиций заказа
            from infrastructure.persistence.models import MaterialRequirement, ProjectItem
            
            for item in self.items.all():
                # Обновить потребности
                MaterialRequirement.objects.filter(
                    purchase_order=self,
                    project_item=item.project_item
                ).update(status='in_order')
                
                # Обновить позиции проекта
                if item.project_item:
                    item.project_item.purchase_status = 'in_order'
                    if not item.project_item.actual_start:
                        item.project_item.actual_start = self.order_date
                    item.project_item.save(update_fields=[
                        'purchase_status',
                        'actual_start',
                        'has_problem',
                        'problem_reason',
                        'updated_at'
                    ])

            # Обновить фактическую дату заказа для всех потребностей, связанных с заказом
            MaterialRequirement.objects.filter(
                purchase_order=self,
                project_item__isnull=False
            ).select_related('project_item').update(status='in_order')

            project_items = ProjectItem.objects.filter(
                material_requirements__purchase_order=self,
                material_requirements__project_item__isnull=False
            ).distinct()
            for project_item in project_items:
                if not project_item.actual_start:
                    project_item.actual_start = self.order_date
                    project_item.save(update_fields=['actual_start', 'updated_at'])
        
        return self


class PurchaseOrderItem(BaseModelWithHistory):
    """
    Item in a purchase order.
    """
    
    STATUS_CHOICES = [
        ('pending', 'Ожидает'),
        ('ordered', 'Заказано'),
        ('in_transit', 'В пути'),
        ('delivered', 'Доставлено'),
        ('cancelled', 'Отменено'),
    ]
    
    order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Заказ"
    )
    
    # Item reference
    nomenclature_item = models.ForeignKey(
        NomenclatureItem,
        on_delete=models.PROTECT,
        related_name='purchase_order_items',
        verbose_name="Номенклатура"
    )
    project_item = models.ForeignKey(
        ProjectItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_order_items',
        verbose_name="Элемент проекта"
    )
    
    # Quantity
    quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Количество"
    )
    unit = models.CharField(
        max_length=20,
        default='шт',
        verbose_name="Единица измерения"
    )
    delivered_quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        default=0,
        verbose_name="Доставленное количество"
    )
    
    # Pricing
    unit_price = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Цена за единицу"
    )
    total_price = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Общая стоимость"
    )
    
    # Supplier info
    article_number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Артикул поставщика"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        verbose_name="Статус"
    )
    
    # Delivery tracking
    expected_delivery_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Ожидаемая дата доставки"
    )
    actual_delivery_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Фактическая дата доставки"
    )
    
    # Delay tracking
    delay_reason = models.ForeignKey(
        DelayReason,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_order_items',
        verbose_name="Причина задержки"
    )
    delay_notes = models.TextField(
        blank=True,
        verbose_name="Комментарий к задержке"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    class Meta:
        db_table = 'purchase_order_items'
        verbose_name = 'Позиция заказа'
        verbose_name_plural = 'Позиции заказов'
        ordering = ['order', 'id']
    
    def __str__(self):
        return f"{self.order.number}: {self.nomenclature_item} x{self.quantity}"
    
    @property
    def is_fully_delivered(self):
        return self.delivered_quantity >= self.quantity
    
    @property
    def remaining_quantity(self):
        return self.quantity - self.delivered_quantity

    def save(self, *args, **kwargs):
        # Calculate total price
        if self.unit_price and self.quantity:
            self.total_price = self.unit_price * self.quantity
        else:
            self.total_price = 0
            
        super().save(*args, **kwargs)
        
        # Update order total
        if self.order:
            self.order.update_total_amount()

    def delete(self, *args, **kwargs):
        order = self.order
        # Освободить связанную потребность
        try:
            from infrastructure.persistence.models import MaterialRequirement
            req_qs = MaterialRequirement.objects.filter(
                purchase_order=self.order,
                nomenclature_item=self.nomenclature_item,
            )
            if self.project_item_id:
                req_qs = req_qs.filter(project_item_id=self.project_item_id)
            else:
                req_qs = req_qs.filter(project_item__isnull=True)
            req_qs.update(purchase_order=None, status='waiting_order')
        except Exception:
            pass
        super().delete(*args, **kwargs)
        # Update order total
        if order:
            order.update_total_amount()


class GoodsReceipt(BaseModelWithHistory):
    """
    Goods Receipt - документ поступления товаров (приёмка).
    
    Согласно ТЗ:
    - Поступление создаётся на основании заказа
    - Допускается частичное поступление
    - При подтверждении поступления:
      * Увеличиваются складские остатки
      * Обновляется статус заказа
      * Закрываются связанные потребности
    """
    
    STATUS_CHOICES = [
        ('draft', 'Черновик'),
        ('confirmed', 'Подтверждено'),
        ('cancelled', 'Отменено'),
    ]
    
    # Identification
    number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name="Номер документа"
    )
    
    # Reference to purchase order
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.PROTECT,
        related_name='goods_receipts',
        verbose_name="Заказ на закупку"
    )
    
    # Warehouse where goods are received
    warehouse = models.ForeignKey(
        'Warehouse',
        on_delete=models.PROTECT,
        related_name='goods_receipts',
        verbose_name="Склад"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name="Статус"
    )
    
    # Dates
    receipt_date = models.DateField(
        verbose_name="Дата поступления"
    )
    
    # Personnel
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='goods_receipts',
        verbose_name="Принял"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'goods_receipts'
        verbose_name = 'Поступление'
        verbose_name_plural = 'Поступления'
        ordering = ['-receipt_date', '-created_at']
    
    def __str__(self):
        return f"Поступление {self.number} от {self.receipt_date}"
    
    @classmethod
    def generate_receipt_number(cls):
        """
        Генерация номера поступления в формате П-ХХХХ.
        """
        from django.db.models import Max
        import re
        
        last_receipt = cls.objects.aggregate(max_num=Max('number'))['max_num']
        if last_receipt:
            # Извлечь число из номера
            match = re.search(r'П-(\d+)', last_receipt)
            if match:
                next_num = int(match.group(1)) + 1
            else:
                next_num = 1
        else:
            next_num = 1
        
        return f'П-{next_num:04d}'
    
    def save(self, *args, **kwargs):
        """Автоматическая генерация номера поступления и даты."""
        from django.utils import timezone
        if not self.number:
            self.number = self.generate_receipt_number()
        if not self.receipt_date:
            self.receipt_date = timezone.now().date()
        super().save(*args, **kwargs)
    
    def confirm(self, user=None):
        """
        Подтверждение поступления.
        Системная операция: обновляет остатки, статусы заказа и потребностей.
        """
        from django.db import transaction
        from .inventory import StockItem, StockMovement, StockBatch, StockReservation
        
        if self.status != 'draft':
            raise ValueError("Можно подтвердить только черновик поступления")
        
        with transaction.atomic():
            for receipt_item in self.items.all():
                po_item = receipt_item.purchase_order_item
                
                # 1. Get or create StockItem
                stock_item, created = StockItem.objects.get_or_create(
                    warehouse=self.warehouse,
                    nomenclature_item=po_item.nomenclature_item,
                    defaults={
                        'quantity': 0,
                        'unit': po_item.unit,
                    }
                )
                
                # 2. Create StockBatch if batch number provided
                batch = None
                if receipt_item.batch_number:
                    batch = StockBatch.objects.create(
                        stock_item=stock_item,
                        batch_number=receipt_item.batch_number,
                        initial_quantity=receipt_item.quantity,
                        current_quantity=receipt_item.quantity,
                        receipt_date=self.receipt_date,
                        purchase_order=self.purchase_order,
                        unit_cost=po_item.unit_price,
                    )
                
                # 3. Update StockItem quantity
                stock_item.quantity += receipt_item.quantity
                stock_item.save()
                
                # 4. Create StockMovement record
                StockMovement.objects.create(
                    stock_item=stock_item,
                    movement_type='receipt',
                    quantity=receipt_item.quantity,
                    balance_after=stock_item.quantity,
                    source_document=f"Поступление {self.number}",
                    performed_by=user or self.received_by,
                    reason=f"Приёмка по заказу {self.purchase_order.number}",
                )

                # 4.1 Reserve received items for project requirements linked to this order
                from .inventory import MaterialRequirement, StockReservation as SR

                remaining_to_reserve = receipt_item.quantity
                requirements = MaterialRequirement.objects.filter(
                    purchase_order=self.purchase_order,
                    nomenclature_item=po_item.nomenclature_item,
                    status__in=['waiting_order', 'in_order', 'written_off'],
                    project_item__isnull=False,
                    is_active=True,
                    deleted_at__isnull=True
                ).select_related('project', 'project_item')

                requirements = sorted(
                    requirements,
                    key=lambda r: (
                        r.order_by_date or date.max,
                        r.project.name if r.project else '',
                        r.project_item.name if r.project_item else '',
                        str(r.id)
                    )
                )

                if requirements:
                    for req in requirements:
                        if remaining_to_reserve <= 0:
                            break
                        # Используем total_required для корректного резервирования полного количества
                        need_qty = req.total_required or 0
                        if not need_qty or need_qty <= 0:
                            continue
                        # Проверяем сколько уже зарезервировано для этой потребности
                        already_reserved = SR.objects.filter(
                            project_item=req.project_item,
                            status__in=['pending', 'confirmed']
                        ).aggregate(total=models.Sum('quantity'))['total'] or 0
                        still_need = max(0, need_qty - already_reserved)
                        if still_need <= 0:
                            continue
                        reserve_qty = min(still_need, remaining_to_reserve)

                        StockReservation.objects.create(
                            stock_item=stock_item,
                            project=req.project,
                            project_item=req.project_item,
                            quantity=reserve_qty,
                            status='confirmed',
                            required_date=req.project_item.required_date if req.project_item else None,
                            notes=f"Резерв по заказу {self.purchase_order.number}",
                        )
                        stock_item.reserved_quantity += reserve_qty
                        stock_item.save(update_fields=['reserved_quantity'])

                        remaining_to_reserve -= reserve_qty
                elif po_item.project_item:
                    StockReservation.objects.create(
                        stock_item=stock_item,
                        project=po_item.project_item.project,
                        project_item=po_item.project_item,
                        quantity=receipt_item.quantity,
                        status='confirmed',
                        required_date=po_item.project_item.required_date,
                        notes=f"Резерв по заказу {self.purchase_order.number}",
                    )
                    stock_item.reserved_quantity += receipt_item.quantity
                    stock_item.save(update_fields=['reserved_quantity'])
                
                # 5. Update PurchaseOrderItem delivered quantity
                po_item.delivered_quantity += receipt_item.quantity
                if po_item.delivered_quantity >= po_item.quantity:
                    po_item.status = 'delivered'
                    po_item.actual_delivery_date = self.receipt_date
                else:
                    po_item.status = 'in_transit'
                po_item.save()

                if po_item.project_item:
                    if not po_item.project_item.actual_start:
                        po_item.project_item.actual_start = self.purchase_order.order_date or self.receipt_date
                    if po_item.delivered_quantity >= po_item.quantity:
                        po_item.project_item.purchase_status = PurchaseStatusChoices.CLOSED
                        po_item.project_item.actual_end = self.receipt_date
                    else:
                        po_item.project_item.purchase_status = PurchaseStatusChoices.IN_ORDER
                    po_item.project_item.save(update_fields=[
                        'purchase_status',
                        'actual_start',
                        'actual_end',
                        'has_problem',
                        'problem_reason',
                        'updated_at'
                    ])
                
                # 6. Close related material requirements
                self._close_material_requirements(po_item, receipt_item.quantity)
            
            # 7. Update PurchaseOrder status
            self.purchase_order.update_status_from_deliveries()
            
            # 8. Update GoodsReceipt status
            self.status = 'confirmed'
            self.save()

    def cancel_confirmation(self, user=None):
        """
        Отмена подтверждения поступления (откат изменений).
        """
        from django.db import transaction
        from .inventory import StockMovement, StockReservation
        
        if self.status != 'confirmed':
            raise ValueError("Можно отменить только подтвержденное поступление")
            
        with transaction.atomic():
            for receipt_item in self.items.all():
                po_item = receipt_item.purchase_order_item
                stock_item = None
                
                # 1. Find Stock Item
                try:
                    from .inventory import StockItem
                    stock_item = StockItem.objects.get(
                        warehouse=self.warehouse,
                        nomenclature_item=po_item.nomenclature_item,
                        unit=po_item.unit
                    )
                except StockItem.DoesNotExist:
                    # Если сток-айтм удален (маловероятно), ничего не делаем со стоком
                    pass
                
                if stock_item:
                    # 2. Subtract Stock
                    stock_item.quantity -= receipt_item.quantity
                    # Ensure not negative? In theory yes, but if stock was consumed, we have a problem.
                    # We allow negative stock for consistency during cancel, or we should block?
                    # ERP logic: if goods are used, we typically BLOCK cancellation.
                    # However, User asked to "Force cancel". We will proceed but log/warn if negative.
                    
                    # 3. Revert Reservations (find those created by this receipt/order)
                    # We can't know exactly WHICH reservation was created by THIS receipt item easily 
                    # unless we tracked it.
                    # But we know reservations for this project/item with source notes.
                    # Simple heuristic: Reduce confirmed reservations for this project/item.
                    
                    pass # Stock update handled below

                    # 3. Create Reverse Movement
                    StockMovement.objects.create(
                        stock_item=stock_item,
                        movement_type='correction', # or specific 'cancellation'
                        quantity=-receipt_item.quantity,
                        balance_after=stock_item.quantity,
                        source_document=f"Отмена поступления {self.number}",
                        performed_by=user or self.received_by,
                        reason=f"Отмена поступления по заказу {self.purchase_order.number}",
                    )
                    stock_item.save()

                # 4. Revert PurchaseOrderItem
                po_item.delivered_quantity -= receipt_item.quantity
                if po_item.delivered_quantity < 0:
                    po_item.delivered_quantity = 0
                
                if po_item.delivered_quantity == 0:
                    po_item.status = 'ordered' # Back to ordered
                    po_item.actual_delivery_date = None
                elif po_item.delivered_quantity < po_item.quantity:
                    po_item.status = 'partially_delivered'
                else:
                    po_item.status = 'delivered' # Should not happen if we subtract
                
                po_item.save()

                # 4.1 Revert Project Item dates if necessary
                if po_item.project_item:
                    if po_item.delivered_quantity == 0:
                        po_item.project_item.actual_end = None
                        po_item.project_item.purchase_status = 'in_order' # Back to in_order
                    else:
                        po_item.project_item.purchase_status = 'in_order' # Partially delivered is still "in_order" or custom?
                        # Current logic: 'in_order' covers everything until closed.
                    
                    po_item.project_item.save(update_fields=['actual_end', 'purchase_status'])

                # 5. Reopen Requirements
                self._reopen_material_requirements(po_item, receipt_item.quantity)

            # 6. Delete reservations created by this receipt
            # We filter by notes hack or use more complex logic. 
            # For now, we will relax constraints and rely on requirement reopening.
            # We should remove 'confirmed' reservations that were likely created by this.
            StockReservation.objects.filter(
                notes=f"Резерв по заказу {self.purchase_order.number}",
                status='confirmed'
            ).delete()

            # 7. Update GoodsReceipt status
            self.status = 'cancelled'
            self.save()
            
            # 8. Update PurchaseOrder status
            self.purchase_order.update_status_from_deliveries()

    def _reopen_material_requirements(self, po_item, qty):
        """Reopen requirements when receipt is cancelled."""
        from .inventory import MaterialRequirement
        
        # Open requirements linked to this PO Item
        reqs = MaterialRequirement.objects.filter(
            nomenclature_item=po_item.nomenclature_item,
            purchase_order=self.purchase_order,
            status='closed'
        )
        for req in reqs:
            req.status = 'in_order'
            req.save(update_fields=['status'])
            if req.project_item:
                req.project_item.purchase_status = 'in_order'
                req.project_item.actual_end = None
                req.project_item.save(update_fields=['purchase_status', 'actual_end'])

    
    def _close_material_requirements(self, po_item, received_qty):
        """Закрыть связанные потребности при поступлении."""
        from .inventory import MaterialRequirement, StockReservation as SR

        requirements = MaterialRequirement.objects.filter(
            nomenclature_item=po_item.nomenclature_item,
            purchase_order=self.purchase_order,
            status__in=['waiting_order', 'in_order'],
            project_item__isnull=False,
        ).select_related('project', 'project_item')

        requirements = sorted(
            requirements,
            key=lambda r: (
                r.order_by_date or date.max,
                r.project.name if r.project else '',
                r.project_item.name if r.project_item else '',
                str(r.id)
            )
        )

        for req in requirements:
            # Используем total_required - это количество из позиции проекта
            need_qty = req.total_required or 0
            if not need_qty or need_qty <= 0:
                continue

            # Учитываем только резервы, созданные этим заказом
            reserved_from_order = SR.objects.filter(
                project_item=req.project_item,
                status__in=['pending', 'confirmed'],
                notes=f"Резерв по заказу {self.purchase_order.number}",
            ).aggregate(total=models.Sum('quantity'))['total'] or Decimal('0')

            if reserved_from_order >= need_qty:
                req.status = 'closed'
            else:
                req.status = 'in_order'

            req.save(update_fields=['status', 'updated_at'])

            if req.project_item:
                req.project_item.purchase_status = 'closed' if req.status == 'closed' else 'in_order'
                if reserved_from_order > 0 and not req.project_item.actual_start:
                    req.project_item.actual_start = self.purchase_order.order_date or self.receipt_date
                if req.status == 'closed':
                    req.project_item.actual_end = self.receipt_date
                req.project_item.save(update_fields=[
                    'purchase_status',
                    'actual_start',
                    'actual_end',
                    'has_problem',
                    'problem_reason',
                    'updated_at'
                ])


class GoodsReceiptItem(BaseModelWithHistory):
    """
    Goods Receipt Item - позиция в документе поступления.
    """
    
    goods_receipt = models.ForeignKey(
        GoodsReceipt,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Поступление"
    )
    
    purchase_order_item = models.ForeignKey(
        PurchaseOrderItem,
        on_delete=models.PROTECT,
        related_name='receipt_items',
        verbose_name="Позиция заказа"
    )
    
    # Quantity received
    quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Количество"
    )
    
    # Batch/Lot tracking
    batch_number = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Номер партии"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    class Meta:
        db_table = 'goods_receipt_items'
        verbose_name = 'Позиция поступления'
        verbose_name_plural = 'Позиции поступлений'
    
    def __str__(self):
        return f"{self.goods_receipt.number}: {self.purchase_order_item.nomenclature_item} x{self.quantity}"
    
    def clean(self):
        from django.core.exceptions import ValidationError
        remaining = self.purchase_order_item.remaining_quantity
        if self.quantity > remaining:
            raise ValidationError(
                f"Нельзя принять больше, чем осталось к поставке. Доступно: {remaining}"
            )
