"""
Initialize System Command.

Creates default roles, admin user, and system settings.
"""

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Initialize system with default data (roles, admin user, settings)'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--admin-password',
            type=str,
            default='admin123',
            help='Password for admin user'
        )
        parser.add_argument(
            '--skip-roles',
            action='store_true',
            help='Skip creating default roles'
        )
        parser.add_argument(
            '--skip-admin',
            action='store_true',
            help='Skip creating admin user'
        )
    
    def handle(self, *args, **options):
        with transaction.atomic():
            if not options['skip_roles']:
                self._create_default_roles()
            
            if not options['skip_admin']:
                self._create_admin_user(options['admin_password'])
            
            self._create_system_settings()
            self._create_problem_reasons()
        
        self.stdout.write(
            self.style.SUCCESS('System initialization completed!')
        )
    
    def _create_default_roles(self):
        """Create default system roles."""
        from infrastructure.persistence.models import Role
        
        roles_config = [
            {
                'code': 'admin',
                'name': 'Администратор',
                'description': 'Полный доступ ко всем функциям системы',
                'is_system_role': True,
            },
            {
                'code': 'project_manager',
                'name': 'Руководитель проекта',
                'description': 'Управление проектами и назначение исполнителей',
                'is_system_role': True,
            },
            {
                'code': 'engineer',
                'name': 'Инженер-конструктор',
                'description': 'Создание и редактирование BOM',
                'is_system_role': True,
            },
            {
                'code': 'procurement',
                'name': 'Специалист по закупкам',
                'description': 'Управление закупками и поставщиками',
                'is_system_role': True,
            },
            {
                'code': 'production',
                'name': 'Производственный отдел',
                'description': 'Управление производственными заданиями',
                'is_system_role': True,
            },
            {
                'code': 'warehouse',
                'name': 'Складской учет',
                'description': 'Управление складом и запасами',
                'is_system_role': True,
            },
            {
                'code': 'viewer',
                'name': 'Просмотр',
                'description': 'Только просмотр информации',
                'is_system_role': True,
            },
        ]
        
        for role_config in roles_config:
            role, created = Role.objects.update_or_create(
                code=role_config['code'],
                defaults=role_config
            )
            
            if created:
                self.stdout.write(f'Created role: {role.name}')
            else:
                self.stdout.write(f'Role already exists: {role.name}')
    
    def _create_admin_user(self, password):
        """Create admin user if not exists."""
        from django.contrib.auth import get_user_model
        
        User = get_user_model()
        
        admin_user, created = User.objects.get_or_create(
            username='admin',
            defaults={
                'email': 'admin@example.com',
                'first_name': 'Администратор',
                'last_name': 'Системы',
                'is_staff': True,
                'is_superuser': True,
            }
        )
        
        if created:
            admin_user.set_password(password)
            admin_user.save()
            
            self.stdout.write(
                self.style.SUCCESS(f'Created admin user (password: {password})')
            )
        else:
            self.stdout.write('Admin user already exists')
    
    def _create_system_settings(self):
        """Create default system settings."""
        from infrastructure.persistence.models import SystemSetting
        
        settings = [
            {
                'key': 'project.default_status',
                'value': {'status': 'planning'},
                'description': 'Статус проекта по умолчанию'
            },
            {
                'key': 'project.deadline_warning_days',
                'value': {'days': 7},
                'description': 'За сколько дней предупреждать о дедлайне'
            },
            {
                'key': 'bom.require_approval',
                'value': {'enabled': True},
                'description': 'Требовать утверждение BOM'
            },
            {
                'key': 'notification.email_enabled',
                'value': {'enabled': True},
                'description': 'Отправлять email уведомления'
            },
        ]
        
        for setting_data in settings:
            setting, created = SystemSetting.objects.get_or_create(
                key=setting_data['key'],
                defaults=setting_data
            )
            if created:
                self.stdout.write(f'Created setting: {setting.key}')
    
    def _create_problem_reasons(self):
        """Create system problem reasons for material requirements."""
        from infrastructure.persistence.models import ProblemReason
        
        reasons = [
            {
                'code': 'not_ordered_on_time',
                'name': 'Не заказано вовремя',
                'description': 'Дата "заказать до" прошла, а заказ не размещён',
                'is_system': True,
            },
            {
                'code': 'ordered_late',
                'name': 'Заказано с просрочкой',
                'description': 'Заказ создан после даты "Заказать до".',
                'is_system': True,
            },
            {
                'code': 'delivery_delay',
                'name': 'Задержка поставки',
                'description': 'Срок поставки прошёл, а товар не получен',
                'is_system': True,
            },
            {
                'code': 'supplier_rejection',
                'name': 'Отказ поставщика',
                'description': 'Поставщик отказал в поставке',
                'is_system': False,
            },
            {
                'code': 'quality_issue',
                'name': 'Проблема качества',
                'description': 'Брак при приёмке',
                'is_system': False,
            },
            {
                'code': 'partial_delivery',
                'name': 'Неполная поставка',
                'description': 'Получено меньше, чем заказано',
                'is_system': False,
            },
            {
                'code': 'price_change',
                'name': 'Изменение цены',
                'description': 'Существенное изменение цены от поставщика',
                'is_system': False,
            },
            {
                'code': 'other',
                'name': 'Другое',
                'description': 'Иная причина (указать в комментарии)',
                'is_system': False,
            },
        ]
        
        for reason_data in reasons:
            reason, created = ProblemReason.objects.get_or_create(
                code=reason_data['code'],
                defaults=reason_data
            )
            if created:
                self.stdout.write(f'Created problem reason: {reason.name}')
