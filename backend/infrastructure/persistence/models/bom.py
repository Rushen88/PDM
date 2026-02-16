"""
BOM (Bill of Materials) ORM Models.

Models for product structure - the hierarchical tree of components.
"""

from django.db import models

from .base import BaseModelWithHistory, ActiveManager, AllObjectsManager
from .catalog import NomenclatureItem, NomenclatureCategoryChoices


class BOMStructure(BaseModelWithHistory):
    """
    Bill of Materials structure - defines what components make up a product.
    
    CRITICAL: Each nomenclature item can have AT MOST ONE active BOM structure.
    The constraint is enforced through unique_together with is_active flag.
    """
    
    # Root item (the product being defined)
    # UNIQUE: One nomenclature item = One BOM (enforced via Meta constraint)
    root_item = models.ForeignKey(
        NomenclatureItem,
        on_delete=models.CASCADE,
        related_name='bom_structures',
        verbose_name="Корневое изделие"
    )
    root_category = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Категория корневого изделия (код вида справочника)"
    )
    
    # Identification
    name = models.CharField(
        max_length=300,
        verbose_name="Наименование"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    
    # Version control
    current_version = models.PositiveIntegerField(
        default=1,
        verbose_name="Текущая версия"
    )
    
    # Flags
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )
    is_locked = models.BooleanField(
        default=False,
        verbose_name="Заблокирована"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'bom_structures'
        verbose_name = 'Структура изделия (BOM)'
        verbose_name_plural = 'Структуры изделий (BOM)'
        ordering = ['name']
        # CRITICAL: Ensure only ONE active BOM per nomenclature item
        constraints = [
            models.UniqueConstraint(
                fields=['root_item'],
                condition=models.Q(is_active=True),
                name='unique_active_bom_per_nomenclature'
            )
        ]
    
    def __str__(self):
        return f"{self.name} v{self.current_version}"


class BOMItem(BaseModelWithHistory):
    """
    Single item in a BOM structure.
    
    Represents the parent-child relationship with quantity.
    """
    
    bom = models.ForeignKey(
        BOMStructure,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name="Структура"
    )
    
    # Parent item (null for root)
    parent_item = models.ForeignKey(
        NomenclatureItem,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='bom_children',
        verbose_name="Родительский элемент"
    )
    
    # Child item
    child_item = models.ForeignKey(
        NomenclatureItem,
        on_delete=models.CASCADE,
        related_name='bom_parents',
        verbose_name="Дочерний элемент"
    )
    child_category = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Категория дочернего элемента (код вида справочника)"
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
    
    # Position in parent
    position = models.PositiveIntegerField(
        default=0,
        verbose_name="Позиция"
    )
    
    # Optional overrides
    drawing_number_override = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Переопределённый номер чертежа"
    )
    
    # Notes
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'bom_items'
        verbose_name = 'Элемент структуры'
        verbose_name_plural = 'Элементы структуры'
        ordering = ['bom', 'parent_item', 'position']
        indexes = [
            models.Index(fields=['bom', 'parent_item']),
            models.Index(fields=['child_item']),
        ]
    
    def __str__(self):
        parent = self.parent_item.code if self.parent_item else "ROOT"
        return f"{parent} → {self.child_item.code} x{self.quantity}"


class BOMVersion(BaseModelWithHistory):
    """
    Version snapshot of a BOM structure.
    
    Stores historical versions for audit and rollback.
    """
    
    bom = models.ForeignKey(
        BOMStructure,
        on_delete=models.CASCADE,
        related_name='versions',
        verbose_name="Структура"
    )
    
    version_number = models.PositiveIntegerField(
        verbose_name="Номер версии"
    )
    reason = models.CharField(
        max_length=500,
        blank=True,
        verbose_name="Причина создания версии"
    )
    
    # Snapshot of structure at this version (JSON)
    snapshot = models.JSONField(
        default=dict,
        verbose_name="Снимок структуры"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )
    
    class Meta:
        db_table = 'bom_versions'
        verbose_name = 'Версия структуры'
        verbose_name_plural = 'Версии структур'
        unique_together = [['bom', 'version_number']]
        ordering = ['bom', '-version_number']
    
    def __str__(self):
        return f"{self.bom.name} v{self.version_number}"
