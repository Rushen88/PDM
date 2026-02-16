"""
Production ORM Models.

Models for production tracking and manufacturing orders.
"""

from django.db import models
from django.conf import settings

from .base import BaseModelWithHistory, ActiveManager, AllObjectsManager
from .catalog import NomenclatureItem, Contractor, DelayReason
from .project import Project, ProjectItem, ManufacturingStatusChoices, ManufacturerTypeChoices, MaterialSupplyTypeChoices


class ProductionOrder(BaseModelWithHistory):
    """
    Production Order - order to manufacture items.
    """
    
    STATUS_CHOICES = [
        ('draft', 'Черновик'),
        ('planned', 'Запланирован'),
        ('in_progress', 'В работе'),
        ('completed', 'Завершён'),
        ('cancelled', 'Отменён'),
    ]
    
    # Identification
    number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name="Номер заказа"
    )
    
    # Project reference
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='production_orders',
        verbose_name="Проект"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
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
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'production_orders'
        verbose_name = 'Производственный заказ'
        verbose_name_plural = 'Производственные заказы'
        ordering = ['-created_at']
    
    def __str__(self):
        project_name = getattr(self.project, 'name', None)
        return f"ПЗ {self.number} - {project_name}"


class ProductionTask(BaseModelWithHistory):
    """
    Production Task - task to manufacture a specific item.
    """
    
    order = models.ForeignKey(
        ProductionOrder,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='tasks',
        verbose_name="Производственный заказ"
    )
    
    # Project item reference
    project_item = models.ForeignKey(
        ProjectItem,
        on_delete=models.CASCADE,
        related_name='production_tasks',
        verbose_name="Элемент проекта"
    )
    nomenclature_item = models.ForeignKey(
        NomenclatureItem,
        on_delete=models.PROTECT,
        related_name='production_tasks',
        verbose_name="Номенклатура"
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
    completed_quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        default=0,
        verbose_name="Изготовлено"
    )
    
    # Status
    status = models.CharField(
        max_length=30,
        choices=ManufacturingStatusChoices.choices,
        default=ManufacturingStatusChoices.NOT_STARTED,
        db_index=True,
        verbose_name="Статус"
    )
    
    # Manufacturer
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
        related_name='production_tasks',
        verbose_name="Подрядчик"
    )
    material_supply_type = models.CharField(
        max_length=30,
        choices=MaterialSupplyTypeChoices.choices,
        default=MaterialSupplyTypeChoices.OUR_SUPPLY,
        verbose_name="Снабжение материалами"
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
    
    # Responsible
    responsible = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='production_tasks',
        verbose_name="Ответственный"
    )
    
    # Delay tracking
    delay_reason = models.ForeignKey(
        DelayReason,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='production_tasks',
        verbose_name="Причина задержки"
    )
    delay_notes = models.TextField(
        blank=True,
        verbose_name="Комментарий к задержке"
    )
    
    # Progress
    progress_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        verbose_name="Процент выполнения"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'production_tasks'
        verbose_name = 'Производственная задача'
        verbose_name_plural = 'Производственные задачи'
        ordering = ['order', 'id']
    
    def __str__(self):
        return f"Задача: {self.nomenclature_item} x{self.quantity}"
    
    @property
    def is_completed(self):
        return self.status == ManufacturingStatusChoices.COMPLETED
    
    @property
    def is_overdue(self):
        if self.is_completed:
            return False
        from datetime import date
        if self.planned_end:
            return date.today() > self.planned_end
        return False


class ProductionProgress(BaseModelWithHistory):
    """
    Progress log entry for a production task.
    """
    
    task = models.ForeignKey(
        ProductionTask,
        on_delete=models.CASCADE,
        related_name='progress_entries',
        verbose_name="Задача"
    )
    
    # Progress
    completed_quantity = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        verbose_name="Изготовлено"
    )
    progress_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        verbose_name="Процент выполнения"
    )
    
    # Status at this point
    status = models.CharField(
        max_length=30,
        choices=ManufacturingStatusChoices.choices,
        verbose_name="Статус"
    )
    
    # Who reported
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='production_progress_reports',
        verbose_name="Отчёт от"
    )
    reported_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата отчёта"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    class Meta:
        db_table = 'production_progress'
        verbose_name = 'Прогресс производства'
        verbose_name_plural = 'Прогресс производства'
        ordering = ['-reported_at']
    
    def __str__(self):
        return f"{self.task}: {self.progress_percent}% ({self.reported_at})"
