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
        parser.add_argument(
            '--skip-units',
            action='store_true',
            help='Skip creating default units'
        )
    
    def handle(self, *args, **options):
        with transaction.atomic():
            if not options['skip_roles']:
                self._create_default_roles()
            
            if not options['skip_admin']:
                self._create_admin_user(options['admin_password'])
            
            if not options['skip_units']:
                self._create_default_units()
            
            self._create_system_settings()
        
        self.stdout.write(
            self.style.SUCCESS('System initialization completed!')
        )
    
    def _create_default_roles(self):
        """Create default system roles."""
        from infrastructure.persistence.models import Role, RolePermission
        
        roles_config = [
            {
                'code': 'admin',
                'name': 'Администратор',
                'description': 'Полный доступ ко всем функциям системы',
                'is_system': True,
                'permissions': [
                    # Full access to all resources
                    {'resource': '*', 'action': '*'},
                ]
            },
            {
                'code': 'project_manager',
                'name': 'Руководитель проекта',
                'description': 'Управление проектами и назначение исполнителей',
                'is_system': True,
                'permissions': [
                    {'resource': 'project', 'action': '*'},
                    {'resource': 'bom', 'action': 'view'},
                    {'resource': 'bom', 'action': 'create'},
                    {'resource': 'nomenclature', 'action': 'view'},
                    {'resource': 'supplier', 'action': 'view'},
                    {'resource': 'contractor', 'action': 'view'},
                    {'resource': 'report', 'action': '*'},
                ]
            },
            {
                'code': 'engineer',
                'name': 'Инженер-конструктор',
                'description': 'Создание и редактирование BOM',
                'is_system': True,
                'permissions': [
                    {'resource': 'bom', 'action': '*'},
                    {'resource': 'nomenclature', 'action': '*'},
                    {'resource': 'project', 'action': 'view'},
                    {'resource': 'project', 'action': 'update_progress'},
                ]
            },
            {
                'code': 'procurement',
                'name': 'Специалист по закупкам',
                'description': 'Управление закупками и поставщиками',
                'is_system': True,
                'permissions': [
                    {'resource': 'procurement', 'action': '*'},
                    {'resource': 'supplier', 'action': '*'},
                    {'resource': 'nomenclature', 'action': 'view'},
                    {'resource': 'project', 'action': 'view'},
                    {'resource': 'inventory', 'action': 'view'},
                ]
            },
            {
                'code': 'production',
                'name': 'Производственный отдел',
                'description': 'Управление производственными заданиями',
                'is_system': True,
                'permissions': [
                    {'resource': 'production', 'action': '*'},
                    {'resource': 'contractor', 'action': '*'},
                    {'resource': 'nomenclature', 'action': 'view'},
                    {'resource': 'project', 'action': 'view'},
                    {'resource': 'project', 'action': 'update_progress'},
                    {'resource': 'bom', 'action': 'view'},
                ]
            },
            {
                'code': 'warehouse',
                'name': 'Складской учет',
                'description': 'Управление складом и запасами',
                'is_system': True,
                'permissions': [
                    {'resource': 'inventory', 'action': '*'},
                    {'resource': 'nomenclature', 'action': 'view'},
                    {'resource': 'project', 'action': 'view'},
                ]
            },
            {
                'code': 'viewer',
                'name': 'Просмотр',
                'description': 'Только просмотр информации',
                'is_system': True,
                'permissions': [
                    {'resource': 'project', 'action': 'view'},
                    {'resource': 'bom', 'action': 'view'},
                    {'resource': 'nomenclature', 'action': 'view'},
                    {'resource': 'report', 'action': 'view'},
                ]
            },
        ]
        
        for role_config in roles_config:
            permissions = role_config.pop('permissions')
            
            role, created = Role.objects.update_or_create(
                code=role_config['code'],
                defaults=role_config
            )
            
            if created:
                self.stdout.write(f'Created role: {role.name}')
                
                # Create permissions
                for perm in permissions:
                    RolePermission.objects.create(
                        role=role,
                        resource=perm['resource'],
                        action=perm['action'],
                    )
            else:
                self.stdout.write(f'Role already exists: {role.name}')
    
    def _create_admin_user(self, password):
        """Create admin user if not exists."""
        from django.contrib.auth import get_user_model
        from infrastructure.persistence.models import Role
        
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
            
            # Assign admin role
            admin_role = Role.objects.filter(code='admin').first()
            if admin_role:
                admin_user.roles.add(admin_role)
            
            self.stdout.write(
                self.style.SUCCESS(f'Created admin user (password: {password})')
            )
        else:
            self.stdout.write('Admin user already exists')
    
    def _create_default_units(self):
        """Create default units of measurement."""
        from infrastructure.persistence.models import Unit
        
        units = [
            {'code': 'pcs', 'name': 'Штука', 'short_name': 'шт'},
            {'code': 'kg', 'name': 'Килограмм', 'short_name': 'кг'},
            {'code': 'g', 'name': 'Грамм', 'short_name': 'г'},
            {'code': 'm', 'name': 'Метр', 'short_name': 'м'},
            {'code': 'mm', 'name': 'Миллиметр', 'short_name': 'мм'},
            {'code': 'cm', 'name': 'Сантиметр', 'short_name': 'см'},
            {'code': 'l', 'name': 'Литр', 'short_name': 'л'},
            {'code': 'ml', 'name': 'Миллилитр', 'short_name': 'мл'},
            {'code': 'm2', 'name': 'Квадратный метр', 'short_name': 'м²'},
            {'code': 'm3', 'name': 'Кубический метр', 'short_name': 'м³'},
            {'code': 'set', 'name': 'Комплект', 'short_name': 'компл'},
            {'code': 'pair', 'name': 'Пара', 'short_name': 'пар'},
        ]
        
        for unit_data in units:
            unit, created = Unit.objects.get_or_create(
                code=unit_data['code'],
                defaults=unit_data
            )
            if created:
                self.stdout.write(f'Created unit: {unit.name}')
    
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
            {
                'key': 'nomenclature.categories',
                'value': {
                    'categories': [
                        'material', 'standard_product', 'other_product',
                        'part', 'assembly_unit', 'subsystem', 'system', 'stand'
                    ]
                },
                'description': 'Список категорий номенклатуры'
            },
        ]
        
        for setting_data in settings:
            setting, created = SystemSetting.objects.get_or_create(
                key=setting_data['key'],
                defaults=setting_data
            )
            if created:
                self.stdout.write(f'Created setting: {setting.key}')
