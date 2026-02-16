"""
Base ORM Models and Mixins.

Provides common functionality for all models:
- UUID primary keys
- Timestamps (created_at, updated_at)
- Soft delete
- Version control
- Audit tracking
"""

import uuid
from django.db import models
from django.conf import settings
from simple_history.models import HistoricalRecords


class TimeStampedMixin(models.Model):
    """Mixin for created_at and updated_at timestamps."""
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата создания"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="Дата обновления"
    )
    
    class Meta:
        abstract = True


class SoftDeleteMixin(models.Model):
    """Mixin for soft delete functionality."""
    
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Дата удаления"
    )
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_deleted",
        verbose_name="Удалено пользователем"
    )
    
    class Meta:
        abstract = True
    
    @property
    def is_deleted(self):
        return self.deleted_at is not None
    
    def soft_delete(self, user=None):
        from django.utils import timezone
        self.deleted_at = timezone.now()
        self.deleted_by = user
        self.save(update_fields=['deleted_at', 'deleted_by', 'updated_at'])
    
    def restore(self):
        self.deleted_at = None
        self.deleted_by = None
        self.save(update_fields=['deleted_at', 'deleted_by', 'updated_at'])


class VersionedMixin(models.Model):
    """Mixin for optimistic locking with version control."""
    
    version = models.PositiveIntegerField(
        default=1,
        verbose_name="Версия"
    )
    
    class Meta:
        abstract = True
    
    def save(self, *args, **kwargs):
        if self.pk:
            self.version += 1
        super().save(*args, **kwargs)


class AuditMixin(models.Model):
    """Mixin for tracking who created/modified records."""
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_created",
        verbose_name="Создано пользователем"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_updated",
        verbose_name="Обновлено пользователем"
    )
    
    class Meta:
        abstract = True


class BaseModel(TimeStampedMixin, SoftDeleteMixin, VersionedMixin, AuditMixin):
    """
    Base model with all common functionality.
    
    Includes:
    - UUID primary key
    - Timestamps (created_at, updated_at)
    - Soft delete (deleted_at, deleted_by)
    - Version control (version)
    - Audit (created_by, updated_by)
    - Active flag (is_active)
    """
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        verbose_name="ID"
    )
    
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        verbose_name="Активен"
    )
    
    class Meta:
        abstract = True
    
    def __str__(self):
        return str(self.id)


class BaseModelWithHistory(BaseModel):
    """
    Base model with historical records tracking.
    
    Uses django-simple-history to track all changes.
    """
    
    history = HistoricalRecords(inherit=True)
    
    class Meta:
        abstract = True


# =============================================================================
# MANAGER FOR SOFT DELETE
# =============================================================================

class ActiveManager(models.Manager):
    """Manager that excludes soft-deleted records by default."""
    
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class AllObjectsManager(models.Manager):
    """Manager that includes all records, including soft-deleted."""
    
    pass
