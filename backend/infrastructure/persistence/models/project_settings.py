"""
Project Settings Models.

Configurable reference tables for statuses, problem reasons, and triggers.
"""

from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from .base import BaseModelWithHistory, ActiveManager, AllObjectsManager


class StatusTypeChoices(models.TextChoices):
    """Type of status - manufacturing or purchasing."""
    MANUFACTURING = 'manufacturing', 'Изготовление'
    PURCHASING = 'purchasing', 'Закупка'


class ManufacturingStatus(BaseModelWithHistory):
    """
    Configurable manufacturing status reference.
    
    Allows defining custom statuses for manufacturing items
    with automatic triggers and ordering.
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
    
    # Color for UI display
    color = models.CharField(
        max_length=20,
        default='default',
        verbose_name="Цвет",
        help_text="Цвет для отображения: default, blue, green, orange, red, purple"
    )
    
    # Order in dropdown and workflow
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name="Порядок сортировки"
    )
    
    # Is this the default status for new items?
    is_default = models.BooleanField(
        default=False,
        verbose_name="Статус по умолчанию"
    )
    
    # Does this status mean the item is completed?
    is_completed = models.BooleanField(
        default=False,
        verbose_name="Завершающий статус",
        help_text="Означает, что позиция изготовлена"
    )
    
    # Progress percent when this status is set
    progress_percent = models.PositiveIntegerField(
        default=0,
        verbose_name="Процент готовности",
        help_text="Процент готовности при этом статусе (0-100)"
    )
    
    # Auto-transition triggers
    auto_trigger = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Триггер автоперехода",
        help_text="Условие для автоматического перехода: all_children_completed, materials_delivered, etc."
    )
    
    # System flag - cannot be deleted
    is_system = models.BooleanField(
        default=False,
        verbose_name="Системный статус",
        help_text="Системные статусы нельзя удалить"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'manufacturing_statuses'
        verbose_name = 'Статус изготовления'
        verbose_name_plural = 'Статусы изготовления'
        ordering = ['sort_order', 'name']
    
    def __str__(self):
        return self.name
    
    def clean(self):
        # Ensure only one default status
        if self.is_default:
            existing = ManufacturingStatus.objects.filter(
                is_default=True,
                is_active=True
            ).exclude(pk=self.pk)
            if existing.exists():
                raise ValidationError({
                    'is_default': 'Может быть только один статус по умолчанию'
                })
        
        # Validate progress percent
        if self.progress_percent > 100:
            raise ValidationError({
                'progress_percent': 'Процент не может быть больше 100'
            })
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class PurchaseStatus(BaseModelWithHistory):
    """
    Configurable purchase status reference.
    
    Allows defining custom statuses for purchased items
    with automatic triggers and ordering.
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
    
    # Color for UI display
    color = models.CharField(
        max_length=20,
        default='default',
        verbose_name="Цвет"
    )
    
    # Order in dropdown and workflow
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name="Порядок сортировки"
    )
    
    # Is this the default status for new items?
    is_default = models.BooleanField(
        default=False,
        verbose_name="Статус по умолчанию"
    )
    
    # Does this status mean the item is delivered?
    is_delivered = models.BooleanField(
        default=False,
        verbose_name="Статус доставки",
        help_text="Означает, что позиция получена"
    )
    
    # Does this status mean no purchase needed?
    is_not_required = models.BooleanField(
        default=False,
        verbose_name="Закупка не требуется"
    )
    
    # Progress percent when this status is set
    progress_percent = models.PositiveIntegerField(
        default=0,
        verbose_name="Процент готовности",
        help_text="Процент готовности при этом статусе (0-100)"
    )
    
    # Auto-transition triggers
    auto_trigger = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Триггер автоперехода",
        help_text="Условие для автоматического перехода"
    )
    
    # System flag
    is_system = models.BooleanField(
        default=False,
        verbose_name="Системный статус"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'purchase_statuses'
        verbose_name = 'Статус закупки'
        verbose_name_plural = 'Статусы закупок'
        ordering = ['sort_order', 'name']
    
    def __str__(self):
        return self.name
    
    def clean(self):
        if self.is_default:
            existing = PurchaseStatus.objects.filter(
                is_default=True,
                is_active=True
            ).exclude(pk=self.pk)
            if existing.exists():
                raise ValidationError({
                    'is_default': 'Может быть только один статус по умолчанию'
                })
        
        if self.progress_percent > 100:
            raise ValidationError({
                'progress_percent': 'Процент не может быть больше 100'
            })
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class ProblemTypeChoices(models.TextChoices):
    """Type of problem - manufacturing or purchasing."""
    MANUFACTURING = 'manufacturing', 'Изготовление'
    PURCHASING = 'purchasing', 'Закупка'


class ManufacturingProblemReason(BaseModelWithHistory):
    """
    Reference table for manufacturing problem reasons.
    """
    
    code = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name="Код"
    )
    name = models.CharField(
        max_length=300,
        verbose_name="Наименование"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    
    # Severity level
    severity = models.PositiveIntegerField(
        default=1,
        verbose_name="Серьёзность",
        help_text="1-низкая, 2-средняя, 3-высокая, 4-критическая"
    )
    
    # Sort order
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name="Порядок сортировки"
    )
    
    # Suggested action
    suggested_action = models.TextField(
        blank=True,
        verbose_name="Рекомендуемое действие"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'manufacturing_problem_reasons'
        verbose_name = 'Причина проблемы изготовления'
        verbose_name_plural = 'Причины проблем изготовления'
        ordering = ['sort_order', 'name']
    
    def __str__(self):
        return self.name


class PurchaseProblemReason(BaseModelWithHistory):
    """
    Reference table for purchase problem reasons.
    """
    
    code = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name="Код"
    )
    name = models.CharField(
        max_length=300,
        verbose_name="Наименование"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    
    # Severity level
    severity = models.PositiveIntegerField(
        default=1,
        verbose_name="Серьёзность"
    )
    
    # Sort order
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name="Порядок сортировки"
    )
    
    # Suggested action
    suggested_action = models.TextField(
        blank=True,
        verbose_name="Рекомендуемое действие"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'purchase_problem_reasons'
        verbose_name = 'Причина проблемы закупки'
        verbose_name_plural = 'Причины проблем закупок'
        ordering = ['sort_order', 'name']
    
    def __str__(self):
        return self.name


class ManufacturingProblemSubreason(BaseModelWithHistory):
    """Subreasons for manufacturing problem reasons."""

    reason = models.ForeignKey(
        ManufacturingProblemReason,
        on_delete=models.CASCADE,
        related_name='subreasons',
        verbose_name="Причина (изготовление)"
    )
    name = models.CharField(
        max_length=300,
        verbose_name="Наименование"
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name="Порядок сортировки"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )

    objects = ActiveManager()
    all_objects = AllObjectsManager()

    class Meta:
        db_table = 'manufacturing_problem_subreasons'
        verbose_name = 'Подпричина проблемы изготовления'
        verbose_name_plural = 'Подпричины проблем изготовления'
        ordering = ['sort_order', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['reason', 'name'],
                name='uq_manufacturing_subreason_reason_name'
            )
        ]

    def __str__(self):
        return self.name


class PurchaseProblemSubreason(BaseModelWithHistory):
    """Subreasons for purchase problem reasons."""

    reason = models.ForeignKey(
        PurchaseProblemReason,
        on_delete=models.CASCADE,
        related_name='subreasons',
        verbose_name="Причина (закупка)"
    )
    name = models.CharField(
        max_length=300,
        verbose_name="Наименование"
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name="Порядок сортировки"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )

    objects = ActiveManager()
    all_objects = AllObjectsManager()

    class Meta:
        db_table = 'purchase_problem_subreasons'
        verbose_name = 'Подпричина проблемы закупки'
        verbose_name_plural = 'Подпричины проблем закупок'
        ordering = ['sort_order', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['reason', 'name'],
                name='uq_purchase_subreason_reason_name'
            )
        ]

    def __str__(self):
        return self.name


class ProjectItemProblem(BaseModelWithHistory):
    """
    Problem record for a project item.
    
    Tracks issues, their reasons, and resolution history.
    """
    
    from .project import ProjectItem
    
    project_item = models.ForeignKey(
        'ProjectItem',
        on_delete=models.CASCADE,
        related_name='problems',
        verbose_name="Элемент проекта"
    )
    
    # Problem type determines which reason reference to use
    problem_type = models.CharField(
        max_length=20,
        choices=ProblemTypeChoices.choices,
        verbose_name="Тип проблемы"
    )
    
    # Reason from appropriate reference table
    manufacturing_reason = models.ForeignKey(
        ManufacturingProblemReason,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='problems',
        verbose_name="Причина (изготовление)"
    )
    purchase_reason = models.ForeignKey(
        PurchaseProblemReason,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='problems',
        verbose_name="Причина (закупка)"
    )
    
    # Description
    description = models.TextField(
        verbose_name="Описание проблемы"
    )
    
    # Impact
    impact_description = models.TextField(
        blank=True,
        verbose_name="Влияние на проект"
    )
    
    # Resolution
    is_resolved = models.BooleanField(
        default=False,
        verbose_name="Решена"
    )
    resolution_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Дата решения"
    )
    resolution_notes = models.TextField(
        blank=True,
        verbose_name="Комментарий к решению"
    )
    
    # Responsible
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reported_problems',
        verbose_name="Сообщил"
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_problems',
        verbose_name="Решил"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'project_item_problems'
        verbose_name = 'Проблема элемента проекта'
        verbose_name_plural = 'Проблемы элементов проекта'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.project_item.name}: {self.description[:50]}"
    
    def clean(self):
        # Validate that appropriate reason is set based on problem_type
        if self.problem_type == ProblemTypeChoices.MANUFACTURING:
            if not self.manufacturing_reason:
                raise ValidationError({
                    'manufacturing_reason': 'Укажите причину проблемы изготовления'
                })
        elif self.problem_type == ProblemTypeChoices.PURCHASING:
            if not self.purchase_reason:
                raise ValidationError({
                    'purchase_reason': 'Укажите причину проблемы закупки'
                })
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
