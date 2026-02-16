"""
Project Views.

API views for projects (STANDs) and project items.
"""

from rest_framework import status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Sum, Count, Q, F, Avg, Max
from django.utils import timezone
from datetime import timedelta

from infrastructure.persistence.models import (
    Project,
    ProjectItem,
    BOMStructure,
    BOMItem,
    NomenclatureItem,
    NomenclatureSupplier,
    CatalogCategory,
    Contractor,
    Supplier,
    DelayReason,
    ProblemReason,
    PurchaseStatusChoices,
    ManufacturingStatusChoices,
    ProjectStatusChoices,
)
from ..serializers.project import (
    ProjectListSerializer,
    ProjectDetailSerializer,
    ProjectTreeSerializer,
    ProjectGanttSerializer,
    ProjectItemListSerializer,
    ProjectItemDetailSerializer,
    ProjectItemTreeSerializer,
    ProjectProgressUpdateSerializer,
    ProjectBulkProgressUpdateSerializer,
)
from ..serializers.catalog import NomenclatureMinimalSerializer
from .base import BaseModelViewSet
from presentation.api.pagination import LargeResultsSetPagination


def _get_user_visibility_type(user):
    """Return visibility type for user based on roles.

    Returns one of: 'all', 'own_and_children', 'own', or None (no restriction).
    Only roles with production responsibility flags affect visibility.
    """
    if not user.is_authenticated or user.is_superuser:
        return None

    from infrastructure.persistence.models import UserRole, Role

    user_roles = UserRole.objects.filter(
        user=user,
        is_active=True
    ).values_list('role_id', flat=True)

    if not user_roles:
        return None

    roles = Role.objects.filter(id__in=user_roles, is_active=True)
    if not roles.exists():
        return None

    visibility_roles = roles.filter(
        Q(can_be_production_responsible=True) |
        Q(can_be_responsible=True) |
        Q(see_only_own_items=True) |
        Q(see_child_structures=True)
    )

    if not visibility_roles.exists():
        return None

    if visibility_roles.filter(visibility_type='all').exists():
        return 'all'

    if visibility_roles.filter(
        Q(visibility_type='own_and_children') | Q(see_child_structures=True)
    ).exists():
        return 'own_and_children'

    if visibility_roles.filter(
        Q(visibility_type='own') | Q(see_only_own_items=True)
    ).exists():
        return 'own'

    return None


class ProjectViewSet(BaseModelViewSet):
    """
    ViewSet for projects.
    
    Endpoints:
    - GET /projects/ - list all projects
    - POST /projects/ - create project (auto-expands BOM structure)
    - GET /projects/{id}/ - get project details
    - PUT/PATCH /projects/{id}/ - update project
    - DELETE /projects/{id}/ - soft delete project
    - GET /projects/{id}/tree/ - get project items as tree
    - GET /projects/{id}/gantt/ - get Gantt chart data
    - POST /projects/{id}/generate-from-bom/ - generate items from BOM
    - POST /projects/{id}/add-product/ - add product with BOM expansion
    - POST /projects/{id}/validate/ - validate before activation
    - POST /projects/{id}/activate/ - activate project
    - POST /projects/{id}/recalculate/ - recalculate progress
    - GET /projects/{id}/statistics/ - get detailed statistics
    """
    
    queryset = Project.objects.select_related(
        'bom', 'project_manager', 'nomenclature_item', 'root_nomenclature'
    ).prefetch_related('items').filter(is_active=True)
    
    serializer_classes = {
        'list': ProjectListSerializer,
        'retrieve': ProjectDetailSerializer,
        'tree': ProjectTreeSerializer,
        'default': ProjectDetailSerializer,
    }
    
    search_fields = ['name', 'description']
    filterset_fields = ['status', 'project_manager', 'is_active']
    ordering_fields = ['name', 'created_at', 'planned_end', 'progress_percent']
    ordering = ['-created_at']
    
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    
    def get_serializer_class(self):
        return self.serializer_classes.get(
            self.action,
            self.serializer_classes['default']
        )

    def get_queryset(self):
        queryset = super().get_queryset()

        visibility_type = _get_user_visibility_type(self.request.user)
        if visibility_type in ['own', 'own_and_children']:
            queryset = queryset.filter(items__responsible=self.request.user).distinct()

        return queryset
    
    def perform_create(self, serializer):
        """
        Override to auto-expand BOM structure when creating a project.
        
        If nomenclature_item or root_nomenclature is provided:
        1. Set root_nomenclature
        2. Find active BOM for that nomenclature
        3. Recursively create all ProjectItems from BOM
        """
        # Get the nomenclature_item from request data
        nomenclature_id = self.request.data.get('nomenclature_item') or self.request.data.get('root_nomenclature')
        
        with transaction.atomic():
            # Save the project first
            project = serializer.save()
            
            # If we have a nomenclature item, expand its BOM
            if nomenclature_id:
                try:
                    nomenclature = NomenclatureItem.objects.select_related('catalog_category').get(id=nomenclature_id)
                    
                    # Set root_nomenclature
                    project.root_nomenclature = nomenclature
                    project.nomenclature_item = nomenclature  # For backward compatibility
                    
                    # Find active BOM for this nomenclature
                    bom = BOMStructure.objects.filter(
                        root_item=nomenclature,
                        is_active=True
                    ).first()
                    
                    if bom:
                        project.bom = bom
                    
                    project.save(update_fields=['root_nomenclature', 'nomenclature_item', 'bom'])
                    
                    # Now expand the BOM tree into project items
                    self._expand_bom_tree(project, nomenclature)
                    
                except NomenclatureItem.DoesNotExist:
                    pass  # Invalid nomenclature_id, ignore
    
    def _expand_bom_tree(self, project, root_nomenclature, quantity=1):
        """
        Recursively expand BOM structure into ProjectItems.
        
        CRITICAL BUSINESS LOGIC:
        1. Creates ProjectItem for the root nomenclature (the product)
        2. Recursively creates children from BOM
        3. STOPS recursion at:
           - PURCHASED items (materials, standard products, other products)
             These are procurement leaf nodes - we need to buy them
           - DETAILS (детали) - these are manufactured leaf nodes
             We manufacture them, but don't track their internal material composition
             in project structure (that's MRP territory)
        4. Continues recursion for ASSEMBLY items (системы, подсистемы, сб.единицы)
           These have meaningful sub-assemblies we need to track
        
        This approach gives us:
        - Manufacturing planning: which assemblies/sub-assemblies to make, in what order
        - Procurement planning: which items to buy, for which assemblies
        - Without drowning in material-level detail inside simple parts
        """
        items_created = 0
        
        # NOTE: ProjectItem.item_number is a GLOBAL unique sequential ID.
        # Do not assign it here (or per-project), rely on ProjectItem.save() sequence.
        
        def create_project_item(item: NomenclatureItem, parent_project_item=None, qty_multiplier=1, position=0):
            """
            Recursively create ProjectItems from nomenclature and its BOM.
            
            BUSINESS LOGIC:
            1. Purchased items (materials, standard products, other products):
               - Create item with supplier info, STOP recursion
            2. Manufactured items (details, assemblies, systems):
               - Always expand BOM to include child items
               - This ensures materials needed for details are visible
            """
            nonlocal items_created
            
            # Determine category from catalog_category
            category_code = item.catalog_category.code if item.catalog_category else 'material'
            
            # Check if this is a purchased item
            is_purchased = False
            if item.catalog_category:
                is_purchased = item.catalog_category.is_purchased
            
            # Create project item
            project_item = ProjectItem.objects.create(
                project=project,
                nomenclature_item=item,
                parent_item=parent_project_item,
                category=category_code,
                name=item.name,
                drawing_number=item.drawing_number or '',
                quantity=quantity * qty_multiplier if parent_project_item is None else qty_multiplier,
                unit=item.unit,
                position=position,
                # Default statuses
                manufacturing_status='not_started',
                purchase_status=PurchaseStatusChoices.WAITING_ORDER if is_purchased else PurchaseStatusChoices.CLOSED,
            )
            items_created += 1
            
            # For PURCHASED items: set supplier and STOP recursion
            # These are procurement items - we buy them, don't make them
            if is_purchased:
                primary_supplier = NomenclatureSupplier.objects.filter(
                    nomenclature_item=item,
                    is_primary=True,
                    is_active=True
                ).select_related('supplier').first()
                
                if primary_supplier:
                    project_item.supplier = primary_supplier.supplier
                    project_item.article_number = primary_supplier.supplier_article or ''
                    project_item.save(update_fields=['supplier', 'article_number'])
                
                # STOP: Don't expand BOM for purchased items
                return project_item
            
            # For ALL MANUFACTURED items: expand BOM recursively
            # This includes details, assemblies, systems - all need to show their materials
            bom = BOMStructure.objects.filter(
                root_item=item,
                is_active=True
            ).first()
            
            if bom:
                # Get direct children from BOM
                bom_items = BOMItem.objects.filter(
                    bom=bom,
                    parent_item=item
                ).select_related(
                    'child_item', 
                    'child_item__catalog_category'
                ).order_by('position')
                
                for idx, bom_item in enumerate(bom_items):
                    create_project_item(
                        bom_item.child_item,
                        project_item,
                        float(bom_item.quantity),
                        idx + 1
                    )
            
            return project_item
        
        # Start expansion from root nomenclature
        create_project_item(root_nomenclature, None, 1, 0)
        return items_created
    
    @action(detail=True, methods=['get'])
    def tree(self, request, pk=None):
        """
        Get project items as hierarchical tree.
        
        Visibility rules are derived from user's roles:
        - own: only items where user is responsible
        - own_and_children: responsible items + all descendants
        - all: full tree
        """
        project = self.get_object()
        user = request.user
        visibility_type = _get_user_visibility_type(user)

        context = {'request': request}
        if visibility_type == 'own':
            visible_ids = list(
                project.items.filter(responsible=user).values_list('id', flat=True)
            )
            context['filter_item_ids'] = visible_ids
        elif visibility_type == 'own_and_children':
            responsible_ids = list(
                project.items.filter(responsible=user).values_list('id', flat=True)
            )

            all_visible_ids = set(responsible_ids)

            def get_children_ids(parent_ids):
                if not parent_ids:
                    return []
                child_ids = list(
                    project.items.filter(parent_item_id__in=parent_ids).values_list('id', flat=True)
                )
                return child_ids + get_children_ids(child_ids)

            all_visible_ids.update(get_children_ids(responsible_ids))
            context['filter_item_ids'] = list(all_visible_ids)

        serializer = ProjectTreeSerializer(project, context=context)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def gantt(self, request, pk=None):
        """Get Gantt chart data for the project."""
        project = self.get_object()
        
        # Get all items with dates
        items = project.items.filter(
            planned_start__isnull=False,
            planned_end__isnull=False
        ).select_related('nomenclature_item')
        
        serializer = ProjectGanttSerializer(items, many=True)
        return Response({
            'project': {
                'id': str(project.id),
                'name': project.name,
                'start': project.planned_start,
                'end': project.planned_end,
            },
            'items': serializer.data,
        })
    
    @action(detail=True, methods=['post'])
    def generate_from_bom(self, request, pk=None):
        """Generate project items from BOM structure."""
        project = self.get_object()
        
        if not project.bom:
            return Response(
                {'error': 'Проект не связан с BOM'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        bom = project.bom
        
        with transaction.atomic():
            # Clear existing items if requested
            if request.data.get('clear_existing', False):
                project.items.all().delete()
            
            # Create project items from BOM items
            items_created = 0
            items_map = {}  # bom_item_id -> project_item
            
            for bom_item in bom.items.select_related('child_item').all():
                project_item = ProjectItem.objects.create(
                    project=project,
                    bom_item=bom_item,
                    nomenclature_item=bom_item.child_item,
                    category=bom_item.child_category,
                    name=bom_item.child_item.name,
                    drawing_number=bom_item.drawing_number_override or bom_item.child_item.drawing_number,
                    quantity=bom_item.quantity,
                    unit=bom_item.unit,
                )
                items_map[bom_item.id] = project_item
                items_created += 1
            
            # Set parent references
            for bom_item in bom.items.filter(parent_item__isnull=False):
                project_item = items_map.get(bom_item.id)
                if project_item and bom_item.parent_item_id:
                    # Find parent project item by parent bom item's child_item
                    parent_bom_items = bom.items.filter(
                        child_item_id=bom_item.parent_item_id
                    )
                    for parent_bom in parent_bom_items:
                        if parent_bom.id in items_map:
                            project_item.parent_item = items_map[parent_bom.id]
                            project_item.save(update_fields=['parent_item'])
                            break
        
        return Response({
            'message': f'Создано {items_created} позиций проекта из BOM',
            'items_created': items_created,
        })
    
    @action(detail=True, methods=['post'])
    def add_product(self, request, pk=None):
        """
        Добавить изделие в проект с автоматическим развёртыванием BOM дерева.
        
        Входные параметры:
        - nomenclature_item_id: UUID номенклатурной позиции
        - quantity: количество (default: 1)
        
        Рекурсивно создаёт все элементы из BOM структуры.
        """
        project = self.get_object()
        nomenclature_id = request.data.get('nomenclature_item_id')
        quantity = request.data.get('quantity', 1)
        
        if not nomenclature_id:
            return Response(
                {'error': 'Необходимо указать nomenclature_item_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            nomenclature = NomenclatureItem.objects.select_related('catalog_category').get(id=nomenclature_id)
        except NomenclatureItem.DoesNotExist:
            return Response(
                {'error': 'Номенклатурная позиция не найдена'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Проверяем что это изготавливаемая позиция
        if nomenclature.is_purchased:
            return Response(
                {'error': 'Можно добавить только изготавливаемые изделия'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        with transaction.atomic():
            items_created = 0
            
            def expand_bom_tree(item: NomenclatureItem, parent_project_item=None, qty_multiplier=1):
                """Рекурсивно развёртывает BOM дерево."""
                nonlocal items_created
                
                # Определяем категорию
                category = item.catalog_category.code if item.catalog_category else 'material'
                
                # Создаём элемент проекта
                project_item = ProjectItem.objects.create(
                    project=project,
                    nomenclature_item=item,
                    parent_item=parent_project_item,
                    category=category,
                    name=item.name,
                    drawing_number=item.drawing_number or '',
                    quantity=quantity * qty_multiplier if parent_project_item is None else qty_multiplier,
                    unit=item.unit,
                    # Устанавливаем статусы по умолчанию
                    manufacturing_status='not_started' if item.is_manufactured else 'not_started',
                    purchase_status=PurchaseStatusChoices.WAITING_ORDER if item.is_purchased else PurchaseStatusChoices.CLOSED,
                )
                items_created += 1
                
                # Получаем BOM для этого изделия
                bom = BOMStructure.objects.filter(
                    root_item=item,
                    is_active=True
                ).first()
                
                if bom:
                    # Получаем дочерние элементы текущего item в BOM
                    # parent_item=item означает компоненты первого уровня под этим item
                    bom_items = BOMItem.objects.filter(
                        bom=bom,
                        parent_item=item  # Дочерние элементы текущего item
                    ).select_related('child_item', 'child_item__catalog_category')
                    
                    for bom_item in bom_items:
                        # Рекурсивно добавляем дочерние элементы
                        expand_bom_tree(
                            bom_item.child_item,
                            project_item,
                            float(bom_item.quantity)
                        )
                
                # Для закупаемых позиций устанавливаем поставщика по умолчанию
                if item.is_purchased:
                    primary_supplier = NomenclatureSupplier.objects.filter(
                        nomenclature_item=item,
                        is_primary=True,
                        is_active=True
                    ).select_related('supplier').first()
                    
                    if primary_supplier:
                        project_item.supplier = primary_supplier.supplier
                        project_item.article_number = primary_supplier.supplier_article
                        project_item.save(update_fields=['supplier', 'article_number'])
                
                return project_item
            
            # Развёртываем дерево начиная с корневого изделия
            root_item = expand_bom_tree(nomenclature)
        
        return Response({
            'message': f'Добавлено изделие "{nomenclature.name}" с {items_created} позициями',
            'items_created': items_created,
            'root_item_id': str(root_item.id),
        })
    
    @action(detail=True, methods=['get'])
    def validate(self, request, pk=None):
        """
        Validate project before activation.
        
        Returns list of validation errors that must be fixed before project can be activated.
        """
        project = self.get_object()
        errors = project.get_validation_errors()
        
        return Response({
            'valid': len(errors) == 0,
            'errors': errors,
            'can_activate': project.can_activate(),
        })
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """
        Activate project if all validations pass.
        
        Changes project status to 'in_progress'.
        """
        project = self.get_object()
        
        if not project.can_activate():
            errors = project.get_validation_errors()
            return Response({
                'success': False,
                'message': 'Проект не может быть активирован',
                'errors': errors,
            }, status=status.HTTP_400_BAD_REQUEST)
        
        project.status = 'in_progress'
        if not project.actual_start:
            project.actual_start = timezone.now().date()
        project.save(update_fields=['status', 'actual_start'])
        
        return Response({
            'success': True,
            'message': 'Проект активирован',
            'status': project.status,
        })

    @action(detail=True, methods=['post'])
    def activate_with_receipts(self, request, pk=None):
        """
        Активация проекта с оформлением поступлений по закрытым закупаемым позициям.
        Ожидает payload: { receipts: [{ project_item_id, warehouse_id, quantity }] }
        """
        from decimal import Decimal
        from django.db import transaction
        from django.utils import timezone
        from infrastructure.persistence.models import ProjectItem, StockItem, StockMovement, StockReservation

        project = self.get_object()

        if project.status != 'planning':
            return Response({'error': 'Проект уже активирован или не в планировании.'}, status=status.HTTP_400_BAD_REQUEST)

        receipts = request.data.get('receipts') or []
        if not receipts:
            return Response({'error': 'Не указаны поступления для закрытых позиций.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            receipts = [
                {
                    'project_item_id': r.get('project_item_id'),
                    'warehouse_id': r.get('warehouse_id'),
                    'quantity': Decimal(str(r.get('quantity'))),
                }
                for r in receipts
            ]
        except Exception:
            return Response({'error': 'Некорректные данные поступлений.'}, status=status.HTTP_400_BAD_REQUEST)

        item_ids = list({r['project_item_id'] for r in receipts})
        items = ProjectItem.objects.filter(project=project, id__in=item_ids)
        items_map = {str(i.id): i for i in items}

        for item_id in item_ids:
            if item_id not in items_map:
                return Response({'error': 'Позиция проекта не найдена.'}, status=status.HTTP_404_NOT_FOUND)

        # Validate closed purchased items
        grouped = {}
        for r in receipts:
            grouped.setdefault(r['project_item_id'], []).append(r)

        for item_id, group in grouped.items():
            item = items_map[str(item_id)]
            if not item.is_purchased or item.purchase_status != PurchaseStatusChoices.CLOSED:
                return Response({'error': 'Поступление возможно только для закрытых закупаемых позиций.'}, status=status.HTTP_400_BAD_REQUEST)
            total_qty = sum([g['quantity'] for g in group if g.get('quantity')])
            required_qty = Decimal(str(item.quantity))
            if total_qty != required_qty:
                return Response({'error': f'Сумма поступления для позиции должна быть равна {required_qty}.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            for item_id, group in grouped.items():
                item = items_map[str(item_id)]
                for allocation in group:
                    stock_item, _ = StockItem.objects.get_or_create(
                        warehouse_id=allocation['warehouse_id'],
                        nomenclature_item_id=item.nomenclature_item_id,
                        defaults={
                            'quantity': 0,
                            'unit': item.unit or 'шт',
                        }
                    )

                    stock_item.quantity += allocation['quantity']
                    stock_item.save(update_fields=['quantity'])

                    StockMovement.objects.create(
                        stock_item=stock_item,
                        movement_type='receipt',
                        quantity=allocation['quantity'],
                        balance_after=stock_item.quantity,
                        project=item.project,
                        project_item=item,
                        performed_by=request.user,
                        reason='Поступление при активации проекта',
                        notes=f'Поступление при активации проекта ({timezone.now().date()})',
                    )

                    StockReservation.objects.create(
                        stock_item=stock_item,
                        project=item.project,
                        project_item=item,
                        quantity=allocation['quantity'],
                        status='confirmed',
                        required_date=item.required_date,
                        notes='Резерв при активации проекта',
                    )
                    stock_item.reserved_quantity += allocation['quantity']
                    stock_item.save(update_fields=['reserved_quantity'])

            project.status = 'in_progress'
            if not project.actual_start:
                project.actual_start = timezone.now().date()
            project.save(update_fields=['status', 'actual_start'])

        return Response({'success': True, 'message': 'Проект активирован', 'status': project.status})
    
    @action(detail=True, methods=['post'])
    def recalculate_progress(self, request, pk=None):
        """
        Recalculate project progress based on item statuses.
        """
        project = self.get_object()
        progress = project.calculate_progress()
        
        return Response({
            'progress_percent': float(progress),
            'last_calculation': project.last_progress_calculation,
        })
    
    @action(detail=True, methods=['post'])
    def cascade_dates(self, request, pk=None):
        """
        Cascade dates from specified item to all children.
        
        For manufactured children: planned_end = parent's planned_start - 1
        For purchased children: calculate based on supplier lead time
        """
        project = self.get_object()
        item_id = request.data.get('item_id')
        
        if not item_id:
            return Response(
                {'error': 'Необходимо указать item_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            item = ProjectItem.objects.get(id=item_id, project=project)
        except ProjectItem.DoesNotExist:
            return Response(
                {'error': 'Элемент проекта не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if not item.planned_start:
            return Response(
                {'error': 'У элемента не задана плановая дата начала'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        updated_items = item.cascade_dates_to_children(save=True)
        
        return Response({
            'message': f'Даты рассчитаны для {len(updated_items)} элементов',
            'updated_count': len(updated_items),
        })

    @action(detail=True, methods=['post'])
    def set_responsible_cascade(self, request, pk=None):
        """
        Установить ответственного для элемента и всех его дочерних элементов.
        
        Входные параметры:
        - item_id: UUID элемента проекта
        - responsible_id: UUID пользователя
        - cascade: bool - применить ко всем дочерним (default: True)
        """
        project = self.get_object()
        item_id = request.data.get('item_id')
        responsible_id = request.data.get('responsible_id')
        cascade = request.data.get('cascade', True)
        
        if not item_id or not responsible_id:
            return Response(
                {'error': 'Необходимо указать item_id и responsible_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            item = ProjectItem.objects.get(id=item_id, project=project)
        except ProjectItem.DoesNotExist:
            return Response(
                {'error': 'Элемент проекта не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        updated_count = 0
        
        with transaction.atomic():
            def update_responsible(project_item):
                nonlocal updated_count
                project_item.responsible_id = responsible_id
                project_item.save(update_fields=['responsible_id'])
                updated_count += 1
                
                if cascade:
                    for child in project_item.children.all():
                        update_responsible(child)
            
            update_responsible(item)
        
        return Response({
            'message': f'Ответственный установлен для {updated_count} элементов',
            'updated_count': updated_count,
        })
    
    @action(detail=True, methods=['post'])
    def set_contractor(self, request, pk=None):
        """
        Установить подрядчика для изготавливаемого элемента.
        
        Входные параметры:
        - item_id: UUID элемента проекта
        - contractor_id: UUID подрядчика
        - material_supply_type: 'our_supply' | 'contractor_supply'
        - cascade: bool - применить ко всем изготавливаемым дочерним
        
        При назначении подрядчика автоматически:
        - Устанавливается статус 'sent_to_contractor' (передано подрядчику)
        - Очищается planned_start (нам не важно когда подрядчик начнёт)
        - Важна только плановая дата окончания (когда должны получить)
        """
        project = self.get_object()
        item_id = request.data.get('item_id')
        contractor_id = request.data.get('contractor_id')
        material_supply_type = request.data.get('material_supply_type', 'our_supply')
        cascade = request.data.get('cascade', False)
        
        if not item_id or not contractor_id:
            return Response(
                {'error': 'Необходимо указать item_id и contractor_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            item = ProjectItem.objects.get(id=item_id, project=project)
        except ProjectItem.DoesNotExist:
            return Response(
                {'error': 'Элемент проекта не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        updated_count = 0
        
        with transaction.atomic():
            def update_contractor(project_item):
                nonlocal updated_count
                # Только для изготавливаемых позиций
                if not project_item.is_purchased:
                    project_item.manufacturer_type = 'contractor'
                    project_item.contractor_id = contractor_id
                    project_item.material_supply_type = material_supply_type
                    # Автоматически устанавливаем статус "передано подрядчику"
                    project_item.contractor_status = 'sent_to_contractor'
                    # Очищаем плановую дату начала - нам не важно когда подрядчик начнёт
                    project_item.planned_start = None
                    project_item.save(update_fields=[
                        'manufacturer_type', 
                        'contractor_id', 
                        'material_supply_type',
                        'contractor_status',
                        'planned_start',
                    ])
                    updated_count += 1
                else:
                    if material_supply_type == 'contractor_supply':
                        project_item.purchase_by_contractor = True
                        project_item.purchase_status = PurchaseStatusChoices.WAITING_ORDER
                        project_item.supplier = None
                        project_item.required_date = None
                        project_item.order_date = None
                        project_item.planned_end = None
                        project_item.save(update_fields=[
                            'purchase_by_contractor',
                            'purchase_status',
                            'supplier',
                            'required_date',
                            'order_date',
                            'planned_end',
                        ])
                    elif project_item.purchase_by_contractor:
                        project_item.purchase_by_contractor = False
                        if project_item.purchase_status != PurchaseStatusChoices.WAITING_ORDER:
                            project_item.purchase_status = PurchaseStatusChoices.WAITING_ORDER
                        project_item.save(update_fields=['purchase_by_contractor', 'purchase_status'])
                
                if cascade:
                    for child in project_item.children.all():
                        update_contractor(child)
            
            update_contractor(item)
        
        return Response({
            'message': f'Подрядчик установлен для {updated_count} элементов',
            'updated_count': updated_count,
        })
    
    @action(detail=True, methods=['post'])
    def set_internal_manufacturer(self, request, pk=None):
        """
        Установить изготовление "Своими силами" для элемента.
        
        Входные параметры:
        - item_id: UUID элемента проекта
        - cascade: bool - применить ко всем изготавливаемым дочерним элементам
        
        При установке "Своими силами":
        - manufacturer_type = 'internal'
        - contractor = null
        - material_supply_type = 'our_supply'
        - manufacturing_status = 'not_started'
        """
        project = self.get_object()
        item_id = request.data.get('item_id')
        cascade = request.data.get('cascade', False)
        
        if not item_id:
            return Response(
                {'error': 'Необходимо указать item_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            item = ProjectItem.objects.get(id=item_id, project=project)
        except ProjectItem.DoesNotExist:
            return Response(
                {'error': 'Элемент проекта не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        updated_count = 0
        
        with transaction.atomic():
            def update_to_internal(project_item):
                nonlocal updated_count
                
                # Если позиция закупаемая, то нужно установить статус "Ожидает заказа" и поставщика
                if project_item.is_purchased:
                    update_fields = []

                    # Логика как при material_supply_type='our_supply': закупаем мы
                    if project_item.purchase_by_contractor:
                        project_item.purchase_by_contractor = False
                        update_fields.append('purchase_by_contractor')

                    if project_item.purchase_status != PurchaseStatusChoices.WAITING_ORDER:
                        project_item.purchase_status = PurchaseStatusChoices.WAITING_ORDER
                        update_fields.append('purchase_status')

                    # Если поставщик не указан — подставляем приоритетного поставщика для номенклатуры
                    if project_item.supplier_id is None and project_item.nomenclature_item_id is not None:
                        default_supplier_link = (
                            NomenclatureSupplier.objects
                            .filter(
                                nomenclature_item_id=project_item.nomenclature_item_id,
                                is_primary=True,
                                is_active=True,
                            )
                            .select_related('supplier')
                            .first()
                        )
                        if not default_supplier_link:
                            default_supplier_link = (
                                NomenclatureSupplier.objects
                                .filter(
                                    nomenclature_item_id=project_item.nomenclature_item_id,
                                    is_active=True,
                                )
                                .select_related('supplier')
                                .first()
                            )
                        if default_supplier_link and default_supplier_link.supplier_id:
                            project_item.supplier_id = default_supplier_link.supplier_id
                            update_fields.append('supplier')

                    if update_fields:
                        project_item.save(update_fields=update_fields)
                    updated_count += 1
                else:
                    # Если позиция изготавливаемая - ставим "Своими силами"
                    project_item.manufacturer_type = 'internal'
                    project_item.contractor = None
                    project_item.material_supply_type = 'our_supply'
                    # Сбрасываем статус подрядчика, устанавливаем статус изготовления
                    # Используем пустую строку вместо None, так как поле не nullable
                    project_item.contractor_status = ''
                    if project_item.manufacturing_status is None:
                        project_item.manufacturing_status = 'not_started'
                    project_item.save(update_fields=[
                        'manufacturer_type', 
                        'contractor', 
                        'material_supply_type',
                        'contractor_status',
                        'manufacturing_status',
                    ])
                    updated_count += 1

                if cascade:
                    for child in project_item.children.all():
                        update_to_internal(child)
            
            update_to_internal(item)
        
        return Response({
            'message': f'Исполнитель "Своими силами" установлен для {updated_count} элементов',
            'updated_count': updated_count,
        })
    
    @action(detail=True, methods=['post'])
    def set_dates(self, request, pk=None):
        """
        Установить даты для элемента.
        
        Входные параметры:
        - item_id: UUID элемента проекта
        - planned_start: дата начала
        - planned_end: дата окончания
        - auto_required: bool - автоматически рассчитать required_date для закупок
        """
        project = self.get_object()
        item_id = request.data.get('item_id')
        planned_start = request.data.get('planned_start')
        planned_end = request.data.get('planned_end')
        auto_required = request.data.get('auto_required', True)
        
        if not item_id:
            return Response(
                {'error': 'Необходимо указать item_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            item = ProjectItem.objects.get(id=item_id, project=project)
        except ProjectItem.DoesNotExist:
            return Response(
                {'error': 'Элемент проекта не найден'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        from datetime import datetime
        start_date_obj = None
        end_date_obj = None
        if planned_start:
            start_date_obj = datetime.strptime(planned_start, '%Y-%m-%d').date()
        if planned_end:
            end_date_obj = datetime.strptime(planned_end, '%Y-%m-%d').date()

        if start_date_obj and end_date_obj and end_date_obj < start_date_obj:
            return Response(
                {'error': 'Плановое окончание не может быть раньше планового начала'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if planned_start:
            item.planned_start = planned_start
        if planned_end:
            item.planned_end = planned_end
        
        # Для закупаемых позиций автоматически устанавливаем required_date
        if auto_required and planned_start and item.is_purchased:
            # Требуемая дата = за день до начала изготовления родителя
            start_date = start_date_obj or datetime.strptime(planned_start, '%Y-%m-%d').date()
            item.required_date = start_date - timedelta(days=1)
        
        item.save()
        
        serializer = ProjectItemDetailSerializer(item, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def validate_suppliers(self, request, pk=None):
        """
        Валидация: проверить что все закупаемые позиции имеют поставщика.
        
        Возвращает список позиций без поставщика.
        """
        project = self.get_object()
        
        missing_suppliers = project.items.filter(
            Q(category__in=['material', 'standard_product', 'other_product']) |
            Q(nomenclature_item__catalog_category__is_purchased=True),
            supplier__isnull=True,
            purchase_by_contractor=False
        ).values('id', 'name', 'nomenclature_item__code')
        
        missing = list(missing_suppliers)
        is_valid = len(missing) == 0
        
        return Response({
            'is_valid': is_valid,
            'missing_suppliers': missing,
            'message': 'Все поставщики указаны' if is_valid else f'{len(missing)} позиций без поставщика',
        })
    
    @action(detail=True, methods=['get'])
    def purchase_list(self, request, pk=None):
        """
        Получить ведомость закупок для проекта.
        
        Группирует закупаемые позиции по поставщикам с датами.
        """
        project = self.get_object()
        
        # Получаем все закупаемые позиции
        purchased_items = project.items.filter(
            Q(nomenclature_item__catalog_category__is_purchased=True),
            purchase_by_contractor=False
        ).select_related('supplier', 'nomenclature_item')
        
        # Группируем по поставщикам
        by_supplier = {}
        without_supplier = []
        
        for item in purchased_items:
            if item.supplier:
                supplier_id = str(item.supplier_id)
                if supplier_id not in by_supplier:
                    by_supplier[supplier_id] = {
                        'supplier': {
                            'id': supplier_id,
                            'name': item.supplier.name,
                            'short_name': item.supplier.short_name,
                        },
                        'items': [],
                        'total_items': 0,
                    }
                by_supplier[supplier_id]['items'].append({
                    'id': str(item.id),
                    'name': item.name,
                    'quantity': float(item.quantity),
                    'unit': item.unit,
                    'required_date': str(item.required_date) if item.required_date else None,
                    'purchase_status': item.purchase_status,
                    'purchase_status_display': item.get_purchase_status_display(),
                })
                by_supplier[supplier_id]['total_items'] += 1
            else:
                without_supplier.append({
                    'id': str(item.id),
                    'name': item.name,
                    'quantity': float(item.quantity),
                    'unit': item.unit,
                })
        
        return Response({
            'by_supplier': list(by_supplier.values()),
            'without_supplier': without_supplier,
            'total_purchased': purchased_items.count(),
        })
    
    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        """Get detailed project statistics."""
        project = self.get_object()
        items = project.items.all()
        
        total = items.count()
        if total == 0:
            return Response({
                'total_items': 0,
                'manufacturing': {},
                'purchase': {},
                'schedule': {},
            })
        
        today = timezone.now().date()
        
        # Manufacturing statistics
        manufacturing_stats = items.values(
            'manufacturing_status'
        ).annotate(count=Count('id'))
        
        # Purchase statistics
        purchase_stats = items.values(
            'purchase_status'
        ).annotate(count=Count('id'))
        
        # Schedule statistics
        overdue = items.exclude(
            manufacturing_status='completed'
        ).filter(planned_end__lt=today).count()
        
        due_this_week = items.exclude(
            manufacturing_status='completed'
        ).filter(
            planned_end__gte=today,
            planned_end__lte=today + timezone.timedelta(days=7)
        ).count()
        
        return Response({
            'total_items': total,
            'manufacturing': {
                item['manufacturing_status']: item['count']
                for item in manufacturing_stats
            },
            'purchase': {
                item['purchase_status']: item['count']
                for item in purchase_stats
            },
            'schedule': {
                'overdue': overdue,
                'due_this_week': due_this_week,
            },
            'progress_percent': float(project.progress_percent),
        })
    
    @action(detail=True, methods=['post'])
    def recalculate(self, request, pk=None):
        """Recalculate project progress."""
        project = self.get_object()
        
        items = project.items.all()
        total = items.count()
        
        if total == 0:
            project.progress_percent = 0
        else:
            # Calculate average progress
            avg_progress = items.aggregate(
                avg=Avg('progress_percent')
            )['avg'] or 0
            project.progress_percent = avg_progress
        
        project.last_progress_calculation = timezone.now()
        project.save(update_fields=['progress_percent', 'last_progress_calculation'])
        
        serializer = ProjectDetailSerializer(project, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Update project status."""
        project = self.get_object()
        new_status = request.data.get('status')
        
        if not new_status:
            return Response(
                {'error': 'Необходимо указать status'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        project.status = new_status
        
        # Update dates based on status
        if new_status == 'in_progress' and not project.actual_start:
            project.actual_start = timezone.now().date()
        elif new_status == 'completed' and not project.actual_end:
            project.actual_end = timezone.now().date()
        
        project.save()
        
        serializer = ProjectDetailSerializer(project, context={'request': request})
        return Response(serializer.data)


class ProjectItemViewSet(BaseModelViewSet):
    """
    ViewSet for project items.
    
    Endpoints:
    - GET /project-items/ - list all items
    - POST /project-items/ - create item
    - GET /project-items/{id}/ - get item details
    - PUT/PATCH /project-items/{id}/ - update item
    - DELETE /project-items/{id}/ - delete item
    - POST /project-items/{id}/update-progress/ - update item progress
    - POST /project-items/bulk-update/ - bulk update items
    """
    
    queryset = ProjectItem.objects.select_related(
        'project',
        'nomenclature_item',
        'nomenclature_item__catalog_category',
        'parent_item',
        'contractor',
        'supplier',
        'responsible',
        'delay_reason',
        'problem_reason',
        'manufacturing_problem_reason',
        'manufacturing_problem_subreason',
        'purchase_problem_reason',
        'purchase_problem_subreason',
    )

    pagination_class = LargeResultsSetPagination
    
    serializer_classes = {
        'list': ProjectItemListSerializer,
        'retrieve': ProjectItemDetailSerializer,
        'default': ProjectItemDetailSerializer,
    }
    
    search_fields = ['name', 'nomenclature_item__code', 'drawing_number']
    filterset_fields = [
        'project', 'category', 'manufacturing_status',
        'purchase_status', 'responsible', 'purchase_by_contractor'
    ]
    ordering_fields = ['name', 'planned_end', 'progress_percent', 'created_at']
    ordering = ['name']
    
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    
    def get_queryset(self):
        """Override to add project status filtering, is_purchased filtering and visibility filtering."""
        queryset = super().get_queryset()
        
        # Filter by project status (for procurement page)
        project_status = self.request.query_params.get('project_status')
        if project_status:
            queryset = queryset.filter(project__status=project_status)
        
        # Filter by is_purchased (computed from nomenclature_item.catalog_category.is_purchased)
        is_purchased = self.request.query_params.get('is_purchased')
        if is_purchased is not None:
            is_purchased_bool = is_purchased.lower() == 'true'
            queryset = queryset.filter(
                nomenclature_item__catalog_category__is_purchased=is_purchased_bool
            )
        
        # Filter to exclude planning stage projects
        exclude_planning = self.request.query_params.get('exclude_planning')
        if exclude_planning and exclude_planning.lower() == 'true':
            queryset = queryset.exclude(project__status='planning')
        
        # Apply visibility filtering based on user's roles
        user = self.request.user
        visibility_type = _get_user_visibility_type(user)
        if visibility_type == 'own':
            queryset = queryset.filter(responsible=user)
        elif visibility_type == 'own_and_children':
            responsible_items = queryset.filter(responsible=user)
            responsible_ids = list(responsible_items.values_list('id', flat=True))

            all_visible_ids = set(responsible_ids)

            def get_children_ids(parent_ids):
                if not parent_ids:
                    return []
                children = queryset.filter(parent_item_id__in=parent_ids)
                child_ids = list(children.values_list('id', flat=True))
                return child_ids + get_children_ids(child_ids)

            all_visible_ids.update(get_children_ids(responsible_ids))
            queryset = queryset.filter(id__in=all_visible_ids)

        # Avoid N+1 in serializer for children_count
        queryset = queryset.annotate(
            children_count=Count('children', filter=Q(children__is_active=True), distinct=True)
        )
        
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()

        def _qp_bool(name: str, default: bool = False) -> bool:
            raw = self.request.query_params.get(name)
            if raw is None:
                return default
            return str(raw).lower() in ('1', 'true', 'yes', 'y', 'on')

        # Expensive fields (can cause N+1 / heavy compute) are opt-in for list endpoints.
        context['include_purchase_order'] = _qp_bool('include_purchase_order', default=False)
        context['include_calculated_progress'] = _qp_bool('include_calculated_progress', default=False)
        return context

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Return detailed history for a project item."""
        item = self.get_object()
        history = list(item.history.all().order_by('-history_date', '-history_id')[:50])

        if not history:
            return Response([])

        responsible_ids = {getattr(h, 'responsible_id', None) for h in history}
        contractor_ids = {getattr(h, 'contractor_id', None) for h in history}
        supplier_ids = {getattr(h, 'supplier_id', None) for h in history}
        delay_reason_ids = {getattr(h, 'delay_reason_id', None) for h in history}
        problem_reason_ids = {getattr(h, 'problem_reason_id', None) for h in history}

        responsible_ids.discard(None)
        contractor_ids.discard(None)
        supplier_ids.discard(None)
        delay_reason_ids.discard(None)
        problem_reason_ids.discard(None)

        User = get_user_model()
        users_map = {
            u.id: (u.get_full_name() or u.username)
            for u in User.objects.filter(id__in=responsible_ids)
        }
        contractors_map = {c.id: c.name for c in Contractor.objects.filter(id__in=contractor_ids)}
        suppliers_map = {s.id: s.name for s in Supplier.objects.filter(id__in=supplier_ids)}
        delay_map = {d.id: d.name for d in DelayReason.objects.filter(id__in=delay_reason_ids)}
        problem_map = {p.id: p.name for p in ProblemReason.objects.filter(id__in=problem_reason_ids)}

        choices_map = {
            'manufacturing_status': dict(ProjectItem._meta.get_field('manufacturing_status').choices),
            'contractor_status': dict(ProjectItem._meta.get_field('contractor_status').choices),
            'purchase_status': dict(ProjectItem._meta.get_field('purchase_status').choices),
            'manufacturer_type': dict(ProjectItem._meta.get_field('manufacturer_type').choices),
            'material_supply_type': dict(ProjectItem._meta.get_field('material_supply_type').choices),
        }

        def format_value(field, value):
            if value is None or value == '':
                return '—'
            if field in ['planned_start', 'planned_end', 'actual_start', 'actual_end', 'required_date', 'order_date']:
                try:
                    return value.strftime('%d.%m.%Y')
                except Exception:
                    return str(value)
            if field in ['has_problem']:
                return 'Да' if value else 'Нет'
            if field in choices_map:
                return choices_map[field].get(value, value)
            if field == 'responsible_id':
                return users_map.get(value, '—')
            if field == 'contractor_id':
                return contractors_map.get(value, '—')
            if field == 'supplier_id':
                return suppliers_map.get(value, '—')
            if field == 'delay_reason_id':
                return delay_map.get(value, '—')
            if field == 'problem_reason_id':
                return problem_map.get(value, '—')
            return str(value)

        tracked_fields = [
            ('manufacturing_status', 'Статус изготовления'),
            ('contractor_status', 'Статус подрядчика'),
            ('purchase_status', 'Статус закупки'),
            ('manufacturer_type', 'Изготовитель'),
            ('contractor_id', 'Подрядчик'),
            ('material_supply_type', 'Снабжение'),
            ('responsible_id', 'Ответственный'),
            ('planned_start', 'Планируемая дата начала'),
            ('planned_end', 'Планируемая дата окончания'),
            ('actual_start', 'Фактическая дата начала'),
            ('actual_end', 'Фактическая дата окончания'),
            ('required_date', 'Требуемая дата поставки'),
            ('order_date', 'Дата оформления заказа'),
            ('delay_reason_id', 'Причина отклонения'),
            ('delay_notes', 'Комментарий по проблеме / отклонению'),
            ('notes', 'Комментарий'),
            ('has_problem', 'Есть проблема'),
            ('problem_reason_id', 'Причина проблемы'),
            ('problem_notes', 'Комментарий к проблеме'),
        ]

        data = []
        for idx, current in enumerate(history):
            previous = history[idx + 1] if idx + 1 < len(history) else None
            details = []

            if previous:
                for field, label in tracked_fields:
                    current_value = getattr(current, field, None)
                    prev_value = getattr(previous, field, None)
                    if current_value != prev_value:
                        details.append(
                            f"{label}: было «{format_value(field, prev_value)}», стало «{format_value(field, current_value)}»"
                        )
            else:
                if current.history_type == '+':
                    details.append('Создана позиция')

            if not details:
                if current.history_change_reason:
                    details = [current.history_change_reason]
                elif current.history_type == '-':
                    details = ['Позиция удалена']
                else:
                    details = ['Изменение без уточнения полей']

            data.append({
                'id': current.history_id,
                'date': current.history_date,
                'user': str(current.history_user) if current.history_user else None,
                'type': current.history_type,
                'changes': current.history_change_reason,
                'details': details,
            })

        return Response(data)
    
    def list(self, request, *args, **kwargs):
        # Update problems if project context is provided
        project_id = request.query_params.get('project')
        if project_id:
            self._update_problems(project_id)
            
        return super().list(request, *args, **kwargs)

    def _is_planning_project(self, item: ProjectItem) -> bool:
        return bool(item.project and item.project.status == ProjectStatusChoices.PLANNING)

    def _reserve_stock_for_project_item(self, item: ProjectItem):
        """Reserve available stock when project item is closed."""
        from decimal import Decimal
        from django.db.models import F, Sum
        from infrastructure.persistence.models import StockItem, StockReservation

        if item.purchase_by_contractor or not item.is_purchased:
            return

        required_qty = Decimal(str(item.quantity))
        reserved_total = StockReservation.objects.filter(
            project_item=item,
            status__in=['pending', 'confirmed']
        ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')

        need = required_qty - reserved_total
        if need <= 0:
            return

        stock_items = StockItem.objects.filter(
            nomenclature_item=item.nomenclature_item
        ).annotate(
            available=F('quantity') - F('reserved_quantity')
        ).filter(available__gt=0).order_by('-available')

        total_available = sum([s.available for s in stock_items]) if stock_items else Decimal('0')
        if total_available < need:
            raise ValueError(
                f"Недостаточно свободного остатка для перевода в «На складе». "
                f"Требуется: {required_qty} {item.unit}, доступно: {total_available} {item.unit}."
            )

        for stock_item in stock_items:
            if need <= 0:
                break
            available = stock_item.quantity - stock_item.reserved_quantity
            if available <= 0:
                continue
            reserve_qty = min(available, need)

            StockReservation.objects.create(
                stock_item=stock_item,
                project=item.project,
                project_item=item,
                quantity=reserve_qty,
                status='confirmed',
                required_date=item.required_date,
                notes=f"Резерв по проекту {item.project.name}"
            )
            stock_item.reserved_quantity += reserve_qty
            stock_item.save(update_fields=['reserved_quantity'])
            need -= reserve_qty

    def _consume_stock_for_project_item(self, item: ProjectItem, from_reserved: bool):
        """Write off stock for a purchased project item."""
        from decimal import Decimal
        from django.db.models import F, Sum
        from infrastructure.persistence.models import StockItem, StockMovement, StockReservation

        if item.purchase_by_contractor or not item.is_purchased:
            return

        need = Decimal(str(item.quantity))

        consumed_total = StockMovement.objects.filter(
            project_item=item,
            movement_type='consumption'
        ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')
        consumed_qty = abs(Decimal(str(consumed_total)))
        if consumed_qty >= need:
            return
        need -= consumed_qty

        stock_items = StockItem.objects.filter(
            nomenclature_item=item.nomenclature_item
        ).order_by('-quantity')

        reservation_qs = StockReservation.objects.filter(
            project_item=item,
            status__in=['pending', 'confirmed']
        ).select_related('stock_item').order_by('created_at')

        for stock_item in stock_items:
            if need <= 0:
                break

            if from_reserved:
                available = min(stock_item.reserved_quantity, need)
                if available <= 0:
                    continue
                stock_item.reserved_quantity -= available
            else:
                free_available = stock_item.quantity - stock_item.reserved_quantity
                available = min(free_available, need)
                if available <= 0:
                    continue

            stock_item.quantity -= available
            stock_item.save(update_fields=['quantity', 'reserved_quantity'])

            StockMovement.objects.create(
                stock_item=stock_item,
                movement_type='consumption',
                quantity=-available,
                balance_after=stock_item.quantity,
                project=item.project,
                project_item=item,
                performed_by=self.request.user,
                reason=f"Списание по проекту {item.project.name}"
            )

            if from_reserved:
                remaining_to_release = available
                for reservation in reservation_qs:
                    if remaining_to_release <= 0:
                        break
                    if reservation.stock_item_id != stock_item.id:
                        continue
                    release_qty = min(reservation.quantity, remaining_to_release)
                    reservation.quantity -= release_qty
                    if reservation.quantity <= 0:
                        reservation.status = 'released'
                    reservation.save(update_fields=['quantity', 'status'])
                    remaining_to_release -= release_qty

            need -= available

        if need > 0:
            raise ValueError(
                f"Недостаточно остатка для списания. Требуется: {item.quantity} {item.unit}."
            )

    def _restore_reserved_stock_for_project_item(self, item: ProjectItem):
        """Restore reserved stock when moving from written_off to closed."""
        from decimal import Decimal
        from django.db.models import Sum
        from django.utils import timezone
        from infrastructure.persistence.models import StockItem, StockReservation, StockMovement, Warehouse

        if item.purchase_by_contractor or not item.is_purchased:
            return

        required_qty = Decimal(str(item.quantity))
        reserved_total = StockReservation.objects.filter(
            project_item=item,
            status__in=['pending', 'confirmed']
        ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')

        need = required_qty - reserved_total
        if need <= 0:
            return

        stock_item = StockItem.objects.filter(
            nomenclature_item=item.nomenclature_item
        ).order_by('-quantity').first()

        if not stock_item:
            warehouse = Warehouse.objects.filter(is_active=True).order_by('name').first()
            if not warehouse:
                raise ValueError('Не найден активный склад для поступления.')
            stock_item = StockItem.objects.create(
                warehouse=warehouse,
                nomenclature_item=item.nomenclature_item,
                quantity=0,
                unit=item.unit or 'шт'
            )

        stock_item.quantity += need
        stock_item.reserved_quantity += need
        stock_item.save(update_fields=['quantity', 'reserved_quantity'])

        StockMovement.objects.create(
            stock_item=stock_item,
            movement_type='receipt',
            quantity=need,
            balance_after=stock_item.quantity,
            project=item.project,
            project_item=item,
            performed_by=self.request.user,
            reason='Поступление при возврате в статус «На складе»',
            notes=f'Возврат из статуса «Списано» ({timezone.now().date()})',
        )

        StockReservation.objects.create(
            stock_item=stock_item,
            project=item.project,
            project_item=item,
            quantity=need,
            status='confirmed',
            required_date=item.required_date,
            notes='Восстановленный резерв по позиции проекта',
        )

    def _validate_manufactured_completion(self, item: ProjectItem):
        """Validate that all children are completed/written off before completing manufacture."""
        stack = list(item.children.all())
        while stack:
            child = stack.pop()
            stack.extend(list(child.children.all()))

            if child.is_purchased:
                if child.purchase_status != PurchaseStatusChoices.WRITTEN_OFF:
                    raise ValueError(
                        f"Нельзя установить «Изготовлено»: закупаемый элемент «{child.name}» не списан."
                    )
            else:
                if child.manufacturing_status != ManufacturingStatusChoices.COMPLETED:
                    raise ValueError(
                        f"Нельзя установить «Изготовлено»: элемент «{child.name}» не изготовлен."
                    )

    def _release_stock_reservations(self, item: ProjectItem):
        """Release reserved stock when project item reopens."""
        from infrastructure.persistence.models import StockReservation

        reservations = StockReservation.objects.filter(
            project_item=item,
            status__in=['pending', 'confirmed']
        ).select_related('stock_item')

        for reservation in reservations:
            stock_item = reservation.stock_item
            stock_item.reserved_quantity = max(
                0, stock_item.reserved_quantity - reservation.quantity
            )
            stock_item.save(update_fields=['reserved_quantity'])
            reservation.status = 'cancelled'
            reservation.save(update_fields=['status'])

    def _apply_purchase_status_change(self, item: ProjectItem, new_status: str):
        """Apply stock reservation logic for purchase status changes."""
        old_status = item.purchase_status
        if not new_status or new_status == old_status:
            return

        if old_status == PurchaseStatusChoices.CLOSED and new_status != PurchaseStatusChoices.WRITTEN_OFF:
            raise ValueError("Из статуса «На складе» можно перейти только в «Списано»." )
        if old_status == PurchaseStatusChoices.WRITTEN_OFF and new_status != PurchaseStatusChoices.CLOSED:
            raise ValueError("Из статуса «Списано» можно перейти только в «На складе»." )

        is_planning = self._is_planning_project(item)

        # Правила изменения статуса закупки
        if is_planning:
            if new_status not in [
                PurchaseStatusChoices.WAITING_ORDER,
                PurchaseStatusChoices.CLOSED,
                PurchaseStatusChoices.WRITTEN_OFF,
            ]:
                raise ValueError(
                    "В статусе проекта «Планирование» доступны только статусы «Ожидает заказа», «На складе», «Списано»."
                )
        else:
            if old_status == PurchaseStatusChoices.IN_ORDER and new_status != old_status:
                raise ValueError(
                    "Статус «В заказе» изменяется автоматически при отмене заказа или при приёмке."
                )
            if old_status == PurchaseStatusChoices.WAITING_ORDER and new_status != old_status:
                raise ValueError(
                    "Статус «Ожидает заказа» изменяется автоматически через заказ или через резервирование/поступление."
                )

        if not is_planning:
            if new_status == PurchaseStatusChoices.CLOSED:
                if old_status == PurchaseStatusChoices.WRITTEN_OFF:
                    self._restore_reserved_stock_for_project_item(item)
                else:
                    self._reserve_stock_for_project_item(item)
            elif new_status == PurchaseStatusChoices.WRITTEN_OFF:
                from_reserved = old_status == PurchaseStatusChoices.CLOSED
                self._consume_stock_for_project_item(item, from_reserved)
            elif old_status == PurchaseStatusChoices.CLOSED and new_status in [
                PurchaseStatusChoices.WAITING_ORDER,
                PurchaseStatusChoices.IN_ORDER,
            ]:
                self._release_stock_reservations(item)

        # Sync material requirement status
        from infrastructure.persistence.models import MaterialRequirement, PurchaseOrderItem
        requirement = MaterialRequirement.objects.filter(
            project_item=item,
            is_active=True,
            deleted_at__isnull=True
        ).order_by('-created_at').first()

        if requirement:
            if new_status in [PurchaseStatusChoices.WAITING_ORDER, PurchaseStatusChoices.IN_ORDER, PurchaseStatusChoices.CLOSED, PurchaseStatusChoices.WRITTEN_OFF]:
                requirement.status = (
                    'written_off' if new_status == PurchaseStatusChoices.WRITTEN_OFF else new_status
                )

                if new_status != PurchaseStatusChoices.IN_ORDER and requirement.purchase_order:
                    PurchaseOrderItem.objects.filter(
                        order=requirement.purchase_order,
                        project_item=item,
                        nomenclature_item=item.nomenclature_item,
                    ).delete()
                    requirement.purchase_order = None

                requirement.save(update_fields=['status', 'purchase_order', 'updated_at'])

    def _update_problems(self, project_id):
        """
        Автоматическое обновление проблем (задержки, просрочки) при просмотре проекта.
        """
        from django.utils import timezone
        from django.db.models import Q
        from infrastructure.persistence.models import ProblemReason, PurchaseOrderItem
        from infrastructure.persistence.models.inventory import MaterialRequirement
        
        today = timezone.now().date()
        
        # 1. Не заказано вовремя
        # waiting_order AND today > order_by_date (с учётом legacy pending),
        # но ТОЛЬКО если нет подтверждённого заказа.
        reason_not_ordered = ProblemReason.objects.filter(code='not_ordered_on_time').first()
        if reason_not_ordered:
            waiting_items = ProjectItem.objects.filter(
                project_id=project_id,
                purchase_status__in=['waiting_order', 'pending']
            )
            for item in waiting_items:
                order_by_date = item.order_date
                if not order_by_date:
                    requirement = MaterialRequirement.objects.filter(
                        project_item_id=item.id,
                        is_active=True,
                        deleted_at__isnull=True
                    ).order_by('-created_at').first()
                    if requirement and requirement.order_by_date:
                        order_by_date = requirement.order_by_date

                has_confirmed_po = PurchaseOrderItem.objects.filter(
                    project_item_id=item.id
                ).exclude(order__status='draft').exists()

                if has_confirmed_po:
                    if item.has_problem and item.problem_reason_id == reason_not_ordered.id:
                        item.has_problem = False
                        item.problem_reason = None
                        item.save(update_fields=['has_problem', 'problem_reason'])
                    continue

                if order_by_date and today > order_by_date:
                    if not item.has_problem or item.problem_reason_id != reason_not_ordered.id:
                        item.has_problem = True
                        item.problem_reason = reason_not_ordered
                        item.save(update_fields=['has_problem', 'problem_reason'])
                else:
                    if item.has_problem and item.problem_reason_id == reason_not_ordered.id:
                        item.has_problem = False
                        item.problem_reason = None
                        item.save(update_fields=['has_problem', 'problem_reason'])

        # 2. Заказано с просрочкой / Задержка поставки
        # in_order AND order_date < order.order_date -> ordered_late
        # in_order AND today > expected_delivery_date -> delivery_delay (имеет приоритет)
        reason_ordered_late = ProblemReason.objects.filter(code='ordered_late').first()
        reason_delay = ProblemReason.objects.filter(code='delivery_delay').first()
        items_in_order = ProjectItem.objects.filter(
            project_id=project_id
        ).filter(
            Q(purchase_status__in=['in_order', 'ordered', 'pending']) |
            Q(purchase_order_items__order__status__in=['ordered', 'partially_delivered', 'closed']) |
            Q(material_requirements__purchase_order__status__in=['ordered', 'partially_delivered', 'closed'])
        ).distinct()
        for item in items_in_order:
            requirement = MaterialRequirement.objects.filter(
                project_item_id=item.id,
                is_active=True,
                deleted_at__isnull=True
            ).order_by('-created_at').first()

            po_item = (
                PurchaseOrderItem.objects.filter(project_item_id=item.id)
                .exclude(order__status='draft')
                .select_related('order')
                .order_by('-created_at')
                .first()
            )

            expected_delivery_date = None
            ordered_late = False
            order_by_date = item.order_date
            if not order_by_date and requirement and requirement.order_by_date:
                order_by_date = requirement.order_by_date
            if po_item:
                if po_item.order and po_item.order.order_date and order_by_date:
                    if po_item.order.order_date > order_by_date:
                        ordered_late = True
                expected_delivery_date = (
                    po_item.expected_delivery_date
                    or po_item.order.expected_delivery_date
                )
            elif requirement and requirement.purchase_order and requirement.purchase_order.status in ['ordered', 'partially_delivered', 'closed']:
                po = requirement.purchase_order
                if po.order_date and order_by_date and po.order_date > order_by_date:
                    ordered_late = True
                expected_delivery_date = po.expected_delivery_date
            expected_delivery_date = expected_delivery_date or item.required_date

            # Приоритет: задержка поставки
            if reason_delay and expected_delivery_date and today > expected_delivery_date:
                if not item.has_problem or item.problem_reason_id != reason_delay.id:
                    item.has_problem = True
                    item.problem_reason = reason_delay
                    item.save(update_fields=['has_problem', 'problem_reason'])
                continue

            # Заказано с просрочкой
            if reason_ordered_late and ordered_late:
                if not item.has_problem or item.problem_reason_id != reason_ordered_late.id:
                    item.has_problem = True
                    item.problem_reason = reason_ordered_late
                    item.save(update_fields=['has_problem', 'problem_reason'])
                continue

            # Нет проблемы
            if item.has_problem:
                item.has_problem = False
                item.problem_reason = None
                item.save(update_fields=['has_problem', 'problem_reason'])

        # 3. Закрытые
        ProjectItem.objects.filter(
            project_id=project_id,
            purchase_status__in=['closed', 'written_off'],
            has_problem=True
        ).update(has_problem=False)
    
    def get_serializer_class(self):
        return self.serializer_classes.get(
            self.action,
            self.serializer_classes['default']
        )

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        is_planning = self._is_planning_project(instance)
        new_status = request.data.get('purchase_status')
        if new_status:
            try:
                self._apply_purchase_status_change(instance, new_status)
            except ValueError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        new_manufacturing_status = request.data.get('manufacturing_status')
        if new_manufacturing_status == ManufacturingStatusChoices.COMPLETED and not is_planning:
            try:
                self._validate_manufactured_completion(instance)
            except ValueError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        response = super().update(request, *args, **kwargs)
        self._complete_project_if_root(instance)
        return response

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        is_planning = self._is_planning_project(instance)
        new_status = request.data.get('purchase_status')
        if new_status:
            try:
                self._apply_purchase_status_change(instance, new_status)
            except ValueError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        new_manufacturing_status = request.data.get('manufacturing_status')
        if new_manufacturing_status == ManufacturingStatusChoices.COMPLETED and not is_planning:
            try:
                self._validate_manufactured_completion(instance)
            except ValueError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        response = super().partial_update(request, *args, **kwargs)
        self._complete_project_if_root(instance)
        return response

    def _complete_project_if_root(self, item: ProjectItem):
        """If root item completed, mark project as completed."""
        from django.utils import timezone

        item.refresh_from_db()
        if item.parent_item_id is not None:
            return
        if item.manufacturing_status != ManufacturingStatusChoices.COMPLETED:
            return
        project = item.project
        if project.status != ProjectStatusChoices.COMPLETED:
            project.status = ProjectStatusChoices.COMPLETED
            if not project.actual_end:
                project.actual_end = timezone.now().date()
            project.save(update_fields=['status', 'actual_end'])

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        from infrastructure.persistence.models import MaterialRequirement
        from infrastructure.persistence.models import ProjectItem, PurchaseOrderItem, StockReservation, StockItem, StockMovement, Warehouse
        from django.db.models.deletion import ProtectedError
        from django.utils import timezone
        from decimal import Decimal

        # Собрать все дочерние элементы (включая текущий)
        item_ids = [instance.id]
        stack = [instance.id]
        while stack:
            parent_id = stack.pop()
            child_ids = list(
                ProjectItem.objects.filter(parent_item_id=parent_id).values_list('id', flat=True)
            )
            if child_ids:
                item_ids.extend(child_ids)
                stack.extend(child_ids)

        items = list(ProjectItem.objects.filter(id__in=item_ids))

        for item in items:
            # Удалить связанные потребности
            requirements = MaterialRequirement.objects.filter(
                project_item=item,
                is_active=True,
                deleted_at__isnull=True
            )

            if item.is_purchased:
                # Логика по статусам закупки
                if item.purchase_status == PurchaseStatusChoices.IN_ORDER:
                    try:
                        PurchaseOrderItem.objects.filter(project_item=item).delete()
                    except ProtectedError:
                        return Response(
                            {'error': 'Нельзя удалить позицию: по ней уже есть приёмка.'},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                if item.purchase_status == PurchaseStatusChoices.CLOSED:
                    # Освободить резерв
                    reservations = StockReservation.objects.filter(
                        project_item=item,
                        status__in=['pending', 'confirmed']
                    ).select_related('stock_item')
                    for reservation in reservations:
                        stock_item = reservation.stock_item
                        stock_item.reserved_quantity = max(
                            0, stock_item.reserved_quantity - reservation.quantity
                        )
                        stock_item.save(update_fields=['reserved_quantity'])
                        reservation.status = 'cancelled'
                        reservation.save(update_fields=['status'])

                if item.purchase_status == PurchaseStatusChoices.WRITTEN_OFF:
                    # Вернуть списанное количество в свободный остаток
                    restore_qty = Decimal(str(item.quantity))
                    stock_item = StockItem.objects.filter(
                        nomenclature_item=item.nomenclature_item
                    ).order_by('-quantity').first()

                    if not stock_item:
                        warehouse = Warehouse.objects.filter(is_active=True).order_by('name').first()
                        if warehouse:
                            stock_item = StockItem.objects.create(
                                warehouse=warehouse,
                                nomenclature_item=item.nomenclature_item,
                                quantity=0,
                                unit=item.unit or 'шт'
                            )

                    if stock_item:
                        stock_item.quantity += restore_qty
                        stock_item.save(update_fields=['quantity'])

                        StockMovement.objects.create(
                            stock_item=stock_item,
                            movement_type='receipt',
                            quantity=restore_qty,
                            balance_after=stock_item.quantity,
                            project=item.project,
                            project_item=item,
                            performed_by=request.user,
                            reason='Возврат списанной позиции при удалении из проекта',
                            notes=f'Удаление позиции проекта ({timezone.now().date()})',
                        )

            for req in requirements:
                req.soft_delete(user=request.user)

        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def reserve_stock(self, request, pk=None):
        """
        Резервирование существующих остатков по закупаемой позиции проекта.
        Ожидает payload: { allocations: [{ stock_item_id, quantity }] }
        """
        from decimal import Decimal
        from django.db import transaction
        from infrastructure.persistence.models import StockItem, StockReservation, MaterialRequirement

        item = self.get_object()

        if self._is_planning_project(item):
            return Response({'error': 'Резервирование доступно только для проектов в работе.'}, status=status.HTTP_400_BAD_REQUEST)

        allocations = request.data.get('allocations') or []
        if not allocations:
            return Response({'error': 'Не указаны позиции для резервирования.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            allocations = [
                {
                    'stock_item_id': a.get('stock_item_id'),
                    'quantity': Decimal(str(a.get('quantity'))),
                }
                for a in allocations
            ]
        except Exception:
            return Response({'error': 'Некорректные данные резервирования.'}, status=status.HTTP_400_BAD_REQUEST)

        total_qty = sum([a['quantity'] for a in allocations if a.get('quantity')])
        required_qty = Decimal(str(item.quantity))
        if total_qty != required_qty:
            return Response(
                {'error': f'Суммарный резерв должен быть равен {required_qty}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            for allocation in allocations:
                stock_item = StockItem.objects.select_for_update().filter(id=allocation['stock_item_id']).first()
                if not stock_item:
                    return Response({'error': 'Складская позиция не найдена.'}, status=status.HTTP_404_NOT_FOUND)
                if stock_item.nomenclature_item_id != item.nomenclature_item_id:
                    return Response({'error': 'Номенклатура не совпадает с позицией проекта.'}, status=status.HTTP_400_BAD_REQUEST)
                if stock_item.available_quantity < allocation['quantity']:
                    return Response({'error': 'Недостаточно свободного остатка для резерва.'}, status=status.HTTP_400_BAD_REQUEST)

                StockReservation.objects.create(
                    stock_item=stock_item,
                    project=item.project,
                    project_item=item,
                    quantity=allocation['quantity'],
                    status='confirmed',
                    required_date=item.required_date,
                    notes='Резерв по позиции проекта',
                )
                stock_item.reserved_quantity += allocation['quantity']
                stock_item.save(update_fields=['reserved_quantity'])

            item.purchase_status = PurchaseStatusChoices.CLOSED
            if not item.actual_start:
                item.actual_start = item.order_date or timezone.now().date()
            item.actual_end = timezone.now().date()
            item.save(update_fields=['purchase_status', 'actual_start', 'actual_end', 'updated_at'])

            requirement = MaterialRequirement.objects.filter(
                project_item=item,
                is_active=True,
                deleted_at__isnull=True
            ).order_by('-created_at').first()
            if requirement:
                requirement.status = 'closed'
                requirement.save(update_fields=['status', 'updated_at'])

        return Response({'success': True, 'message': 'Резерв создан и позиция переведена в статус «На складе».',})

    @action(detail=True, methods=['post'])
    def receive_and_close(self, request, pk=None):
        """
        Оформить поступление на склад и закрыть позицию проекта.
        Ожидает payload: { allocations: [{ warehouse_id, quantity }] }
        """
        from decimal import Decimal
        from django.db import transaction
        from django.utils import timezone
        from infrastructure.persistence.models import StockItem, StockMovement, StockReservation, MaterialRequirement

        item = self.get_object()

        if self._is_planning_project(item):
            return Response({'error': 'Поступление доступно только для проектов в работе.'}, status=status.HTTP_400_BAD_REQUEST)

        allocations = request.data.get('allocations') or []
        if not allocations:
            return Response({'error': 'Не указаны склады для поступления.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            allocations = [
                {
                    'warehouse_id': a.get('warehouse_id'),
                    'quantity': Decimal(str(a.get('quantity'))),
                }
                for a in allocations
            ]
        except Exception:
            return Response({'error': 'Некорректные данные поступления.'}, status=status.HTTP_400_BAD_REQUEST)

        total_qty = sum([a['quantity'] for a in allocations if a.get('quantity')])
        required_qty = Decimal(str(item.quantity))
        if total_qty != required_qty:
            return Response(
                {'error': f'Суммарное поступление должно быть равно {required_qty}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            for allocation in allocations:
                stock_item, _ = StockItem.objects.get_or_create(
                    warehouse_id=allocation['warehouse_id'],
                    nomenclature_item_id=item.nomenclature_item_id,
                    defaults={
                        'quantity': 0,
                        'unit': item.unit or 'шт',
                    }
                )

                stock_item.quantity += allocation['quantity']
                stock_item.save(update_fields=['quantity'])

                StockMovement.objects.create(
                    stock_item=stock_item,
                    movement_type='receipt',
                    quantity=allocation['quantity'],
                    balance_after=stock_item.quantity,
                    project=item.project,
                    project_item=item,
                    performed_by=request.user,
                    reason='Поступление по закрытию позиции проекта',
                    notes=f'Поступление при переводе позиции в статус «На складе» ({timezone.now().date()})',
                )

                StockReservation.objects.create(
                    stock_item=stock_item,
                    project=item.project,
                    project_item=item,
                    quantity=allocation['quantity'],
                    status='confirmed',
                    required_date=item.required_date,
                    notes='Резерв по позиции проекта',
                )
                stock_item.reserved_quantity += allocation['quantity']
                stock_item.save(update_fields=['reserved_quantity'])

            item.purchase_status = PurchaseStatusChoices.CLOSED
            if not item.actual_start:
                item.actual_start = item.order_date or timezone.now().date()
            item.actual_end = timezone.now().date()
            item.save(update_fields=['purchase_status', 'actual_start', 'actual_end', 'updated_at'])

            requirement = MaterialRequirement.objects.filter(
                project_item=item,
                is_active=True,
                deleted_at__isnull=True
            ).order_by('-created_at').first()
            if requirement:
                requirement.status = 'closed'
                requirement.save(update_fields=['status', 'updated_at'])

        return Response({'success': True, 'message': 'Поступление оформлено и позиция переведена в статус «На складе».',})

    @action(detail=True, methods=['get'])
    def available_children(self, request, pk=None):
        """
        Get available child nomenclature items from project BOM for this parent item.
        """
        parent_item = self.get_object()
        parent_nomenclature = parent_item.nomenclature_item

        if not parent_nomenclature or not parent_nomenclature.catalog_category:
            return Response({'items': []})

        allowed_categories = parent_nomenclature.catalog_category.allowed_children.filter(is_active=True)
        if not allowed_categories.exists():
            return Response({'items': []})

        category_filter = request.query_params.get('category')
        if category_filter:
            allowed_categories = allowed_categories.filter(id=category_filter)

        child_items = NomenclatureItem.objects.filter(
            catalog_category__in=allowed_categories,
            is_active=True
        ).select_related('catalog_category')

        serializer = NomenclatureMinimalSerializer(child_items, many=True, context={'request': request})
        return Response({'items': serializer.data})

    @action(detail=True, methods=['post'])
    def add_child(self, request, pk=None):
        """
        Add a child ProjectItem under the specified parent item.
        Automatically calculates dates based on parent's dates.
        """
        from datetime import timedelta
        
        parent_item = self.get_object()
        nomenclature_id = request.data.get('nomenclature_item')
        quantity = request.data.get('quantity') or 1

        if not nomenclature_id:
            return Response({'error': 'nomenclature_item is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            child_nomenclature = NomenclatureItem.objects.select_related('catalog_category').get(id=nomenclature_id)
        except NomenclatureItem.DoesNotExist:
            return Response({'error': 'nomenclature_item not found'}, status=status.HTTP_404_NOT_FOUND)

        if not parent_item.nomenclature_item or not parent_item.nomenclature_item.catalog_category:
            return Response({'error': 'parent catalog category not set'}, status=status.HTTP_400_BAD_REQUEST)

        parent_category = parent_item.nomenclature_item.catalog_category
        allowed_categories = parent_category.allowed_children.filter(is_active=True)

        if not child_nomenclature.catalog_category or not allowed_categories.filter(id=child_nomenclature.catalog_category_id).exists():
            return Response({'error': 'child category is not allowed for this parent'}, status=status.HTTP_400_BAD_REQUEST)

        category_code = child_nomenclature.catalog_category.code if child_nomenclature.catalog_category else 'material'
        is_purchased = bool(child_nomenclature.catalog_category and child_nomenclature.catalog_category.is_purchased)

        # Determine position among siblings
        max_position = parent_item.children.aggregate(max_pos=Max('position')).get('max_pos') or 0
        position = max_position + 1
        
        # Determine next item number (Project global)
        # item_number is assigned automatically by ProjectItem.save()

        # Calculate dates automatically based on parent's planned_start
        planned_end = None
        required_date = None
        order_date = None
        
        if parent_item.planned_start:
            if is_purchased:
                # Purchased items: required_date = parent_start - 1 day
                planned_end = parent_item.planned_start - timedelta(days=1)
                required_date = planned_end
                
                # Calculate order_date based on supplier lead time (will be recalculated after supplier assignment)
                order_date = required_date - timedelta(days=14)  # Default 14 days
            else:
                # Manufactured items: planned_end = parent_start - 1 day
                planned_end = parent_item.planned_start - timedelta(days=1)

        project_item = ProjectItem.objects.create(
            project=parent_item.project,
            nomenclature_item=child_nomenclature,
            parent_item=parent_item,
            category=category_code,
            name=child_nomenclature.name,
            drawing_number=child_nomenclature.drawing_number or '',
            quantity=quantity,
            unit=child_nomenclature.unit or 'шт',
            position=position,
            manufacturing_status='not_started',
            purchase_status=PurchaseStatusChoices.WAITING_ORDER if is_purchased else PurchaseStatusChoices.CLOSED,
            planned_end=planned_end,
            required_date=required_date,
            order_date=order_date,
            # Copy from parent: responsible, contractor, material_supply_type
            responsible=parent_item.responsible,
            contractor=parent_item.contractor if not is_purchased else None,
            manufacturer_type=parent_item.manufacturer_type if not is_purchased else 'internal',
            material_supply_type=parent_item.material_supply_type if not is_purchased else 'our_supply',
        )

        # Apply default supplier for purchased items and recalculate order_date
        if is_purchased:
            primary_supplier = NomenclatureSupplier.objects.filter(
                nomenclature_item=child_nomenclature,
                is_primary=True,
                is_active=True
            ).select_related('supplier').first()
            if primary_supplier:
                project_item.supplier = primary_supplier.supplier
                project_item.article_number = primary_supplier.supplier_article or ''
                
                # Recalculate order_date based on actual supplier lead time
                if required_date and primary_supplier.delivery_days:
                    project_item.order_date = required_date - timedelta(days=primary_supplier.delivery_days)
                
                project_item.save(update_fields=['supplier', 'article_number', 'order_date'])
        else:
            def expand_child_bom(parent_project_item, parent_nomenclature, parent_planned_start):
                bom = BOMStructure.objects.filter(
                    root_item=parent_nomenclature,
                    is_active=True
                ).first()
                if not bom:
                    return

                bom_items = BOMItem.objects.filter(
                    bom=bom,
                    parent_item=parent_nomenclature
                ).select_related(
                    'child_item',
                    'child_item__catalog_category'
                ).order_by('position')

                for idx, bom_item in enumerate(bom_items):
                    child_item = bom_item.child_item
                    child_category_code = child_item.catalog_category.code if child_item.catalog_category else 'material'
                    child_is_purchased = bool(child_item.catalog_category and child_item.catalog_category.is_purchased)
                    
                    # Calculate dates for nested child
                    child_planned_end = None
                    child_required_date = None
                    child_order_date = None
                    
                    # For nested items, use parent_project_item's planned_start if available
                    nested_parent_start = parent_planned_start
                    if nested_parent_start:
                        if child_is_purchased:
                            child_planned_end = nested_parent_start - timedelta(days=1)
                            child_required_date = child_planned_end
                            child_order_date = child_required_date - timedelta(days=14)
                        else:
                            child_planned_end = nested_parent_start - timedelta(days=1)

                    child_project_item = ProjectItem.objects.create(
                        project=parent_project_item.project,
                        nomenclature_item=child_item,
                        parent_item=parent_project_item,
                        category=child_category_code,
                        name=child_item.name,
                        drawing_number=child_item.drawing_number or '',
                        quantity=float(bom_item.quantity),
                        unit=child_item.unit or 'шт',
                        position=idx + 1,
                        manufacturing_status='not_started',
                        purchase_status=PurchaseStatusChoices.WAITING_ORDER if child_is_purchased else PurchaseStatusChoices.CLOSED,
                        planned_end=child_planned_end,
                        required_date=child_required_date,
                        order_date=child_order_date,
                        # Copy from parent: responsible, contractor, material_supply_type
                        responsible=parent_project_item.responsible,
                        contractor=parent_project_item.contractor if not child_is_purchased else None,
                        manufacturer_type=parent_project_item.manufacturer_type if not child_is_purchased else 'internal',
                        material_supply_type=parent_project_item.material_supply_type if not child_is_purchased else 'our_supply',
                    )

                    if child_is_purchased:
                        primary_supplier = NomenclatureSupplier.objects.filter(
                            nomenclature_item=child_item,
                            is_primary=True,
                            is_active=True
                        ).select_related('supplier').first()
                        if primary_supplier:
                            child_project_item.supplier = primary_supplier.supplier
                            child_project_item.article_number = primary_supplier.supplier_article or ''
                            
                            # Recalculate order_date based on supplier lead time
                            if child_required_date and primary_supplier.delivery_days:
                                child_project_item.order_date = child_required_date - timedelta(days=primary_supplier.delivery_days)
                            
                            child_project_item.save(update_fields=['supplier', 'article_number', 'order_date'])
                        continue

                    # For manufactured children, set planned_start if parent has dates
                    if child_planned_end and not child_is_purchased:
                        expand_child_bom(child_project_item, child_item, child_planned_end)
                    else:
                        expand_child_bom(child_project_item, child_item, None)

            # Pass parent's planned_start (or planned_end as the target) for recursive date calculation
            expand_child_bom(project_item, child_nomenclature, project_item.planned_end)

        serializer = ProjectItemDetailSerializer(project_item, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def update_progress(self, request, pk=None):
        """Update item progress."""
        item = self.get_object()
        serializer = ProjectProgressUpdateSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        is_planning = self._is_planning_project(item)
        
        item.progress_percent = data['progress_percent']
        
        if 'manufacturing_status' in data:
            if data['manufacturing_status'] == ManufacturingStatusChoices.COMPLETED:
                if not is_planning:
                    try:
                        self._validate_manufactured_completion(item)
                        self._consume_manufactured_children(item)
                    except ValueError as e:
                        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            item.manufacturing_status = data['manufacturing_status']
        if 'purchase_status' in data:
            try:
                self._apply_purchase_status_change(item, data['purchase_status'])
            except ValueError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            item.purchase_status = data['purchase_status']
        
        # Update actual dates
        if item.progress_percent > 0 and not item.actual_start:
            item.actual_start = timezone.now().date()
        if item.progress_percent >= 100 and not item.actual_end:
            item.actual_end = timezone.now().date()
        
        item.save()
        
        serializer = ProjectItemDetailSerializer(item, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """Bulk update multiple items."""
        serializer = ProjectBulkProgressUpdateSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        updates = serializer.validated_data['updates']
        updated_count = 0
        
        with transaction.atomic():
            for update in updates:
                try:
                    item = ProjectItem.objects.get(id=update['item_id'])
                    is_planning = self._is_planning_project(item)
                    item.progress_percent = update['progress_percent']
                    
                    if 'manufacturing_status' in update:
                        if update['manufacturing_status'] == ManufacturingStatusChoices.COMPLETED:
                            if not is_planning:
                                self._validate_manufactured_completion(item)
                                self._consume_manufactured_children(item)
                        item.manufacturing_status = update['manufacturing_status']
                    if 'purchase_status' in update:
                        self._apply_purchase_status_change(item, update['purchase_status'])
                        item.purchase_status = update['purchase_status']
                    
                    item.save()
                    updated_count += 1
                except ProjectItem.DoesNotExist:
                    continue
        
        return Response({
            'message': f'Обновлено {updated_count} позиций',
            'updated_count': updated_count,
        })
    
    @action(detail=False, methods=['get'])
    def by_project(self, request):
        """Get all items for a specific project."""
        project_id = request.query_params.get('project_id')
        if not project_id:
            return Response(
                {'error': 'Необходимо указать project_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        items = self.get_queryset().filter(project_id=project_id)
        serializer = ProjectItemListSerializer(items, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def overdue(self, request):
        """Get overdue items."""
        project_id = request.query_params.get('project_id')
        today = timezone.now().date()
        
        items = self.get_queryset().exclude(
            manufacturing_status='completed'
        ).filter(planned_end__lt=today)
        
        if project_id:
            items = items.filter(project_id=project_id)
        
        serializer = ProjectItemListSerializer(items, many=True)
        return Response(serializer.data)
