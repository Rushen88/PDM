"""
BOM Views.

API views for Bill of Materials structures.
"""

from rest_framework import status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction

from infrastructure.persistence.models import (
    BOMStructure,
    BOMItem,
)
from ..serializers.bom import (
    BOMStructureListSerializer,
    BOMStructureDetailSerializer,
    BOMStructureTreeSerializer,
    BOMItemSerializer,
    BOMItemTreeSerializer,
)
from .base import BaseModelViewSet


class BOMStructureViewSet(BaseModelViewSet):
    """
    ViewSet for BOM structures.
    
    Endpoints:
    - GET /bom/ - list all BOMs
    - POST /bom/ - create BOM
    - GET /bom/{id}/ - get BOM details
    - PUT/PATCH /bom/{id}/ - update BOM
    - DELETE /bom/{id}/ - soft delete BOM
    - GET /bom/{id}/tree/ - get BOM as tree
    - POST /bom/{id}/lock/ - lock BOM
    - POST /bom/{id}/unlock/ - unlock BOM
    - POST /bom/{id}/clone/ - clone BOM
    """
    
    queryset = BOMStructure.objects.select_related(
        'root_item'
    ).prefetch_related('items').filter(is_active=True)
    
    serializer_classes = {
        'list': BOMStructureListSerializer,
        'retrieve': BOMStructureDetailSerializer,
        'tree': BOMStructureTreeSerializer,
        'default': BOMStructureDetailSerializer,
    }
    
    search_fields = ['name', 'root_item__name', 'root_item__code']
    filterset_fields = ['is_active', 'is_locked', 'root_category', 'root_item']
    ordering_fields = ['name', 'created_at', 'current_version']
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
    
    @action(detail=True, methods=['get'])
    def tree(self, request, pk=None):
        """Get BOM as hierarchical tree."""
        bom = self.get_object()
        serializer = BOMStructureTreeSerializer(bom, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        """Lock BOM for editing."""
        bom = self.get_object()
        
        if bom.is_locked:
            return Response(
                {'error': 'BOM уже заблокирована'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        bom.is_locked = True
        bom.save(update_fields=['is_locked'])
        
        return Response({'message': 'BOM заблокирована'})
    
    @action(detail=True, methods=['post'])
    def unlock(self, request, pk=None):
        """Unlock BOM for editing."""
        bom = self.get_object()
        
        if not bom.is_locked:
            return Response(
                {'error': 'BOM не заблокирована'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        bom.is_locked = False
        bom.save(update_fields=['is_locked'])
        
        return Response({'message': 'BOM разблокирована'})
    
    @action(detail=True, methods=['post'])
    def increment_version(self, request, pk=None):
        """Increment BOM version."""
        bom = self.get_object()
        bom.current_version += 1
        bom.save(update_fields=['current_version'])
        
        serializer = BOMStructureDetailSerializer(bom, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def clone(self, request, pk=None):
        """Clone BOM to a new BOM."""
        source_bom = self.get_object()
        new_name = request.data.get('name')
        
        if not new_name:
            return Response(
                {'error': 'Необходимо указать name'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        with transaction.atomic():
            # Create new BOM
            new_bom = BOMStructure.objects.create(
                name=new_name,
                description=f"Копия: {source_bom.name}. {source_bom.description or ''}",
                root_item=source_bom.root_item,
                root_category=source_bom.root_category,
                current_version=1,
                is_active=True,
                is_locked=False,
            )
            
            # Clone items
            items_map = {}  # old_id -> new_item
            
            # First pass: create all items without parent references
            for item in source_bom.items.all():
                new_item = BOMItem.objects.create(
                    bom=new_bom,
                    child_item=item.child_item,
                    child_category=item.child_category,
                    quantity=item.quantity,
                    unit=item.unit,
                    position=item.position,
                    drawing_number_override=item.drawing_number_override,
                    notes=item.notes,
                )
                items_map[item.id] = new_item
            
            # Second pass: set parent references
            for old_item in source_bom.items.filter(parent_item__isnull=False):
                new_item = items_map[old_item.id]
                # Find new parent by matching child_item
                old_parent = old_item.parent_item
                for oi, ni in items_map.items():
                    source_item = source_bom.items.get(id=oi)
                    if source_item.child_item_id == old_parent.child_item_id:
                        new_item.parent_item_id = source_item.child_item_id
                        new_item.save(update_fields=['parent_item'])
                        break
        
        serializer = BOMStructureDetailSerializer(new_bom, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class BOMItemViewSet(BaseModelViewSet):
    """
    ViewSet for BOM items.
    
    Endpoints:
    - GET /bom-items/ - list all items
    - POST /bom-items/ - create item
    - GET /bom-items/{id}/ - get item details
    - PUT/PATCH /bom-items/{id}/ - update item
    - DELETE /bom-items/{id}/ - delete item
    """
    
    queryset = BOMItem.objects.select_related(
        'bom', 'child_item', 'parent_item'
    )
    serializer_class = BOMItemSerializer
    
    search_fields = ['child_item__code', 'child_item__name']
    filterset_fields = ['bom', 'child_category']
    ordering_fields = ['position', 'created_at']
    ordering = ['position']
    
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    
    @action(detail=False, methods=['get'])
    def by_bom(self, request):
        """Get all items for a specific BOM."""
        bom_id = request.query_params.get('bom_id')
        if not bom_id:
            return Response(
                {'error': 'Необходимо указать bom_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        items = self.get_queryset().filter(bom_id=bom_id)
        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)
