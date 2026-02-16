"""
User Models.

Custom user model and related models for authentication and authorization.
"""

from django.db import models
from django.contrib.auth.models import AbstractUser, Permission, Group
from django.contrib.auth.validators import UnicodeUsernameValidator

from .base import BaseModel, TimeStampedMixin

import uuid


class User(AbstractUser):
    """
    Custom User model.
    
    Extends Django's AbstractUser with additional fields
    for enterprise ERP functionality.
    """
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    
    username_validator = UnicodeUsernameValidator()
    
    username = models.CharField(
        max_length=150,
        unique=True,
        validators=[username_validator],
        verbose_name="Логин"
    )
    email = models.EmailField(
        unique=True,
        verbose_name="Email"
    )
    
    # Personal info
    first_name = models.CharField(
        max_length=150,
        blank=True,
        verbose_name="Имя"
    )
    last_name = models.CharField(
        max_length=150,
        blank=True,
        verbose_name="Фамилия"
    )
    middle_name = models.CharField(
        max_length=150,
        blank=True,
        verbose_name="Отчество"
    )
    
    # Contact info
    phone = models.CharField(
        max_length=20,
        blank=True,
        verbose_name="Телефон"
    )
    
    # Work info
    position = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="Должность"
    )
    department = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="Отдел"
    )
    
    # Settings
    timezone = models.CharField(
        max_length=50,
        default='Europe/Moscow',
        verbose_name="Часовой пояс"
    )
    language = models.CharField(
        max_length=10,
        default='ru',
        verbose_name="Язык"
    )
    
    # Metadata
    last_activity = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Последняя активность"
    )
    
    class Meta:
        db_table = 'users'
        verbose_name = 'Пользователь'
        verbose_name_plural = 'Пользователи'
        ordering = ['last_name', 'first_name']
    
    def __str__(self):
        return self.get_full_name() or self.username
    
    def get_full_name(self):
        """Return full name including middle name."""
        parts = [self.last_name, self.first_name, self.middle_name]
        return ' '.join(p for p in parts if p)
    
    def get_short_name(self):
        """Return first name."""
        return self.first_name or self.username


class Role(TimeStampedMixin, models.Model):
    """
    Custom Role model for application-specific roles.
    
    Works alongside Django's built-in Group/Permission system.
    """
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    
    name = models.CharField(
        max_length=100,
        unique=True,
        verbose_name="Название роли"
    )
    code = models.CharField(
        max_length=50,
        unique=True,
        verbose_name="Код роли"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    
    # Link to Django Group for permissions
    group = models.OneToOneField(
        Group,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='role',
        verbose_name="Группа Django"
    )
    
    # Role hierarchy
    parent_role = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='child_roles',
        verbose_name="Родительская роль"
    )
    
    # Flags
    is_system_role = models.BooleanField(
        default=False,
        verbose_name="Системная роль"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )
    
    # Production responsibility capability
    can_be_production_responsible = models.BooleanField(
        default=False,
        verbose_name="Может быть ответственным по производству",
        help_text="Пользователи с этой ролью отображаются в списке ответственных при назначении на позиции проекта"
    )
    
    # Project visibility and access scope
    PROJECT_SCOPE_OWN = 'own'
    PROJECT_SCOPE_CHILDREN_NAME_ONLY = 'own_children_name_only'
    PROJECT_SCOPE_CHILDREN_VIEW = 'own_children_view'
    PROJECT_SCOPE_CHILDREN_EDIT = 'own_children_edit'
    PROJECT_SCOPE_ALL = 'all'
    PROJECT_SCOPE_CHOICES = [
        (PROJECT_SCOPE_OWN, 'Только свои позиции'),
        (PROJECT_SCOPE_CHILDREN_NAME_ONLY, 'Свои позиции + дочерние (только наименования)'),
        (PROJECT_SCOPE_CHILDREN_VIEW, 'Свои позиции + дочерние (просмотр)'),
        (PROJECT_SCOPE_CHILDREN_EDIT, 'Свои позиции + дочерние (редактирование)'),
        (PROJECT_SCOPE_ALL, 'Все проекты (полный доступ)'),
    ]
    
    project_access_scope = models.CharField(
        max_length=30,
        choices=PROJECT_SCOPE_CHOICES,
        default=PROJECT_SCOPE_ALL,
        verbose_name="Область видимости и доступ",
        help_text="Определяет видимость и доступ к проектам и позициям в иерархии"
    )
    
    # Inventory responsibility capability
    can_be_inventory_responsible = models.BooleanField(
        default=False,
        verbose_name="Может быть ответственным по инвентаризации",
        help_text="Пользователь отображается в списке ответственных для инвентаризации склада"
    )
    
    # Legacy visibility settings - kept for backwards compatibility
    VISIBILITY_OWN = 'own'
    VISIBILITY_OWN_AND_CHILDREN = 'own_and_children'
    VISIBILITY_ALL = 'all'
    VISIBILITY_CHOICES = [
        (VISIBILITY_OWN, 'Видит только свои позиции'),
        (VISIBILITY_OWN_AND_CHILDREN, 'Видит свои и дочерние позиции'),
        (VISIBILITY_ALL, 'Видит все позиции'),
    ]
    
    visibility_type = models.CharField(
        max_length=20,
        choices=VISIBILITY_CHOICES,
        default=VISIBILITY_ALL,
        verbose_name="Права видимости объектов (устар.)",
        help_text="Устаревшее поле - используйте project_access_scope"
    )
    
    # Legacy child access - kept for backwards compatibility
    CHILD_ACCESS_NAME_ONLY = 'name_only'
    CHILD_ACCESS_VIEW = 'view'
    CHILD_ACCESS_EDIT = 'edit'
    CHILD_ACCESS_CHOICES = [
        (CHILD_ACCESS_NAME_ONLY, 'Только наименование'),
        (CHILD_ACCESS_VIEW, 'Просмотр'),
        (CHILD_ACCESS_EDIT, 'Редактирование'),
    ]
    
    child_structure_access = models.CharField(
        max_length=20,
        choices=CHILD_ACCESS_CHOICES,
        default=CHILD_ACCESS_NAME_ONLY,
        verbose_name="Доступ к дочерним структурам (устар.)",
        help_text="Устаревшее поле - используйте project_access_scope"
    )
    
    # Legacy fields - kept for backwards compatibility
    can_be_responsible = models.BooleanField(
        default=False,
        verbose_name="Может быть ответственным (устар.)",
        help_text="Устаревшее поле - используйте can_be_production_responsible"
    )
    see_only_own_items = models.BooleanField(
        default=False,
        verbose_name="Видит только свои позиции (устар.)",
        help_text="Устаревшее поле - используйте visibility_type"
    )
    see_child_structures = models.BooleanField(
        default=False,
        verbose_name="Видит дочерние структуры (устар.)",
        help_text="Устаревшее поле - используйте visibility_type"
    )
    
    class Meta:
        db_table = 'roles'
        verbose_name = 'Роль'
        verbose_name_plural = 'Роли'
        ordering = ['name']
    
    def __str__(self):
        return self.name


class UserRole(TimeStampedMixin, models.Model):
    """
    User-Role assignment with context.
    
    Allows assigning roles in a specific context (e.g., role on a project).
    """
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='user_roles',
        verbose_name="Пользователь"
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name='user_roles',
        verbose_name="Роль"
    )
    
    # Context - if null, role is global
    # If set, role applies only to the specified project
    project_id = models.UUIDField(
        null=True,
        blank=True,
        db_index=True,
        verbose_name="ID проекта"
    )
    
    # Validity period
    valid_from = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Действует с"
    )
    valid_until = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Действует до"
    )
    
    # Flags
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )
    
    # Audit
    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='role_assignments_made',
        verbose_name="Назначено пользователем"
    )
    
    class Meta:
        db_table = 'user_roles'
        verbose_name = 'Назначение роли'
        verbose_name_plural = 'Назначения ролей'
        unique_together = [['user', 'role', 'project_id']]
    
    def __str__(self):
        context = f" (проект: {self.project_id})" if self.project_id else " (глобально)"
        return f"{self.user} - {self.role}{context}"


class ModuleAccessChoices(models.TextChoices):
    """Choices for module access level."""
    NONE = 'none', 'Нет доступа'
    VIEW = 'view', 'Только просмотр'
    EDIT = 'edit', 'Редактирование'
    FULL = 'full', 'Полный доступ'


class SystemModule(TimeStampedMixin, models.Model):
    """
    System Module - represents a functional block of the system.
    Used for granular access control.
    """
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    
    code = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name="Код модуля"
    )
    name = models.CharField(
        max_length=200,
        verbose_name="Название"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    
    # Parent module for hierarchy (e.g., projects -> project.structure)
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        verbose_name="Родительский модуль"
    )
    
    # Order for display
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name="Порядок"
    )
    
    # Icon for UI
    icon = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Иконка"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    class Meta:
        db_table = 'system_modules'
        verbose_name = 'Модуль системы'
        verbose_name_plural = 'Модули системы'
        ordering = ['sort_order', 'name']
    
    def __str__(self):
        return self.name


class UserModuleAccess(TimeStampedMixin, models.Model):
    """
    User access to a specific system module.
    Defines what level of access a user has to each module.
    """
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='module_access',
        verbose_name="Пользователь"
    )
    module = models.ForeignKey(
        SystemModule,
        on_delete=models.CASCADE,
        related_name='user_access',
        verbose_name="Модуль"
    )
    
    # Access level
    access_level = models.CharField(
        max_length=20,
        choices=ModuleAccessChoices.choices,
        default=ModuleAccessChoices.VIEW,
        verbose_name="Уровень доступа"
    )
    
    # Can be limited to specific projects
    project_id = models.UUIDField(
        null=True,
        blank=True,
        db_index=True,
        verbose_name="ID проекта (если ограничено)"
    )
    
    class Meta:
        db_table = 'user_module_access'
        verbose_name = 'Доступ к модулю'
        verbose_name_plural = 'Доступы к модулям'
        unique_together = [['user', 'module', 'project_id']]
    
    def __str__(self):
        return f"{self.user} -> {self.module}: {self.access_level}"


class RoleModuleAccess(TimeStampedMixin, models.Model):
    """
    Role-based default access to modules.
    When a user is assigned a role, they get these default module accesses.
    """
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name='module_access',
        verbose_name="Роль"
    )
    module = models.ForeignKey(
        SystemModule,
        on_delete=models.CASCADE,
        related_name='role_access',
        verbose_name="Модуль"
    )
    
    # Default access level for this role
    access_level = models.CharField(
        max_length=20,
        choices=ModuleAccessChoices.choices,
        default=ModuleAccessChoices.VIEW,
        verbose_name="Уровень доступа"
    )
    
    class Meta:
        db_table = 'role_module_access'
        verbose_name = 'Доступ роли к модулю'
        verbose_name_plural = 'Доступы ролей к модулям'
        unique_together = [['role', 'module']]
    
    def __str__(self):
        return f"{self.role} -> {self.module}: {self.access_level}"