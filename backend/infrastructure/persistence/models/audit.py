"""
Audit ORM Models.

Models for comprehensive audit logging and history tracking.
"""

from django.db import models
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType

import uuid


class AuditLog(models.Model):
    """
    Comprehensive audit log for all system changes.
    
    Tracks who did what, when, and what changed.
    """
    
    ACTION_CHOICES = [
        ('create', 'Создание'),
        ('update', 'Изменение'),
        ('delete', 'Удаление'),
        ('soft_delete', 'Мягкое удаление'),
        ('restore', 'Восстановление'),
        ('login', 'Вход в систему'),
        ('logout', 'Выход из системы'),
        ('view', 'Просмотр'),
        ('export', 'Экспорт'),
        ('import', 'Импорт'),
    ]
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    
    # When
    timestamp = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        verbose_name="Время"
    )
    
    # Who
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        verbose_name="Пользователь"
    )
    user_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
        verbose_name="IP адрес"
    )
    user_agent = models.CharField(
        max_length=500,
        blank=True,
        verbose_name="User Agent"
    )
    
    # What action
    action = models.CharField(
        max_length=20,
        choices=ACTION_CHOICES,
        db_index=True,
        verbose_name="Действие"
    )
    
    # What object (generic foreign key)
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Тип объекта"
    )
    object_id = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        verbose_name="ID объекта"
    )
    content_object = GenericForeignKey('content_type', 'object_id')
    
    # Object representation at time of action
    object_repr = models.CharField(
        max_length=500,
        blank=True,
        verbose_name="Представление объекта"
    )
    
    # What changed (JSON)
    changes = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Изменения"
    )
    
    # Additional context
    extra_data = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Дополнительные данные"
    )
    
    class Meta:
        db_table = 'audit_log'
        verbose_name = 'Журнал аудита'
        verbose_name_plural = 'Журнал аудита'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['user', 'timestamp']),
            models.Index(fields=['action', 'timestamp']),
        ]
    
    def __str__(self):
        return f"{self.timestamp}: {self.user} - {self.get_action_display()} {self.object_repr}"


class ProgressSnapshot(models.Model):
    """
    Daily snapshot of project progress for historical tracking.
    
    Used for generating progress over time charts.
    """
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    
    # What project/item
    project = models.ForeignKey(
        'persistence.Project',
        on_delete=models.CASCADE,
        related_name='progress_snapshots',
        verbose_name="Проект"
    )
    project_item = models.ForeignKey(
        'persistence.ProjectItem',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='progress_snapshots',
        verbose_name="Элемент проекта"
    )
    
    # When
    snapshot_date = models.DateField(
        db_index=True,
        verbose_name="Дата снимка"
    )
    
    # Progress values
    progress_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        verbose_name="Процент выполнения"
    )
    planned_progress_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Плановый процент"
    )
    
    # Counts at this point
    total_items = models.PositiveIntegerField(
        default=0,
        verbose_name="Всего элементов"
    )
    completed_items = models.PositiveIntegerField(
        default=0,
        verbose_name="Завершено элементов"
    )
    problematic_items = models.PositiveIntegerField(
        default=0,
        verbose_name="Проблемных элементов"
    )
    
    # Metadata
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата создания"
    )
    
    class Meta:
        db_table = 'progress_snapshots'
        verbose_name = 'Снимок прогресса'
        verbose_name_plural = 'Снимки прогресса'
        unique_together = [['project', 'project_item', 'snapshot_date']]
        ordering = ['-snapshot_date']
        indexes = [
            models.Index(fields=['project', 'snapshot_date']),
        ]
    
    def __str__(self):
        item = self.project_item.name if self.project_item else "весь проект"
        project_name = getattr(self.project, 'name', None)
        return f"{project_name} ({item}): {self.progress_percent}% @ {self.snapshot_date}"


class SystemSetting(models.Model):
    """
    System-wide settings stored in database.
    """
    
    key = models.CharField(
        max_length=100,
        unique=True,
        verbose_name="Ключ"
    )
    value = models.JSONField(
        default=dict,
        verbose_name="Значение"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    
    # Metadata
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="Дата обновления"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Обновлено пользователем"
    )
    
    class Meta:
        db_table = 'system_settings'
        verbose_name = 'Системная настройка'
        verbose_name_plural = 'Системные настройки'
        ordering = ['key']
    
    def __str__(self):
        return self.key
