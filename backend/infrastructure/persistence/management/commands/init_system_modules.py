"""
Initialize System Modules Command.

Creates default system modules according to the ERP structure:
1. Панель управления
2. Проекты (Активные, Все проекты, Архив)
3. Справочники (Номенклатура, Поставщики, Подрядчики, Настройки справочников)
4. Снабжение (Потребности, Заказы на закупку)
5. Рабочее место
6. Склад (Остатки, Поступления, Движение запасов, Перемещения, 
          Передача подрядчикам, Приемки от подрядчиков, Инвентаризация)
7. Аналитика
8. Настройки (Пользователи, Роли, Склады, Система, 
              Статусы производства, Статусы закупок, Причины производства, Причины закупок)
"""

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Initialize system modules for access control'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force recreate all modules (deletes existing)'
        )
    
    def handle(self, *args, **options):
        from infrastructure.persistence.models import SystemModule
        
        if options['force']:
            count = SystemModule.objects.count()
            SystemModule.objects.all().delete()
            self.stdout.write(f'Deleted {count} existing modules')
        
        with transaction.atomic():
            self._create_modules()
        
        self.stdout.write(
            self.style.SUCCESS('System modules initialization completed!')
        )
    
    def _create_modules(self):
        """Create system modules according to the structure."""
        from infrastructure.persistence.models import SystemModule
        
        # Module configurations with icons from Ant Design
        modules_config = [
            # 1. Панель управления (Dashboard)
            {
                'code': 'dashboard',
                'name': 'Панель управления',
                'description': 'Главная страница с обзором системы',
                'icon': 'DashboardOutlined',
                'sort_order': 10,
                'parent': None,
            },
            
            # 2. Проекты
            {
                'code': 'projects',
                'name': 'Проекты',
                'description': 'Управление проектами',
                'icon': 'ProjectOutlined',
                'sort_order': 20,
                'parent': None,
            },
            {
                'code': 'projects.active',
                'name': 'Активные',
                'description': 'Активные проекты в работе',
                'icon': 'PlayCircleOutlined',
                'sort_order': 21,
                'parent': 'projects',
            },
            {
                'code': 'projects.all',
                'name': 'Все проекты',
                'description': 'Полный список проектов',
                'icon': 'UnorderedListOutlined',
                'sort_order': 22,
                'parent': 'projects',
            },
            {
                'code': 'projects.archive',
                'name': 'Архив',
                'description': 'Архивированные проекты',
                'icon': 'FolderOutlined',
                'sort_order': 23,
                'parent': 'projects',
            },
            
            # 3. Справочники
            {
                'code': 'catalog',
                'name': 'Справочники',
                'description': 'Справочные данные системы',
                'icon': 'BookOutlined',
                'sort_order': 30,
                'parent': None,
            },
            {
                'code': 'catalog.nomenclature',
                'name': 'Номенклатура',
                'description': 'Справочник номенклатуры',
                'icon': 'AppstoreOutlined',
                'sort_order': 31,
                'parent': 'catalog',
            },
            {
                'code': 'catalog.suppliers',
                'name': 'Поставщики',
                'description': 'Справочник поставщиков',
                'icon': 'ShopOutlined',
                'sort_order': 32,
                'parent': 'catalog',
            },
            {
                'code': 'catalog.contractors',
                'name': 'Подрядчики',
                'description': 'Справочник подрядчиков',
                'icon': 'TeamOutlined',
                'sort_order': 33,
                'parent': 'catalog',
            },
            {
                'code': 'catalog.settings',
                'name': 'Настройки справочников',
                'description': 'Настройки справочных данных',
                'icon': 'SettingOutlined',
                'sort_order': 34,
                'parent': 'catalog',
            },
            
            # 4. Снабжение
            {
                'code': 'procurement',
                'name': 'Снабжение',
                'description': 'Управление закупками и снабжением',
                'icon': 'ShoppingCartOutlined',
                'sort_order': 40,
                'parent': None,
            },
            {
                'code': 'procurement.requirements',
                'name': 'Потребности',
                'description': 'Материальные потребности',
                'icon': 'ProfileOutlined',
                'sort_order': 41,
                'parent': 'procurement',
            },
            {
                'code': 'procurement.orders',
                'name': 'Заказы на закупку',
                'description': 'Управление заказами на закупку',
                'icon': 'FileTextOutlined',
                'sort_order': 42,
                'parent': 'procurement',
            },
            
            # 5. Рабочее место
            {
                'code': 'workplace',
                'name': 'Рабочее место',
                'description': 'Персональное рабочее место пользователя',
                'icon': 'DesktopOutlined',
                'sort_order': 50,
                'parent': None,
            },
            
            # 6. Склад
            {
                'code': 'warehouse',
                'name': 'Склад',
                'description': 'Управление складом и запасами',
                'icon': 'HomeOutlined',
                'sort_order': 60,
                'parent': None,
            },
            {
                'code': 'warehouse.inventory',
                'name': 'Остатки',
                'description': 'Складские остатки',
                'icon': 'DatabaseOutlined',
                'sort_order': 61,
                'parent': 'warehouse',
            },
            {
                'code': 'warehouse.receipts',
                'name': 'Поступления',
                'description': 'Приходные операции',
                'icon': 'PlusSquareOutlined',
                'sort_order': 62,
                'parent': 'warehouse',
            },
            {
                'code': 'warehouse.movements',
                'name': 'Движение запасов',
                'description': 'История движения товаров',
                'icon': 'SwapOutlined',
                'sort_order': 63,
                'parent': 'warehouse',
            },
            {
                'code': 'warehouse.transfers',
                'name': 'Перемещения',
                'description': 'Внутренние перемещения между складами',
                'icon': 'SyncOutlined',
                'sort_order': 64,
                'parent': 'warehouse',
            },
            {
                'code': 'warehouse.contractor_transfer',
                'name': 'Передача подрядчикам',
                'description': 'Передача материалов подрядчикам',
                'icon': 'ExportOutlined',
                'sort_order': 65,
                'parent': 'warehouse',
            },
            {
                'code': 'warehouse.contractor_return',
                'name': 'Приемки от подрядчиков',
                'description': 'Приемка материалов от подрядчиков',
                'icon': 'ImportOutlined',
                'sort_order': 66,
                'parent': 'warehouse',
            },
            {
                'code': 'warehouse.stocktaking',
                'name': 'Инвентаризация',
                'description': 'Инвентаризация склада',
                'icon': 'AuditOutlined',
                'sort_order': 67,
                'parent': 'warehouse',
            },
            
            # 7. Аналитика
            {
                'code': 'analytics',
                'name': 'Аналитика',
                'description': 'Аналитика и отчёты',
                'icon': 'BarChartOutlined',
                'sort_order': 70,
                'parent': None,
            },
            
            # 8. Настройки
            {
                'code': 'settings',
                'name': 'Настройки',
                'description': 'Настройки системы',
                'icon': 'SettingOutlined',
                'sort_order': 80,
                'parent': None,
            },
            {
                'code': 'settings.users',
                'name': 'Пользователи',
                'description': 'Управление пользователями',
                'icon': 'UserOutlined',
                'sort_order': 81,
                'parent': 'settings',
            },
            {
                'code': 'settings.roles',
                'name': 'Роли',
                'description': 'Управление ролями и правами доступа',
                'icon': 'SafetyOutlined',
                'sort_order': 82,
                'parent': 'settings',
            },
            {
                'code': 'settings.warehouses',
                'name': 'Склады',
                'description': 'Настройка складов',
                'icon': 'HomeOutlined',
                'sort_order': 83,
                'parent': 'settings',
            },
            {
                'code': 'settings.system',
                'name': 'Система',
                'description': 'Общие настройки системы',
                'icon': 'ToolOutlined',
                'sort_order': 84,
                'parent': 'settings',
            },
            {
                'code': 'settings.production_statuses',
                'name': 'Статусы производства',
                'description': 'Настройка статусов производства',
                'icon': 'NodeIndexOutlined',
                'sort_order': 85,
                'parent': 'settings',
            },
            {
                'code': 'settings.procurement_statuses',
                'name': 'Статусы закупок',
                'description': 'Настройка статусов закупок',
                'icon': 'TagOutlined',
                'sort_order': 86,
                'parent': 'settings',
            },
            {
                'code': 'settings.production_reasons',
                'name': 'Причины производства',
                'description': 'Настройка причин производства',
                'icon': 'ExceptionOutlined',
                'sort_order': 87,
                'parent': 'settings',
            },
            {
                'code': 'settings.procurement_reasons',
                'name': 'Причины закупок',
                'description': 'Настройка причин закупок',
                'icon': 'WarningOutlined',
                'sort_order': 88,
                'parent': 'settings',
            },
        ]
        
        # Create parent modules first
        parent_modules = {}
        for config in modules_config:
            if config['parent'] is None:
                module, created = SystemModule.objects.update_or_create(
                    code=config['code'],
                    defaults={
                        'name': config['name'],
                        'description': config['description'],
                        'icon': config['icon'],
                        'sort_order': config['sort_order'],
                        'parent': None,
                        'is_active': True,
                    }
                )
                parent_modules[config['code']] = module
                action = 'Created' if created else 'Updated'
                self.stdout.write(f'{action} module: {module.name}')
        
        # Create child modules
        for config in modules_config:
            if config['parent'] is not None:
                parent = parent_modules.get(config['parent'])
                if parent:
                    module, created = SystemModule.objects.update_or_create(
                        code=config['code'],
                        defaults={
                            'name': config['name'],
                            'description': config['description'],
                            'icon': config['icon'],
                            'sort_order': config['sort_order'],
                            'parent': parent,
                            'is_active': True,
                        }
                    )
                    action = 'Created' if created else 'Updated'
                    self.stdout.write(f'  {action} child module: {module.name}')
                else:
                    self.stdout.write(
                        self.style.WARNING(f'Parent not found for {config["code"]}')
                    )
        
        total = SystemModule.objects.count()
        self.stdout.write(
            self.style.SUCCESS(f'Total modules: {total}')
        )
