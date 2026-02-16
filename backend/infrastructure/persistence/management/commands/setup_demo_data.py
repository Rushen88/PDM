"""\
Setup Demo Data Command.

Purpose:
- Safely clear operational data for demo (projects, nomenclature, procurement, inventory).
- Keep reference/configuration data ("Настройка справочников"): statuses, reasons, categories, system modules.
- Seed realistic ERP-like demo dataset: roles/users, 4 projects, deep hierarchy, procurement activity,
  stock movements, transfers, inventory, contractor operations, problems with reasons/subreasons.

This command is intended for local demo environments.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone


@dataclass(frozen=True)
class DemoUserSpec:
    username: str
    email: str
    first_name: str
    last_name: str
    position: str
    department: str
    role_code: str


class Command(BaseCommand):
    help = 'Reset operational data and seed professional demo dataset'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Only clear operational data (no seeding)'
        )
        parser.add_argument(
            '--seed',
            action='store_true',
            help='Only seed demo data (no clearing)'
        )
        parser.add_argument(
            '--password',
            type=str,
            default='demo123',
            help='Password for created demo users'
        )
        parser.add_argument(
            '--keep-existing-users',
            action='store_true',
            help='Reserved (users are not purged by this command)'
        )

    def handle(self, *args, **options):
        only_clear = bool(options.get('clear'))
        only_seed = bool(options.get('seed'))
        password = options.get('password')

        # Default behavior: do both (clear + seed)
        do_clear = not only_seed
        do_seed = not only_clear

        result = {'users': []}

        with transaction.atomic():
            self._ensure_system_prerequisites()

            if do_clear:
                self.stdout.write('Clearing operational data...')
                self._clear_operational_data()
                self.stdout.write(self.style.SUCCESS('Operational data cleared.'))

            if do_seed:
                self.stdout.write('Seeding demo data...')
                result = self._seed_demo_data(password=password)
                self.stdout.write(self.style.SUCCESS('Demo data seeded.'))

        if do_seed:
            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS('Demo login accounts:'))
            for u in result['users']:
                self.stdout.write(f"- {u['username']} / {password} ({u['role']})")

    # ---------------------------------------------------------------------
    # Prerequisites (reference data)
    # ---------------------------------------------------------------------
    def _ensure_system_prerequisites(self):
        """Ensure reference/config data exists (without deleting any)."""
        from infrastructure.persistence.models import SystemModule

        if SystemModule.objects.count() == 0:
            call_command('init_system_modules')

        # Ensure baseline problem reasons (used by automatic problem detection)
        call_command('init_system', '--skip-roles', '--skip-admin')

        self._ensure_delay_reasons()
        self._ensure_project_analytics_problem_reasons()
        self._ensure_catalog_categories_exist()

    def _ensure_delay_reasons(self):
        from infrastructure.persistence.models import DelayReason

        if DelayReason.objects.exists():
            return

        DelayReason.objects.bulk_create(
            [
                DelayReason(
                    name='Поставка задержана поставщиком',
                    description='Поставщик не выдержал согласованный срок',
                    applies_to_procurement=True,
                    applies_to_production=False,
                    production_config='all',
                    is_active=True,
                ),
                DelayReason(
                    name='Не приступили вовремя к работам',
                    description='Подрядчик/цех не начал работы в срок',
                    applies_to_procurement=False,
                    applies_to_production=True,
                    production_config='all',
                    is_active=True,
                ),
                DelayReason(
                    name='Приостановка работ (ожидание КД/материалов)',
                    description='Работы приостановлены из‑за внешних ограничений',
                    applies_to_procurement=False,
                    applies_to_production=True,
                    production_config='all',
                    is_active=True,
                ),
            ]
        )

    def _ensure_project_analytics_problem_reasons(self):
        """Create minimal analytics reasons/subreasons if missing."""
        from infrastructure.persistence.models import (
            ManufacturingProblemReason,
            ManufacturingProblemSubreason,
            PurchaseProblemReason,
            PurchaseProblemSubreason,
        )

        if not ManufacturingProblemReason.objects.exists():
            m1 = ManufacturingProblemReason.objects.create(
                code='late_start',
                name='Не начаты вовремя',
                description='Работы не стартовали в плановую дату',
                is_system=True,
                is_active=True,
                sort_order=10,
            )
            ManufacturingProblemSubreason.objects.bulk_create(
                [
                    ManufacturingProblemSubreason(
                        reason=m1,
                        code='docs_missing',
                        name='Нет КД/ТЗ',
                        description='Отсутствует комплект документации',
                        is_active=True,
                        sort_order=11,
                    ),
                    ManufacturingProblemSubreason(
                        reason=m1,
                        code='materials_missing',
                        name='Нет материалов',
                        description='Материалы/комплектующие не обеспечены',
                        is_active=True,
                        sort_order=12,
                    ),
                ]
            )

        if not PurchaseProblemReason.objects.exists():
            p1 = PurchaseProblemReason.objects.create(
                code='delivery_disruption',
                name='Срыв поставки',
                description='Поставка не поступила в ожидаемый срок',
                is_system=True,
                is_active=True,
                sort_order=10,
            )
            PurchaseProblemSubreason.objects.bulk_create(
                [
                    PurchaseProblemSubreason(
                        reason=p1,
                        code='supplier_delay',
                        name='Задержка поставщика',
                        description='Поставщик переносит дату отгрузки',
                        is_active=True,
                        sort_order=11,
                    ),
                    PurchaseProblemSubreason(
                        reason=p1,
                        code='logistics',
                        name='Логистика/транспорт',
                        description='Задержка в доставке',
                        is_active=True,
                        sort_order=12,
                    ),
                ]
            )

    def _ensure_catalog_categories_exist(self):
        """Ensure required CatalogCategory codes exist; do not delete existing ones."""
        from infrastructure.persistence.models import CatalogCategory

        required = [
            ('material', 'Материалы', True, 10),
            ('standard_product', 'Стандартные изделия', True, 20),
            ('other_product', 'Прочие изделия', True, 30),
            ('part', 'Детали', False, 40),
            ('assembly_unit', 'Сборочные единицы', False, 50),
            ('subsystem', 'Подсистемы', False, 60),
            ('system', 'Системы', False, 70),
            ('stand', 'Стенды', False, 80),
        ]

        existing = set(CatalogCategory.all_objects.values_list('code', flat=True))
        to_create = []
        for code, name, is_purchased, sort_order in required:
            if code in existing:
                continue
            to_create.append(
                CatalogCategory(
                    code=code,
                    name=name,
                    is_purchased=is_purchased,
                    sort_order=sort_order,
                    is_active=True,
                )
            )
        if to_create:
            CatalogCategory.all_objects.bulk_create(to_create)

    # ---------------------------------------------------------------------
    # Clear
    # ---------------------------------------------------------------------
    def _clear_operational_data(self):
        """Delete only business/operational data. Keep reference/config data."""
        from infrastructure.persistence.models import (
            # Project
            Project,
            ProjectItem,
            UserAssignment,
            # BOM
            BOMItem,
            BOMStructure,
            # Catalog business data
            NomenclatureSupplier,
            NomenclatureItem,
            Supplier,
            Contractor,
            ContactPerson,
            BankDetails,
            # Procurement
            PurchaseOrder,
            PurchaseOrderItem,
            GoodsReceipt,
            GoodsReceiptItem,
            # Inventory
            MaterialRequirement,
            StockMovement,
            StockReservation,
            StockBatch,
            StockItem,
            StockTransfer,
            StockTransferItem,
            InventoryDocument,
            InventoryItem,
            ContractorWriteOff,
            ContractorWriteOffItem,
            ContractorReceipt,
            ContractorReceiptItem,
            Warehouse,
            # Production
            ProductionOrder,
            ProductionTask,
            ProductionProgress,
        )

        # Not re-exported via infrastructure.persistence.models
        from infrastructure.persistence.models.project import ProjectItemSequence
        from infrastructure.persistence.models.bom import BOMVersion

        def hard_delete(model_or_manager):
            # Some models support soft-delete with `all_objects`, others don't.
            if hasattr(model_or_manager, 'all') and hasattr(model_or_manager, 'delete'):
                # Already a queryset/manager-like
                model_or_manager.all().delete()
                return
            model = model_or_manager
            manager = getattr(model, 'all_objects', None) or model.objects
            manager.all().delete()

        # Inventory / documents
        hard_delete(InventoryItem)
        hard_delete(InventoryDocument)

        hard_delete(StockTransferItem)
        hard_delete(StockTransfer)

        hard_delete(GoodsReceiptItem)
        hard_delete(GoodsReceipt)

        hard_delete(PurchaseOrderItem)
        hard_delete(PurchaseOrder)

        hard_delete(ContractorReceiptItem)
        hard_delete(ContractorReceipt)
        hard_delete(ContractorWriteOffItem)
        hard_delete(ContractorWriteOff)

        hard_delete(StockMovement)
        hard_delete(StockReservation)
        hard_delete(StockBatch)
        hard_delete(StockItem)
        hard_delete(MaterialRequirement)

        # Production
        hard_delete(ProductionProgress)
        hard_delete(ProductionTask)
        hard_delete(ProductionOrder)

        # Projects
        hard_delete(UserAssignment)
        hard_delete(ProjectItem)
        hard_delete(Project)

        ProjectItemSequence.objects.filter(key='project_item').delete()

        # BOM
        hard_delete(BOMVersion)
        hard_delete(BOMItem)
        hard_delete(BOMStructure)

        # Catalog business data
        hard_delete(NomenclatureSupplier)
        hard_delete(NomenclatureItem)
        hard_delete(ContactPerson)
        hard_delete(BankDetails)
        hard_delete(Supplier)
        hard_delete(Contractor)

        # Warehouses
        hard_delete(Warehouse)

    # ---------------------------------------------------------------------
    # Seed
    # ---------------------------------------------------------------------
    def _seed_demo_data(self, password: str) -> dict:
        from django.contrib.auth import get_user_model
        from infrastructure.persistence.models import (
            Role,
            RoleModuleAccess,
            SystemModule,
            ModuleAccessChoices,
            UserRole,
            CatalogCategory,
            NomenclatureItem,
            NomenclatureSupplier,
            Supplier,
            Contractor,
            ContactPerson,
            BankDetails,
            Project,
            ProjectItem,
            ProjectStatusChoices,
            ManufacturingStatusChoices,
            ContractorStatusChoices,
            ManufacturerTypeChoices,
            MaterialSupplyTypeChoices,
            PurchaseStatusChoices,
            DelayReason,
            MaterialRequirement,
            PurchaseOrder,
            PurchaseOrderItem,
            GoodsReceipt,
            GoodsReceiptItem,
            Warehouse,
            StockItem,
            StockTransfer,
            StockTransferItem,
            InventoryDocument,
            InventoryItem,
            ContractorWriteOff,
            ContractorWriteOffItem,
            ContractorReceipt,
            ContractorReceiptItem,
            ProblemReason,
            ManufacturingProblemReason,
            ManufacturingProblemSubreason,
            PurchaseProblemReason,
            PurchaseProblemSubreason,
        )

        User = get_user_model()
        today = timezone.now().date()

        # -----------------------------------------------------------------
        # Roles + module access
        # -----------------------------------------------------------------
        modules = list(SystemModule.objects.filter(is_active=True))

        roles_cfg = [
            {
                'code': 'demo_full',
                'name': 'Полные права',
                'description': 'Полный доступ ко всем модулям (демо)',
                'project_access_scope': Role.PROJECT_SCOPE_ALL,
                'can_be_production_responsible': True,
                'can_be_inventory_responsible': True,
                'is_system_role': False,
                'is_active': True,
            },
            {
                'code': 'demo_production',
                'name': 'Производственные права',
                'description': 'Работа с проектами/производством/складом (демо)',
                'project_access_scope': Role.PROJECT_SCOPE_CHILDREN_EDIT,
                'can_be_production_responsible': True,
                'can_be_inventory_responsible': False,
                'is_system_role': False,
                'is_active': True,
            },
            {
                'code': 'demo_procurement',
                'name': 'Снабженец',
                'description': 'Работа с потребностями и заказами на закупку (демо)',
                'project_access_scope': Role.PROJECT_SCOPE_CHILDREN_VIEW,
                'can_be_production_responsible': False,
                'can_be_inventory_responsible': False,
                'is_system_role': False,
                'is_active': True,
            },
        ]

        role_by_code: dict[str, Role] = {}
        for rc in roles_cfg:
            role, _ = Role.objects.update_or_create(code=rc['code'], defaults=rc)
            role_by_code[rc['code']] = role

        RoleModuleAccess.objects.filter(role__in=list(role_by_code.values())).delete()

        def grant(role: Role, access_level: str, module_codes: Iterable[str] | None = None):
            selected = modules
            if module_codes is not None:
                code_set = set(module_codes)
                selected = [
                    m for m in modules
                    if m.code in code_set or any(m.code.startswith(c + '.') for c in code_set)
                ]
            RoleModuleAccess.objects.bulk_create(
                [RoleModuleAccess(role=role, module=m, access_level=access_level) for m in selected],
                ignore_conflicts=True,
            )

        grant(role_by_code['demo_full'], ModuleAccessChoices.FULL)
        grant(role_by_code['demo_production'], ModuleAccessChoices.EDIT, module_codes=['projects', 'warehouse', 'workplace', 'dashboard'])
        grant(role_by_code['demo_production'], ModuleAccessChoices.VIEW, module_codes=['catalog', 'procurement'])
        grant(role_by_code['demo_procurement'], ModuleAccessChoices.EDIT, module_codes=['procurement', 'catalog', 'dashboard', 'workplace'])
        grant(role_by_code['demo_procurement'], ModuleAccessChoices.VIEW, module_codes=['projects', 'warehouse'])

        # -----------------------------------------------------------------
        # Users
        # -----------------------------------------------------------------
        demo_users: list[DemoUserSpec] = [
            DemoUserSpec('demo.admin', 'demo.admin@pdm.local', 'Алексей', 'Соколов', 'Администратор демо', 'ИТ', 'demo_full'),
            DemoUserSpec('demo.pm', 'demo.pm@pdm.local', 'Илья', 'Иванов', 'Руководитель проекта', 'Проектный офис', 'demo_full'),
            DemoUserSpec('demo.prod', 'demo.prod@pdm.local', 'Анна', 'Кузнецова', 'Начальник производства', 'Производство', 'demo_production'),
            DemoUserSpec('demo.proc', 'demo.proc@pdm.local', 'Мария', 'Петрова', 'Специалист по снабжению', 'Снабжение', 'demo_procurement'),
            DemoUserSpec('demo.wh', 'demo.wh@pdm.local', 'Олег', 'Смирнов', 'Кладовщик', 'Склад', 'demo_production'),
        ]

        created_users = []
        for spec in demo_users:
            user, created = User.objects.get_or_create(
                username=spec.username,
                defaults={
                    'email': spec.email,
                    'first_name': spec.first_name,
                    'last_name': spec.last_name,
                    'position': spec.position,
                    'department': spec.department,
                    'is_staff': True,
                    'is_active': True,
                },
            )
            if created:
                user.set_password(password)
                user.save(update_fields=['password'])
            else:
                user.email = spec.email
                user.first_name = spec.first_name
                user.last_name = spec.last_name
                user.position = spec.position
                user.department = spec.department
                user.is_staff = True
                user.is_active = True
                user.save(update_fields=['email', 'first_name', 'last_name', 'position', 'department', 'is_staff', 'is_active'])

            UserRole.objects.update_or_create(
                user=user,
                role=role_by_code[spec.role_code],
                project_id=None,
                defaults={'is_active': True},
            )

            created_users.append({'username': user.username, 'role': role_by_code[spec.role_code].name})

        # -----------------------------------------------------------------
        # Suppliers / Contractors
        # -----------------------------------------------------------------
        suppliers = [
            Supplier.objects.create(
                name='ООО "ПромКомплект"',
                short_name='ПромКомплект',
                inn='7701001001',
                phone='+7 (495) 100-10-01',
                email='sales@promkomplekt.local',
                payment_terms='50% аванс / 50% по факту поставки',
                default_delivery_days=10,
                rating=Decimal('4.5'),
            ),
            Supplier.objects.create(
                name='АО "ЭлектроСнаб"',
                short_name='ЭлектроСнаб',
                inn='7802002002',
                phone='+7 (812) 200-20-02',
                email='info@electrosnab.local',
                payment_terms='100% по счёту',
                default_delivery_days=14,
                rating=Decimal('4.2'),
            ),
            Supplier.objects.create(
                name='ООО "МеталлТрейд"',
                short_name='МеталлТрейд',
                inn='5403003003',
                phone='+7 (383) 300-30-03',
                email='order@metalltrade.local',
                payment_terms='30 дней отсрочка',
                default_delivery_days=7,
                rating=Decimal('4.0'),
            ),
        ]

        contractors = [
            Contractor.objects.create(
                name='ООО "МехОбработка"',
                short_name='МехОбработка',
                inn='7704004004',
                phone='+7 (495) 400-40-04',
                email='pm@mechobr.local',
                specialization='Механообработка, сварка, сборка',
                contract_number='Д-24/11-01',
                contract_date=today.replace(month=11, day=1),
                default_lead_time_days=21,
                rating=Decimal('4.1'),
            ),
            Contractor.objects.create(
                name='ООО "ЭлектроМонтажСервис"',
                short_name='ЭМС',
                inn='7815005005',
                phone='+7 (812) 500-50-05',
                email='contracts@ems.local',
                specialization='Электромонтаж, сборка шкафов',
                contract_number='Д-25/01-07',
                contract_date=today.replace(month=1, day=7),
                default_lead_time_days=14,
                rating=Decimal('4.3'),
            ),
        ]

        ContactPerson.objects.create(
            supplier=suppliers[0],
            last_name='Сергеев',
            first_name='Павел',
            position='Менеджер по продажам',
            phone='+7 (495) 100-10-11',
            email='p.sergeev@promkomplekt.local',
            is_primary=True,
        )
        ContactPerson.objects.create(
            supplier=suppliers[1],
            last_name='Орлова',
            first_name='Екатерина',
            position='Менеджер проектов',
            phone='+7 (812) 200-20-22',
            email='e.orlova@electrosnab.local',
            is_primary=True,
        )
        ContactPerson.objects.create(
            contractor=contractors[0],
            last_name='Фёдоров',
            first_name='Николай',
            position='Руководитель производства',
            phone='+7 (495) 400-40-44',
            email='n.fedorov@mechobr.local',
            is_primary=True,
        )
        ContactPerson.objects.create(
            contractor=contractors[1],
            last_name='Сидорова',
            first_name='Ольга',
            position='Диспетчер',
            phone='+7 (812) 500-50-55',
            email='o.sidorova@ems.local',
            is_primary=True,
        )

        for s in suppliers:
            BankDetails.objects.create(
                supplier=s,
                bank_name='ПАО "Банк"',
                bik='044525225',
                settlement_account='40702810000000000001',
                currency='RUB',
                is_primary=True,
            )
        for c in contractors:
            BankDetails.objects.create(
                contractor=c,
                bank_name='ПАО "Банк"',
                bik='044525225',
                settlement_account='40702810000000000002',
                currency='RUB',
                is_primary=True,
            )

        # -----------------------------------------------------------------
        # Warehouses
        # -----------------------------------------------------------------
        wh_main = Warehouse.objects.create(code='WH-MAIN', name='Основной склад', address='Москва, складской комплекс №1')
        wh_assembly = Warehouse.objects.create(code='WH-ASM', name='Склад сборки', address='Москва, производственная площадка')
        Warehouse.objects.create(code='WH-SITE', name='Объект / монтаж', address='Площадка Заказчика')

        # -----------------------------------------------------------------
        # Nomenclature helpers
        # -----------------------------------------------------------------
        cat = {c.code: c for c in CatalogCategory.objects.filter(is_active=True)}

        def create_nom(code: str, name: str, category_code: str, unit: str = 'шт', drawing: str = '') -> NomenclatureItem:
            return NomenclatureItem.objects.create(
                code=code,
                name=name,
                catalog_category=cat[category_code],
                unit=unit,
                drawing_number=drawing,
            )

        def link_supplier(item: NomenclatureItem, supplier: Supplier, days: int, price: Decimal, is_primary: bool = True):
            NomenclatureSupplier.objects.update_or_create(
                nomenclature_item=item,
                supplier=supplier,
                defaults={
                    'delivery_days': days,
                    'price': price,
                    'currency': 'RUB',
                    'is_primary': is_primary,
                },
            )

        # Core demo product set
        stand_a = create_nom('STAND-100', 'СТЕНД ДЛЯ ИСПЫТАНИЙ КОМПЛЕКСА А-100', 'stand')
        stand_b = create_nom('STAND-200', 'СТЕНД ДЛЯ ИСПЫТАНИЙ КОМПЛЕКСА B-200', 'stand')
        stand_c = create_nom('STAND-300', 'СТЕНД ДЛЯ ИСПЫТАНИЙ КОМПЛЕКСА C-300', 'stand')
        stand_d = create_nom('STAND-400', 'СТЕНД ДЛЯ ИСПЫТАНИЙ КОМПЛЕКСА D-400', 'stand')

        cable_1 = create_nom('MAT-CBL-001', 'Кабель силовой 3x2.5', 'material', unit='м')
        steel_1 = create_nom('MAT-STL-001', 'Лист стальной 3мм', 'material', unit='кг')
        bolt_m8 = create_nom('STD-BLT-M8', 'Болт М8x30 оцинк.', 'standard_product', unit='шт')
        bearing_6202 = create_nom('STD-BRG-6202', 'Подшипник 6202', 'standard_product', unit='шт')
        sensor_pt100 = create_nom('OTH-SNS-PT100', 'Датчик температуры PT100', 'other_product', unit='шт')
        plc_cpu = create_nom('OTH-PLC-CPU', 'ПЛК CPU модуль', 'other_product', unit='шт')
        power_supply = create_nom('OTH-PSU-24', 'Блок питания 24V 10A', 'other_product', unit='шт')
        connector_m12 = create_nom('STD-CON-M12', 'Разъём M12, 4 pin', 'standard_product', unit='шт')

        link_supplier(cable_1, suppliers[1], days=14, price=Decimal('180.00'))
        link_supplier(steel_1, suppliers[2], days=7, price=Decimal('95.00'))
        link_supplier(bolt_m8, suppliers[0], days=10, price=Decimal('7.50'))
        link_supplier(bearing_6202, suppliers[0], days=10, price=Decimal('120.00'))
        link_supplier(sensor_pt100, suppliers[1], days=14, price=Decimal('950.00'))
        link_supplier(plc_cpu, suppliers[1], days=21, price=Decimal('185000.00'))
        link_supplier(power_supply, suppliers[1], days=14, price=Decimal('8900.00'))
        link_supplier(connector_m12, suppliers[0], days=10, price=Decimal('260.00'))

        sys_power = create_nom('SYS-PWR-001', 'СИСТЕМА ПИТАНИЯ', 'system')
        sys_control = create_nom('SYS-CTL-001', 'СИСТЕМА УПРАВЛЕНИЯ', 'system')
        sys_mech = create_nom('SYS-MEC-001', 'СИСТЕМА МЕХАНИКИ', 'system')

        sub_power = create_nom('SUB-PWR-UPS', 'ПоДсИсТеМа РезервногоПитания', 'subsystem')
        sub_cabinet = create_nom('SUB-CTL-CAB', 'ПоДсИсТеМа ШкафАвтоматики', 'subsystem')
        sub_drive = create_nom('SUB-MEC-DRV', 'ПоДсИсТеМа ПриводОси', 'subsystem')

        assy_cabinet = create_nom('ASM-CAB-001', 'Шкаф управления (сборка)', 'assembly_unit')
        assy_drive = create_nom('ASM-DRV-001', 'Приводной узел (сборка)', 'assembly_unit')
        part_frame = create_nom('PRT-FRM-001', 'Рама основания', 'part', drawing='FRM-001')
        part_bracket = create_nom('PRT-BRK-013', 'Кронштейн датчика', 'part', drawing='BRK-013')

        # -----------------------------------------------------------------
        # Projects + structure
        # -----------------------------------------------------------------
        pm_user = User.objects.get(username='demo.pm')
        prod_user = User.objects.get(username='demo.prod')
        proc_user = User.objects.get(username='demo.proc')
        wh_user = User.objects.get(username='demo.wh')

        def create_project(name: str, root_item: NomenclatureItem, status: str, planned_start_offset: int, planned_duration_days: int, description: str) -> Project:
            ps = today + timezone.timedelta(days=planned_start_offset)
            pe = ps + timezone.timedelta(days=planned_duration_days)
            return Project.objects.create(
                name=name,
                description=description,
                root_nomenclature=root_item,
                nomenclature_item=root_item,
                status=status,
                planned_start=ps,
                planned_end=pe,
                actual_start=(ps if status in [ProjectStatusChoices.IN_PROGRESS, ProjectStatusChoices.COMPLETED] else None),
                project_manager=pm_user,
            )

        p1 = create_project(
            name='Проект А-100 — стенд испытаний (серийный образец)',
            root_item=stand_a,
            status=ProjectStatusChoices.IN_PROGRESS,
            planned_start_offset=-30,
            planned_duration_days=90,
            description='Основной проект демонстрации: полный цикл снабжения/производства/подрядчиков.',
        )
        p2 = create_project(
            name='Проект B-200 — стенд испытаний (почти завершён)',
            root_item=stand_b,
            status=ProjectStatusChoices.IN_PROGRESS,
            planned_start_offset=-60,
            planned_duration_days=75,
            description='Проект в финальной стадии: есть закрытые закупки, остатки, приёмки от подрядчиков.',
        )
        p3 = create_project(
            name='Проект C-300 — стенд испытаний (в работе, 40–60%)',
            root_item=stand_c,
            status=ProjectStatusChoices.IN_PROGRESS,
            planned_start_offset=-15,
            planned_duration_days=80,
            description='Проект в активной фазе: часть заказов размещена, часть ждёт заказа.',
        )
        p4 = create_project(
            name='Проект D-400 — стенд испытаний (планирование)',
            root_item=stand_d,
            status=ProjectStatusChoices.PLANNING,
            planned_start_offset=10,
            planned_duration_days=100,
            description='Проект на стадии планирования: формируется структура и календарь.',
        )

        delay_proc = DelayReason.objects.filter(applies_to_procurement=True, is_active=True).first()
        delay_prod = DelayReason.objects.filter(applies_to_production=True, is_active=True).first()

        m_reason = ManufacturingProblemReason.objects.filter(is_active=True).order_by('sort_order').first()
        m_sub = ManufacturingProblemSubreason.objects.filter(is_active=True).order_by('sort_order').first()
        p_reason = PurchaseProblemReason.objects.filter(is_active=True).order_by('sort_order').first()
        p_sub = PurchaseProblemSubreason.objects.filter(is_active=True).order_by('sort_order').first()

        pr_not_ordered = ProblemReason.objects.filter(code='not_ordered_on_time', is_active=True).first()
        pr_delivery_delay = ProblemReason.objects.filter(code='delivery_delay', is_active=True).first()

        def add_item(
            project: Project,
            nom: NomenclatureItem,
            parent: ProjectItem | None,
            qty: Decimal,
            responsible=None,
            planned_start=None,
            planned_end=None,
            supplier: Supplier | None = None,
            purchase_by_contractor: bool = False,
            purchase_status: str | None = None,
            required_date=None,
            order_date=None,
            manufacturing_status: str | None = None,
            manufacturer_type: str | None = None,
            contractor: Contractor | None = None,
            contractor_status: str | None = None,
            material_supply_type: str | None = None,
            has_problem: bool = False,
            problem_reason_obj=None,
            problem_notes: str = '',
            delay_reason=None,
            delay_notes: str = '',
        ) -> ProjectItem:
            is_purchased = bool(nom.catalog_category and nom.catalog_category.is_purchased)
            item = ProjectItem.objects.create(
                project=project,
                bom_item=None,
                nomenclature_item=nom,
                parent_item=parent,
                category=nom.catalog_category.code if nom.catalog_category else '',
                name=nom.name,
                drawing_number=nom.drawing_number or '',
                quantity=qty,
                unit=nom.unit or 'шт',
                responsible=responsible,
                planned_start=planned_start,
                planned_end=planned_end,
                supplier=supplier,
                purchase_by_contractor=purchase_by_contractor,
                purchase_status=purchase_status or PurchaseStatusChoices.WAITING_ORDER,
                required_date=required_date,
                order_date=order_date,
                manufacturing_status=manufacturing_status or ManufacturingStatusChoices.NOT_STARTED,
                manufacturer_type=manufacturer_type or ManufacturerTypeChoices.INTERNAL,
                contractor=contractor,
                contractor_status=contractor_status or ContractorStatusChoices.SENT_TO_CONTRACTOR,
                material_supply_type=material_supply_type or MaterialSupplyTypeChoices.OUR_SUPPLY,
                has_problem=has_problem,
                problem_reason=problem_reason_obj,
                problem_notes=problem_notes,
                delay_reason=delay_reason,
                delay_notes=delay_notes,
                manufacturing_problem_reason=(m_reason if has_problem and not is_purchased else None),
                manufacturing_problem_subreason=(m_sub if has_problem and not is_purchased else None),
                purchase_problem_reason=(p_reason if has_problem and is_purchased else None),
                purchase_problem_subreason=(p_sub if has_problem and is_purchased else None),
            )
            return item

        def build_structure(project: Project, progress_profile: str, make_proc_problem: bool = False, make_delivery_problem: bool = False, make_contractor_problem: bool = False):
            root = add_item(
                project,
                project.root_nomenclature,
                parent=None,
                qty=Decimal('1'),
                responsible=pm_user,
                planned_start=project.planned_start,
                planned_end=project.planned_end,
                manufacturing_status=(ManufacturingStatusChoices.IN_PROGRESS if project.status == ProjectStatusChoices.IN_PROGRESS else ManufacturingStatusChoices.NOT_STARTED),
            )

            it_sys_power = add_item(project, sys_power, root, Decimal('1'), responsible=prod_user, planned_end=project.planned_start + timezone.timedelta(days=20))
            it_sys_ctl = add_item(project, sys_control, root, Decimal('1'), responsible=prod_user, planned_end=project.planned_start + timezone.timedelta(days=35))
            it_sys_mech = add_item(project, sys_mech, root, Decimal('1'), responsible=prod_user, planned_end=project.planned_start + timezone.timedelta(days=45))

            it_sub_power = add_item(project, sub_power, it_sys_power, Decimal('1'), responsible=prod_user)
            it_sub_cab = add_item(project, sub_cabinet, it_sys_ctl, Decimal('1'), responsible=prod_user)
            it_sub_drv = add_item(project, sub_drive, it_sys_mech, Decimal('1'), responsible=prod_user)

            it_assy_cab = add_item(project, assy_cabinet, it_sub_cab, Decimal('1'), responsible=prod_user)
            it_assy_drv = add_item(project, assy_drive, it_sub_drv, Decimal('1'), responsible=prod_user)

            it_frame = add_item(project, part_frame, it_sys_mech, Decimal('1'), responsible=prod_user)
            add_item(project, part_bracket, it_sub_cab, Decimal('2'), responsible=prod_user)

            need_date = (project.planned_start + timezone.timedelta(days=5)) if project.planned_start else today
            order_by = need_date - timezone.timedelta(days=10)

            add_item(
                project,
                bolt_m8,
                it_frame,
                Decimal('80'),
                responsible=proc_user,
                supplier=suppliers[0],
                purchase_status=PurchaseStatusChoices.WAITING_ORDER,
                required_date=need_date,
                order_date=order_by,
                has_problem=make_proc_problem,
                problem_reason_obj=(pr_not_ordered if make_proc_problem else None),
                problem_notes=('Не сформировали заказ вовремя: ожидали уточнение КД/спецификации.' if make_proc_problem else ''),
                delay_reason=(delay_proc if make_proc_problem else None),
                delay_notes=('Риск срыва: критичный крепёж для сборки.' if make_proc_problem else ''),
            )
            add_item(
                project,
                steel_1,
                it_frame,
                Decimal('120'),
                responsible=proc_user,
                supplier=suppliers[2],
                purchase_status=(PurchaseStatusChoices.WAITING_ORDER if project == p3 else (PurchaseStatusChoices.IN_ORDER if project.status == ProjectStatusChoices.IN_PROGRESS else PurchaseStatusChoices.WAITING_ORDER)),
                required_date=need_date,
                order_date=order_by,
            )
            add_item(
                project,
                cable_1,
                it_sys_power,
                Decimal('250'),
                responsible=proc_user,
                supplier=suppliers[1],
                purchase_status=PurchaseStatusChoices.IN_ORDER,
                required_date=need_date,
                order_date=order_by,
                has_problem=make_delivery_problem,
                problem_reason_obj=(pr_delivery_delay if make_delivery_problem else None),
                problem_notes=('Поставка задержана: перевозчик перенёс дату прибытия на 5 дней.' if make_delivery_problem else ''),
                delay_reason=(delay_proc if make_delivery_problem else None),
                delay_notes=('Срыв сроков монтажа кабельной трассы.' if make_delivery_problem else ''),
            )
            add_item(project, bearing_6202, it_assy_drv, Decimal('4'), responsible=proc_user, supplier=suppliers[0], purchase_status=PurchaseStatusChoices.CLOSED)
            add_item(project, connector_m12, it_assy_cab, Decimal('30'), responsible=proc_user, supplier=suppliers[0], purchase_status=PurchaseStatusChoices.CLOSED)
            add_item(
                project,
                sensor_pt100,
                it_assy_cab,
                Decimal('6'),
                responsible=proc_user,
                supplier=suppliers[1],
                purchase_status=(PurchaseStatusChoices.WAITING_ORDER if project == p3 else PurchaseStatusChoices.IN_ORDER),
            )
            add_item(
                project,
                plc_cpu,
                it_assy_cab,
                Decimal('1'),
                responsible=proc_user,
                supplier=suppliers[1],
                purchase_status=(PurchaseStatusChoices.WAITING_ORDER if project == p3 else PurchaseStatusChoices.IN_ORDER),
            )
            add_item(project, power_supply, it_sub_power, Decimal('2'), responsible=proc_user, supplier=suppliers[1], purchase_status=PurchaseStatusChoices.CLOSED)

            contractor_item = add_item(
                project,
                assy_cabinet,
                it_sys_ctl,
                Decimal('1'),
                responsible=prod_user,
                manufacturer_type=ManufacturerTypeChoices.CONTRACTOR,
                contractor=contractors[1],
                contractor_status=(ContractorStatusChoices.IN_PROGRESS_BY_CONTRACTOR if project == p1 else ContractorStatusChoices.MANUFACTURED_BY_CONTRACTOR),
                material_supply_type=MaterialSupplyTypeChoices.OUR_SUPPLY,
                has_problem=make_contractor_problem,
                problem_notes=('Подрядчик приостановил монтаж из-за отсутствия части комплектующих.' if make_contractor_problem else ''),
                delay_reason=(delay_prod if make_contractor_problem else None),
                delay_notes=('Приостановление работ. Требуется срочная поставка разъёмов/датчиков.' if make_contractor_problem else ''),
            )

            add_item(project, bolt_m8, contractor_item, Decimal('40'), responsible=wh_user, supplier=suppliers[0], purchase_status=PurchaseStatusChoices.CLOSED)
            add_item(project, connector_m12, contractor_item, Decimal('12'), responsible=wh_user, supplier=suppliers[0], purchase_status=PurchaseStatusChoices.CLOSED)

            extra_part = create_nom(f'PRT-PLT-{project.id.hex[:4].upper()}', 'Плита монтажная', 'part', drawing='PLT-007')
            add_item(project, extra_part, it_assy_cab, Decimal('1'), responsible=prod_user)

            if progress_profile == 'almost_done':
                ProjectItem.objects.filter(project=project, nomenclature_item__catalog_category__is_purchased=True).update(purchase_status=PurchaseStatusChoices.CLOSED)
                ProjectItem.objects.filter(project=project, nomenclature_item__catalog_category__is_purchased=False).update(manufacturing_status=ManufacturingStatusChoices.COMPLETED)
                ProjectItem.objects.filter(project=project, manufacturer_type=ManufacturerTypeChoices.CONTRACTOR).update(contractor_status=ContractorStatusChoices.COMPLETED)
            elif progress_profile == 'mid':
                purchased = list(ProjectItem.objects.filter(project=project, nomenclature_item__catalog_category__is_purchased=True))
                for idx, pi in enumerate(purchased):
                    if idx % 2 == 0:
                        pi.purchase_status = PurchaseStatusChoices.CLOSED
                        pi.save(update_fields=['purchase_status', 'updated_at'])
                manufactured = list(ProjectItem.objects.filter(project=project, nomenclature_item__catalog_category__is_purchased=False, manufacturer_type=ManufacturerTypeChoices.INTERNAL))
                for idx, mi in enumerate(manufactured):
                    if idx % 3 == 0:
                        mi.manufacturing_status = ManufacturingStatusChoices.COMPLETED
                        mi.save(update_fields=['manufacturing_status', 'updated_at'])

        build_structure(p1, progress_profile='mid', make_delivery_problem=True, make_contractor_problem=True)
        build_structure(p2, progress_profile='almost_done')
        build_structure(p3, progress_profile='mid', make_proc_problem=True)
        build_structure(p4, progress_profile='planning')

        for prj in [p1, p2, p3, p4]:
            prj.calculate_progress()

        # -----------------------------------------------------------------
        # Requirements (auto from purchased project items)
        # -----------------------------------------------------------------
        MaterialRequirement.sync_from_project_items()

        # -----------------------------------------------------------------
        # Procurement: purchase orders + confirm + receipts
        # -----------------------------------------------------------------
        reqs = MaterialRequirement.objects.filter(
            project__in=[p1, p2, p3],
            status='waiting_order',
            supplier__isnull=False,
            is_active=True,
            deleted_at__isnull=True,
        ).select_related('supplier', 'project', 'project_item', 'nomenclature_item')

        by_supplier: dict[str, list] = {}
        for r in reqs:
            by_supplier.setdefault(str(r.supplier_id), []).append(r)

        created_pos: list[PurchaseOrder] = []
        for supplier_id, items in by_supplier.items():
            sup = items[0].supplier
            po = PurchaseOrder.objects.create(
                supplier=sup,
                project=None,
                status='draft',
                payment_terms=sup.payment_terms,
                expected_delivery_date=today + timezone.timedelta(days=sup.default_delivery_days),
                notes='Демо-заказ: сформирован из потребностей активных проектов.',
            )
            created_pos.append(po)

            for r in items[:6]:
                PurchaseOrderItem.objects.create(
                    order=po,
                    nomenclature_item=r.nomenclature_item,
                    project_item=r.project_item,
                    quantity=r.total_required or r.to_order or Decimal('1'),
                    unit=r.nomenclature_item.unit or 'шт',
                    unit_price=Decimal('100.00'),
                    expected_delivery_date=r.delivery_date or (today + timezone.timedelta(days=sup.default_delivery_days)),
                    status='pending',
                    notes=f"Потребность по проекту: {r.project.name}",
                )
                r.purchase_order = po
                r.save(update_fields=['purchase_order', 'updated_at'])

            po.confirm_order(user=proc_user)

        if created_pos:
            po0 = created_pos[0]
            gr0 = GoodsReceipt.objects.create(
                purchase_order=po0,
                warehouse=wh_main,
                status='draft',
                receipt_date=today - timezone.timedelta(days=2),
                received_by=wh_user,
                notes='Демо-поступление: частичная поставка.',
            )
            for idx, poi in enumerate(po0.items.all()[:3]):
                qty = poi.quantity if idx == 0 else (poi.quantity / 2)
                GoodsReceiptItem.objects.create(
                    goods_receipt=gr0,
                    purchase_order_item=poi,
                    quantity=qty,
                    batch_number=f"BATCH-{today.strftime('%y%m')}-{idx+1:03d}",
                )
            gr0.confirm(user=wh_user)

        if len(created_pos) > 1:
            po1 = created_pos[1]
            gr1 = GoodsReceipt.objects.create(
                purchase_order=po1,
                warehouse=wh_main,
                status='draft',
                receipt_date=today - timezone.timedelta(days=5),
                received_by=wh_user,
                notes='Демо-поступление: полная поставка.',
            )
            for idx, poi in enumerate(po1.items.all()[:3]):
                GoodsReceiptItem.objects.create(
                    goods_receipt=gr1,
                    purchase_order_item=poi,
                    quantity=poi.quantity,
                    batch_number=f"BATCH-{today.strftime('%y%m')}-F{idx+1:03d}",
                )
            gr1.confirm(user=wh_user)

        # -----------------------------------------------------------------
        # Stock transfers
        # -----------------------------------------------------------------
        any_stock = StockItem.objects.filter(warehouse=wh_main).first()
        if any_stock:
            transfer = StockTransfer.objects.create(
                number=f"ПЕР-{today.strftime('%Y%m%d')}-0001",
                source_warehouse=wh_main,
                destination_warehouse=wh_assembly,
                status='pending',
                created_by=wh_user,
                reason='Демо: перемещение на склад сборки',
            )
            StockTransferItem.objects.create(
                transfer=transfer,
                source_stock_item=any_stock,
                quantity=min(any_stock.quantity, Decimal('10')),
            )
            transfer.ship(user=wh_user)
            transfer.receive(user=wh_user)

        # -----------------------------------------------------------------
        # Contractor operations
        # -----------------------------------------------------------------
        contractor_target_item = ProjectItem.objects.filter(
            project=p1,
            manufacturer_type=ManufacturerTypeChoices.CONTRACTOR,
            contractor__isnull=False,
        ).select_related('contractor').first()

        if contractor_target_item:
            for mi in [bolt_m8, connector_m12]:
                StockItem.objects.get_or_create(
                    warehouse=wh_main,
                    nomenclature_item=mi,
                    defaults={'quantity': Decimal('200'), 'unit': mi.unit or 'шт'},
                )

            writeoff = ContractorWriteOff.objects.create(
                contractor=contractor_target_item.contractor,
                warehouse=wh_main,
                project=p1,
                project_item=contractor_target_item,
                status='draft',
                writeoff_date=today - timezone.timedelta(days=7),
                transferred_by=wh_user,
                notes='Демо: передача материалов подрядчику для выполнения работ.',
            )
            ContractorWriteOffItem.objects.create(writeoff=writeoff, nomenclature_item=bolt_m8, quantity=Decimal('40'))
            ContractorWriteOffItem.objects.create(writeoff=writeoff, nomenclature_item=connector_m12, quantity=Decimal('12'))
            writeoff.confirm(user=wh_user)

            receipt = ContractorReceipt.objects.create(
                contractor=contractor_target_item.contractor,
                warehouse=wh_main,
                project=p1,
                writeoff=writeoff,
                status='draft',
                receipt_date=today - timezone.timedelta(days=1),
                received_by=wh_user,
                notes='Демо: приёмка результата работ от подрядчика.',
            )
            ContractorReceiptItem.objects.create(
                receipt=receipt,
                nomenclature_item=contractor_target_item.nomenclature_item,
                project_item=contractor_target_item,
                quantity=Decimal('1'),
            )
            receipt.confirm(user=wh_user)

        # -----------------------------------------------------------------
        # Inventory document
        # -----------------------------------------------------------------
        inv_doc = InventoryDocument.objects.create(
            warehouse=wh_main,
            document_type='spot_check',
            status='in_progress',
            planned_date=today,
            responsible=wh_user,
            notes='Демо: выборочная проверка остатков по критичным позициям.',
        )

        for si in StockItem.objects.filter(warehouse=wh_main)[:3]:
            reserved = si.reserved_quantity or Decimal('0')
            safe_actual = max(si.quantity, reserved) + Decimal('1')
            InventoryItem.objects.create(
                inventory_document=inv_doc,
                stock_item=si,
                system_quantity=si.quantity,
                actual_quantity=safe_actual,
                is_counted=True,
                notes='Демо: небольшая корректировка (пересчёт).',
            )
        inv_doc.complete(user=wh_user)

        return {'users': created_users}
