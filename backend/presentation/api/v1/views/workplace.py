"""
Workplace Views.

API views for employee workplace - the heart of ERP operational activity.
Shows items where current user is responsible, with statistics, problems, and deadlines.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Q, Count, Case, When, Value, CharField, F, Prefetch
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from infrastructure.persistence.models import (
    Project,
    ProjectItem,
    PurchaseStatusChoices,
    ManufacturingStatusChoices,
)
from ..serializers.project import ProjectItemListSerializer


class WorkplaceViewSet(viewsets.ViewSet):
    """
    ViewSet for employee workplace.
    
    This is the operational center for production/procurement staff.
    Shows only items where current user is responsible.
    
    Endpoints:
    - GET /workplace/my-items/ - all items where user is responsible
    - GET /workplace/dashboard/ - dashboard statistics and problem items
    - GET /workplace/manufacturing/ - manufactured items only
    - GET /workplace/procurement/ - purchased items only
    - GET /workplace/problems/ - items with problems/overdue
    - GET /workplace/deadlines/ - upcoming deadlines
    """
    
    permission_classes = [IsAuthenticated]
    
    def _get_user_responsible_items_qs(self, user, include_children_items=True):
        """
        Get queryset of all items where user is responsible.
        
        If include_children_items=True, also include child items under 
        the items where user is responsible (even if children have different responsible).
        """
        base_qs = ProjectItem.objects.filter(
            is_active=True,
            project__is_active=True,
        ).select_related(
            'project',
            'nomenclature_item',
            'nomenclature_item__catalog_category',
            'contractor',
            'supplier',
            'responsible',
            'delay_reason',
            'problem_reason',
            'manufacturing_problem_reason',
            'manufacturing_problem_subreason',
            'purchase_problem_reason',
            'purchase_problem_subreason',
            'parent_item',
        )
        
        # Get items where user is directly responsible
        direct_items = base_qs.filter(responsible=user)
        
        if not include_children_items:
            return direct_items
        
        # Collect all descendants in-memory to avoid iterative DB queries.
        direct_rows = list(direct_items.values_list('id', 'project_id'))
        if not direct_rows:
            return base_qs.none()

        responsible_item_ids = {row[0] for row in direct_rows}
        project_ids = {row[1] for row in direct_rows}

        rel_rows = list(
            ProjectItem.objects.filter(
                is_active=True,
                project__is_active=True,
                project_id__in=project_ids,
            ).values_list('id', 'parent_item_id')
        )

        children_by_parent = {}
        for child_id, parent_id in rel_rows:
            children_by_parent.setdefault(parent_id, []).append(child_id)

        all_item_ids = set(responsible_item_ids)
        stack = list(responsible_item_ids)
        while stack:
            parent_id = stack.pop()
            for child_id in children_by_parent.get(parent_id, []):
                if child_id in all_item_ids:
                    continue
                all_item_ids.add(child_id)
                stack.append(child_id)

        return base_qs.filter(id__in=all_item_ids)
    
    def _get_item_type(self, item):
        """Determine if item is manufactured or purchased."""
        if item.nomenclature_item and item.nomenclature_item.catalog_category:
            return 'purchased' if item.nomenclature_item.catalog_category.is_purchased else 'manufactured'
        return 'manufactured'
    
    def _is_overdue(self, item):
        """Check if item is overdue."""
        today = date.today()
        item_type = self._get_item_type(item)
        
        if item_type == 'purchased':
            # For purchased: check if required_date is past and not delivered
            if item.purchase_status not in ['closed', 'written_off']:
                if item.required_date and item.required_date < today:
                    return True
                # Check if order should have been placed
                if item.order_date and item.order_date < today and item.purchase_status == 'waiting_order':
                    return True
        else:
            # For manufactured: check planned dates
            if item.manufacturing_status not in ['completed']:
                if item.planned_end and item.planned_end < today:
                    return True
                if item.planned_start and item.planned_start < today and not item.actual_start:
                    return True
        
        return False
    
    def _has_problem(self, item):
        """Check if item has any problem."""
        return (
            item.has_problem
            or item.delay_reason_id is not None
            or item.manufacturing_problem_reason_id is not None
            or item.purchase_problem_reason_id is not None
        )

    def _get_problem_deviation_fields(self, item):
        """Get current 'Проблема/отклонение' reason/subreason/notes for an item.

        Preferred source: manufacturing/purchase problem analytics fields.
        Fallback: legacy delay_reason/delay_notes.
        """
        item_type = self._get_item_type(item)

        if item_type == 'purchased':
            reason_obj = getattr(item, 'purchase_problem_reason', None)
            subreason_obj = getattr(item, 'purchase_problem_subreason', None)
        else:
            reason_obj = getattr(item, 'manufacturing_problem_reason', None)
            subreason_obj = getattr(item, 'manufacturing_problem_subreason', None)

        reason = reason_obj.name if reason_obj else None
        subreason = subreason_obj.name if subreason_obj else None

        # comment for problem/deviation is stored in delay_notes (per current UI)
        notes = (item.delay_notes or '')

        if not reason:
            # Fallback to legacy delay reason
            reason = item.delay_reason.name if item.delay_reason else None

        return {
            'problem_deviation_reason': reason,
            'problem_deviation_subreason': subreason,
            'problem_deviation_notes': notes,
        }
    
    def _get_problem_type(self, item):
        """Determine problem type for the item."""
        today = date.today()
        item_type = self._get_item_type(item)
        
        problems = []
        
        if item_type == 'manufactured':
            # Work should have started but didn't
            if item.planned_start and item.planned_start < today and not item.actual_start:
                if item.manufacturing_status == 'not_started':
                    problems.append('work_not_started')
            
            # Work should have finished but didn't
            if item.planned_end and item.planned_end < today:
                if item.manufacturing_status not in ['completed']:
                    problems.append('work_not_completed')
        else:
            # Order should have been placed
            if item.order_date and item.order_date < today:
                if item.purchase_status == 'waiting_order':
                    problems.append('order_not_placed')
            
            # Item should have been delivered
            if item.required_date and item.required_date < today:
                if item.purchase_status not in ['closed', 'written_off']:
                    problems.append('not_delivered')
        
        if item.has_problem:
            problems.append('has_problem_flag')
        
        # Keep legacy identifier for UI compatibility: treat it as "has problem/deviation reason"
        if (
            item.delay_reason_id
            or item.manufacturing_problem_reason_id
            or item.purchase_problem_reason_id
        ):
            problems.append('has_delay_reason')
        
        return problems
    
    @action(detail=False, methods=['get'], url_path='my-items')
    def my_items(self, request):
        """
        Get all items where current user is responsible.
        Returns full tree structure for proper hierarchy display.
        """
        user = request.user
        items = self._get_user_responsible_items_qs(user)
        
        # Apply filters if provided
        project_id = request.query_params.get('project')
        if project_id:
            items = items.filter(project_id=project_id)
        
        item_type = request.query_params.get('type')  # 'manufactured' or 'purchased'
        if item_type == 'manufactured':
            items = items.filter(
                nomenclature_item__catalog_category__is_purchased=False
            )
        elif item_type == 'purchased':
            items = items.filter(
                nomenclature_item__catalog_category__is_purchased=True
            )
        
        serializer = ProjectItemListSerializer(
            items,
            many=True,
            context={
                'request': request,
                # Speed-first defaults for workplace
                'include_purchase_order': False,
                'include_calculated_progress': True,
            },
        )
        return Response({
            'count': items.count(),
            'results': serializer.data,
        })
    
    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard(self, request):
        """
        Get dashboard data for workplace.
        
        Returns:
        - manufacturing_summary: stats for manufactured items
        - procurement_summary: stats for purchased items
        - problems: list of items with problems
        - upcoming_deadlines: items with deadlines in next N days
        """
        user = request.user
        days_ahead = int(request.query_params.get('days_ahead', 14))
        today = date.today()
        deadline_threshold = today + timedelta(days=days_ahead)
        
        items = list(self._get_user_responsible_items_qs(user, include_children_items=True))
        
        # Separate by type
        manufactured_items = []
        purchased_items = []
        
        for item in items:
            if self._get_item_type(item) == 'purchased':
                purchased_items.append(item)
            else:
                manufactured_items.append(item)
        
        # Manufacturing statistics
        manufacturing_stats = {
            'total': len(manufactured_items),
            'not_started': sum(1 for i in manufactured_items if i.manufacturing_status == 'not_started'),
            'in_progress': sum(1 for i in manufactured_items if i.manufacturing_status == 'in_progress'),
            'completed': sum(1 for i in manufactured_items if i.manufacturing_status == 'completed'),
            'suspended': sum(1 for i in manufactured_items if i.manufacturing_status == 'suspended'),
            'internal': sum(1 for i in manufactured_items if i.manufacturer_type == 'internal'),
            'contractor': sum(1 for i in manufactured_items if i.manufacturer_type == 'contractor'),
        }
        
        # Procurement statistics
        procurement_stats = {
            'total': len(purchased_items),
            'waiting_order': sum(1 for i in purchased_items if i.purchase_status == 'waiting_order'),
            'in_order': sum(1 for i in purchased_items if i.purchase_status == 'in_order'),
            'closed': sum(1 for i in purchased_items if i.purchase_status == 'closed'),
            'written_off': sum(1 for i in purchased_items if i.purchase_status == 'written_off'),
        }
        
        # Problem items
        problem_items = []
        for item in items:
            problems = self._get_problem_type(item)
            if problems:
                problem_deviation = self._get_problem_deviation_fields(item)
                problem_items.append({
                    'id': str(item.id),
                    'item_number': item.item_number,
                    'name': item.name,
                    'project_id': str(item.project_id),
                    'project_name': item.project.name if item.project else None,
                    'type': self._get_item_type(item),
                    'problems': problems,
                    'delay_reason': item.delay_reason.name if item.delay_reason else None,
                    'delay_notes': item.delay_notes,
                    'problem_reason': item.problem_reason.name if item.problem_reason else None,
                    'problem_notes': item.problem_notes,
                    **problem_deviation,
                    'planned_start': item.planned_start.isoformat() if item.planned_start else None,
                    'planned_end': item.planned_end.isoformat() if item.planned_end else None,
                    'actual_start': item.actual_start.isoformat() if item.actual_start else None,
                    'actual_end': item.actual_end.isoformat() if item.actual_end else None,
                    'order_date': item.order_date.isoformat() if item.order_date else None,
                    'required_date': item.required_date.isoformat() if item.required_date else None,
                    'manufacturing_status': item.manufacturing_status,
                    'purchase_status': item.purchase_status,
                })
        
        # Upcoming deadlines
        manufacturing_deadlines = []
        procurement_deadlines = []
        
        for item in manufactured_items:
            if item.manufacturing_status in ['completed']:
                continue
            
            # Check planned_start (launch deadline)
            if item.planned_start and today <= item.planned_start <= deadline_threshold:
                if not item.actual_start:
                    problem_deviation = self._get_problem_deviation_fields(item)
                    manufacturing_deadlines.append({
                        'id': str(item.id),
                        'item_number': item.item_number,
                        'name': item.name,
                        'project_id': str(item.project_id),
                        'project_name': item.project.name if item.project else None,
                        'deadline_type': 'start',
                        'deadline_date': item.planned_start.isoformat(),
                        'days_until': (item.planned_start - today).days,
                        'status': item.manufacturing_status,
                        'status_display': item.get_contractor_status_display() if item.manufacturer_type == 'contractor' else item.get_manufacturing_status_display(),
                        'manufacturer_type': item.manufacturer_type,
                        'delay_reason': item.delay_reason.name if item.delay_reason else None,
                        'delay_notes': item.delay_notes,
                        'problem_reason': item.problem_reason.name if item.problem_reason else None,
                        'problem_notes': item.problem_notes,
                        **problem_deviation,
                    })
            
            # Check planned_end (completion deadline)
            if item.planned_end and today <= item.planned_end <= deadline_threshold:
                problem_deviation = self._get_problem_deviation_fields(item)
                manufacturing_deadlines.append({
                    'id': str(item.id),
                    'item_number': item.item_number,
                    'name': item.name,
                    'project_id': str(item.project_id),
                    'project_name': item.project.name if item.project else None,
                    'deadline_type': 'end',
                    'deadline_date': item.planned_end.isoformat(),
                    'days_until': (item.planned_end - today).days,
                    'status': item.manufacturing_status,
                    'status_display': item.get_contractor_status_display() if item.manufacturer_type == 'contractor' else item.get_manufacturing_status_display(),
                    'manufacturer_type': item.manufacturer_type,
                    'delay_reason': item.delay_reason.name if item.delay_reason else None,
                    'delay_notes': item.delay_notes,
                    'problem_reason': item.problem_reason.name if item.problem_reason else None,
                    'problem_notes': item.problem_notes,
                    **problem_deviation,
                })
        
        for item in purchased_items:
            if item.purchase_status in ['closed', 'written_off']:
                continue
            
            # Check order_date (order deadline)
            if item.order_date and today <= item.order_date <= deadline_threshold:
                if item.purchase_status == 'waiting_order':
                    problem_deviation = self._get_problem_deviation_fields(item)
                    procurement_deadlines.append({
                        'id': str(item.id),
                        'item_number': item.item_number,
                        'name': item.name,
                        'project_id': str(item.project_id),
                        'project_name': item.project.name if item.project else None,
                        'deadline_type': 'order',
                        'deadline_date': item.order_date.isoformat(),
                        'days_until': (item.order_date - today).days,
                        'status': item.purchase_status,
                        'status_display': item.get_purchase_status_display(),
                        'supplier': item.supplier.name if item.supplier else None,
                        'delay_reason': item.delay_reason.name if item.delay_reason else None,
                        'delay_notes': item.delay_notes,
                        'problem_reason': item.problem_reason.name if item.problem_reason else None,
                        'problem_notes': item.problem_notes,
                        **problem_deviation,
                    })
            
            # Check required_date (delivery deadline)
            if item.required_date and today <= item.required_date <= deadline_threshold:
                problem_deviation = self._get_problem_deviation_fields(item)
                procurement_deadlines.append({
                    'id': str(item.id),
                    'item_number': item.item_number,
                    'name': item.name,
                    'project_id': str(item.project_id),
                    'project_name': item.project.name if item.project else None,
                    'deadline_type': 'delivery',
                    'deadline_date': item.required_date.isoformat(),
                    'days_until': (item.required_date - today).days,
                    'status': item.purchase_status,
                    'status_display': item.get_purchase_status_display(),
                    'supplier': item.supplier.name if item.supplier else None,
                    'delay_reason': item.delay_reason.name if item.delay_reason else None,
                    'delay_notes': item.delay_notes,
                    'problem_reason': item.problem_reason.name if item.problem_reason else None,
                    'problem_notes': item.problem_notes,
                    **problem_deviation,
                })
        
        # Sort deadlines by date
        manufacturing_deadlines.sort(key=lambda x: x['deadline_date'])
        procurement_deadlines.sort(key=lambda x: x['deadline_date'])
        
        # Get unique projects
        projects = {}
        for item in items:
            if item.project_id and item.project_id not in projects:
                projects[str(item.project_id)] = {
                    'id': str(item.project_id),
                    'name': item.project.name if item.project else None,
                }
        
        return Response({
            'manufacturing_summary': manufacturing_stats,
            'procurement_summary': procurement_stats,
            'problems': problem_items,
            'manufacturing_deadlines': manufacturing_deadlines,
            'procurement_deadlines': procurement_deadlines,
            'projects': list(projects.values()),
            'total_items': len(items),
        })
    
    @action(detail=False, methods=['get'], url_path='manufacturing')
    def manufacturing(self, request):
        """Get only manufactured items where user is responsible."""
        user = request.user
        items = self._get_user_responsible_items_qs(user).filter(
            nomenclature_item__catalog_category__is_purchased=False
        )
        
        project_id = request.query_params.get('project')
        if project_id:
            items = items.filter(project_id=project_id)
        
        serializer = ProjectItemListSerializer(
            items,
            many=True,
            context={
                'request': request,
                'include_purchase_order': False,
                'include_calculated_progress': True,
            },
        )
        return Response({
            'count': items.count(),
            'results': serializer.data,
        })
    
    @action(detail=False, methods=['get'], url_path='procurement')
    def procurement(self, request):
        """Get only purchased items where user is responsible."""
        user = request.user
        items = self._get_user_responsible_items_qs(user).filter(
            nomenclature_item__catalog_category__is_purchased=True
        )
        
        project_id = request.query_params.get('project')
        if project_id:
            items = items.filter(project_id=project_id)
        
        serializer = ProjectItemListSerializer(
            items,
            many=True,
            context={
                'request': request,
                'include_purchase_order': False,
                'include_calculated_progress': True,
            },
        )
        return Response({
            'count': items.count(),
            'results': serializer.data,
        })
    
    @action(detail=False, methods=['get'], url_path='problems')
    def problems(self, request):
        """Get items with problems or overdue."""
        user = request.user
        items = self._get_user_responsible_items_qs(user)
        
        today = date.today()
        problem_items = []
        
        for item in items:
            problems = self._get_problem_type(item)
            if problems:
                item_data = ProjectItemListSerializer(item).data
                item_data['problems'] = problems
                problem_items.append(item_data)
        
        return Response({
            'count': len(problem_items),
            'results': problem_items,
        })
    
    @action(detail=False, methods=['get'], url_path='gantt')
    def gantt(self, request):
        """
        Get Gantt chart data for items where user is responsible.
        Returns items in format suitable for Gantt visualization.
        """
        user = request.user
        items = self._get_user_responsible_items_qs(user)
        
        # Filter only manufactured items for Gantt (as per original Gantt logic)
        items = items.filter(
            nomenclature_item__catalog_category__is_purchased=False
        )
        
        project_id = request.query_params.get('project')
        if project_id:
            items = items.filter(project_id=project_id)
        
        serializer = ProjectItemListSerializer(
            items,
            many=True,
            context={
                'request': request,
                'include_purchase_order': False,
                'include_calculated_progress': True,
            },
        )
        return Response({
            'count': items.count(),
            'results': serializer.data,
        })
