"""
Dashboard Views.

Management dashboard for business owners and executives.
Provides aggregated business status, risks, problems, and early warnings.

This is NOT a report or list - it's a management control screen designed
to show business state at a glance in 30-60 seconds.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Q, Count, Sum, Avg, F, Case, When, Value, CharField
from django.db.models.functions import Coalesce
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from infrastructure.persistence.models import (
    Project,
    ProjectItem,
    ProjectStatusChoices,
    PurchaseStatusChoices,
    ManufacturingStatusChoices,
)


class DashboardViewSet(viewsets.ViewSet):
    """
    ViewSet for executive management dashboard.
    
    This provides a high-level business overview for owners and executives:
    - Overall business status with risk indicators
    - Project-level health aggregation (not details!)
    - Active problems sorted by criticality
    - Early warnings (proactive alerts before problems occur)
    
    Endpoints:
    - GET /dashboard/summary/ - Complete dashboard data
    - GET /dashboard/business-status/ - KPI cards only
    - GET /dashboard/projects-overview/ - Project health overview
    - GET /dashboard/problems/ - Active problems list
    - GET /dashboard/warnings/ - Early warnings
    """
    
    permission_classes = [IsAuthenticated]
    
    def _get_severity_level(self, days_overdue):
        """
        Calculate severity level based on days overdue.
        
        Returns:
        - 'critical' (red): > 7 days overdue
        - 'risk' (yellow): 1-7 days overdue or approaching deadline
        - 'normal' (green): on track
        """
        if days_overdue > 7:
            return 'critical'
        elif days_overdue > 0:
            return 'risk'
        return 'normal'
    
    def _get_project_health(self, project):
        """
        Calculate project health status based on its items.
        
        Returns dict with:
        - status: 'normal' | 'risk' | 'critical'
        - problem_count: number of problematic items
        - critical_date: earliest critical date if any
        - progress: overall project progress
        """
        today = date.today()
        items = ProjectItem.objects.filter(
            project=project,
            is_active=True
        ).select_related('nomenclature_item__catalog_category')
        
        problem_count = 0
        critical_count = 0
        earliest_critical_date = None

        # Build a parent->children index to compute progress without extra DB queries.
        items_by_id = {}
        children_by_parent_id = {}
        for item in items:
            items_by_id[item.id] = item
            parent_id = item.parent_item_id
            children_by_parent_id.setdefault(parent_id, []).append(item.id)
        
        for item in items:
            is_purchased = (
                item.nomenclature_item and 
                item.nomenclature_item.catalog_category and 
                item.nomenclature_item.catalog_category.is_purchased
            )
            
            has_problem = False
            item_critical_date = None
            
            if is_purchased:
                # Purchased item checks
                if item.purchase_status not in ['closed', 'written_off']:
                    # Order overdue
                    if item.order_date and item.order_date < today and item.purchase_status == 'waiting_order':
                        has_problem = True
                        critical_count += 1
                        item_critical_date = item.order_date
                    # Delivery overdue
                    elif item.required_date and item.required_date < today:
                        has_problem = True
                        critical_count += 1
                        item_critical_date = item.required_date
            else:
                # Manufactured item checks
                if item.manufacturing_status not in ['completed']:
                    # Start overdue
                    if item.planned_start and item.planned_start < today and not item.actual_start:
                        has_problem = True
                        if (item.planned_start - today).days < -7:
                            critical_count += 1
                        item_critical_date = item.planned_start
                    # End overdue
                    elif item.planned_end and item.planned_end < today:
                        has_problem = True
                        critical_count += 1
                        item_critical_date = item.planned_end
            
            # Check problem flags
            if item.has_problem or item.delay_reason_id:
                has_problem = True
            
            if has_problem:
                problem_count += 1
                if item_critical_date:
                    if earliest_critical_date is None or item_critical_date < earliest_critical_date:
                        earliest_critical_date = item_critical_date

        def _clamp_percent(value):
            try:
                value = float(value)
            except (TypeError, ValueError):
                return 0.0
            if value < 0:
                return 0.0
            if value > 100:
                return 100.0
            return value

        progress_cache = {}

        def _item_progress(item_id):
            cached = progress_cache.get(item_id)
            if cached is not None:
                return cached

            node = items_by_id.get(item_id)
            if node is None:
                progress_cache[item_id] = 0.0
                return 0.0

            # Final states always mean 100%.
            is_purchased = bool(
                node.nomenclature_item and
                node.nomenclature_item.catalog_category and
                node.nomenclature_item.catalog_category.is_purchased
            )

            if is_purchased:
                if node.purchase_status in ['closed', 'written_off']:
                    progress_cache[item_id] = 100.0
                    return 100.0
            else:
                if node.manufacturer_type == 'contractor':
                    if node.contractor_status == 'completed':
                        progress_cache[item_id] = 100.0
                        return 100.0
                else:
                    if node.manufacturing_status == 'completed':
                        progress_cache[item_id] = 100.0
                        return 100.0

            child_ids = children_by_parent_id.get(item_id) or []
            if not child_ids:
                # Leaf node: use explicit progress_percent if it is set.
                progress_cache[item_id] = _clamp_percent(getattr(node, 'progress_percent', 0) or 0)
                return progress_cache[item_id]

            total = 0.0
            for child_id in child_ids:
                total += _item_progress(child_id)
            progress_cache[item_id] = total / len(child_ids) if child_ids else 0.0
            return progress_cache[item_id]

        root_ids = children_by_parent_id.get(None) or []
        overall_progress = 0.0
        if root_ids:
            overall_progress = sum(_item_progress(root_id) for root_id in root_ids) / len(root_ids)
        
        # Determine overall status
        if critical_count > 0:
            health_status = 'critical'
        elif problem_count > 0:
            health_status = 'risk'
        else:
            health_status = 'normal'
        
        return {
            'status': health_status,
            'problem_count': problem_count,
            'critical_count': critical_count,
            'critical_date': earliest_critical_date.isoformat() if earliest_critical_date else None,
            'progress': overall_progress,
        }
    
    def _collect_problems(self):
        """
        Collect all active problems across all projects.
        
        Returns list of problem items sorted by criticality.
        Problems are items with:
        - Overdue dates (work not started, not completed, order not placed, not delivered)
        - Problem flags set (has_problem=True)
        - Delay reasons assigned
        """
        today = date.today()
        problems = []
        
        # Get all active items from active projects
        items = ProjectItem.objects.filter(
            is_active=True,
            project__is_active=True,
            project__status__in=['in_progress'],
        ).select_related(
            'project',
            'nomenclature_item__catalog_category',
            'delay_reason',
            'problem_reason',
            'responsible',
        )
        
        for item in items:
            is_purchased = (
                item.nomenclature_item and 
                item.nomenclature_item.catalog_category and 
                item.nomenclature_item.catalog_category.is_purchased
            )
            
            problem_types = []
            days_overdue = 0
            severity = 'normal'
            
            if is_purchased:
                item_type = 'purchasing'
                
                if item.purchase_status not in ['closed', 'written_off']:
                    # Order should have been placed
                    if item.order_date and item.order_date < today and item.purchase_status == 'waiting_order':
                        problem_types.append('order_not_placed')
                        days_overdue = max(days_overdue, (today - item.order_date).days)
                    
                    # Item should have been delivered
                    if item.required_date and item.required_date < today:
                        problem_types.append('not_delivered')
                        days_overdue = max(days_overdue, (today - item.required_date).days)
            else:
                item_type = 'manufacturing'
                
                if item.manufacturing_status not in ['completed']:
                    # Work should have started
                    if item.planned_start and item.planned_start < today and not item.actual_start:
                        problem_types.append('work_not_started')
                        days_overdue = max(days_overdue, (today - item.planned_start).days)
                    
                    # Work should have completed
                    if item.planned_end and item.planned_end < today:
                        problem_types.append('work_not_completed')
                        days_overdue = max(days_overdue, (today - item.planned_end).days)
                
                # Check suspended status
                if item.manufacturing_status == 'suspended' or (
                    item.manufacturer_type == 'contractor' and 
                    item.contractor_status == 'suspended_by_contractor'
                ):
                    problem_types.append('suspended')
            
            # Check flags
            if item.has_problem:
                if 'has_problem_flag' not in problem_types:
                    problem_types.append('has_problem_flag')
            
            if item.delay_reason_id:
                if 'has_delay_reason' not in problem_types:
                    problem_types.append('has_delay_reason')
            
            # Only add if there are problems
            if problem_types:
                severity = self._get_severity_level(days_overdue)
                
                problems.append({
                    'id': str(item.id),
                    'item_number': item.item_number,
                    'name': item.name,
                    'project_id': str(item.project_id),
                    'project_name': item.project.name if item.project else None,
                    'type': item_type,
                    'problem_types': problem_types,
                    'days_overdue': days_overdue,
                    'severity': severity,
                    'reason': (
                        item.problem_reason.name if item.problem_reason else 
                        item.delay_reason.name if item.delay_reason else None
                    ),
                    'notes': item.problem_notes or item.delay_notes or '',
                    'responsible': item.responsible.get_full_name() if item.responsible else None,
                    'planned_date': (
                        item.required_date.isoformat() if is_purchased and item.required_date else
                        item.planned_end.isoformat() if item.planned_end else None
                    ),
                })
        
        # Sort by severity (critical first) then by days_overdue
        severity_order = {'critical': 0, 'risk': 1, 'normal': 2}
        problems.sort(key=lambda x: (severity_order.get(x['severity'], 2), -x['days_overdue']))
        
        return problems
    
    def _collect_warnings(self, days_ahead=7):
        """
        Collect early warnings - things that will become problems soon.
        
        These are NOT problems yet, but will be if not addressed:
        - Work that should start soon but hasn't
        - Orders that need to be placed soon
        - Items approaching deadlines with no progress
        """
        today = date.today()
        warning_threshold = today + timedelta(days=days_ahead)
        warnings = []
        
        # Get all active items from active projects
        items = ProjectItem.objects.filter(
            is_active=True,
            project__is_active=True,
            project__status__in=['in_progress'],
        ).select_related(
            'project',
            'nomenclature_item__catalog_category',
            'responsible',
        )
        
        for item in items:
            is_purchased = (
                item.nomenclature_item and 
                item.nomenclature_item.catalog_category and 
                item.nomenclature_item.catalog_category.is_purchased
            )
            
            warning_type = None
            warning_date = None
            days_until = None
            
            if is_purchased:
                # Order date approaching but not ordered yet
                if (item.order_date and 
                    today <= item.order_date <= warning_threshold and 
                    item.purchase_status == 'waiting_order'):
                    warning_type = 'order_due_soon'
                    warning_date = item.order_date
                    days_until = (item.order_date - today).days
                
                # Delivery date approaching
                elif (item.required_date and 
                      today <= item.required_date <= warning_threshold and 
                      item.purchase_status not in ['closed', 'written_off']):
                    warning_type = 'delivery_due_soon'
                    warning_date = item.required_date
                    days_until = (item.required_date - today).days
            else:
                # Work should start soon but not started
                if (item.planned_start and 
                    today <= item.planned_start <= warning_threshold and 
                    not item.actual_start and 
                    item.manufacturing_status == 'not_started'):
                    warning_type = 'work_start_due_soon'
                    warning_date = item.planned_start
                    days_until = (item.planned_start - today).days
                
                # Work end date approaching but not completed
                elif (item.planned_end and 
                      today <= item.planned_end <= warning_threshold and 
                      item.manufacturing_status not in ['completed']):
                    warning_type = 'work_end_due_soon'
                    warning_date = item.planned_end
                    days_until = (item.planned_end - today).days
            
            if warning_type:
                warnings.append({
                    'id': str(item.id),
                    'item_number': item.item_number,
                    'name': item.name,
                    'project_id': str(item.project_id),
                    'project_name': item.project.name if item.project else None,
                    'type': 'purchasing' if is_purchased else 'manufacturing',
                    'warning_type': warning_type,
                    'warning_date': warning_date.isoformat() if warning_date else None,
                    'days_until': days_until,
                    'responsible': item.responsible.get_full_name() if item.responsible else None,
                })
        
        # Sort by days_until (soonest first)
        warnings.sort(key=lambda x: x['days_until'] if x['days_until'] is not None else 999)
        
        return warnings
    
    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Get complete dashboard data in a single request.
        
        This is the main endpoint for the dashboard page.
        Returns all zones:
        - business_status: overall KPIs
        - projects: project health overview
        - problems: active problems list
        - warnings: early warnings
        """
        days_ahead = int(request.query_params.get('warning_days', 7))
        
        # Business status (Zone 1)
        business_status = self._get_business_status()
        
        # Projects overview (Zone 2)
        projects_overview = self._get_projects_overview()
        
        # Problems (Zone 3)
        problems = self._collect_problems()
        
        # Warnings (Zone 4)
        warnings = self._collect_warnings(days_ahead)
        
        return Response({
            'business_status': business_status,
            'projects': projects_overview,
            'problems': problems,
            'warnings': warnings,
            'generated_at': date.today().isoformat(),
        })
    
    @action(detail=False, methods=['get'], url_path='business-status')
    def business_status(self, request):
        """Get business status KPIs only."""
        return Response(self._get_business_status())
    
    @action(detail=False, methods=['get'], url_path='projects-overview')
    def projects_overview(self, request):
        """Get projects health overview."""
        return Response(self._get_projects_overview())
    
    @action(detail=False, methods=['get'], url_path='problems')
    def problems(self, request):
        """Get active problems list."""
        problems = self._collect_problems()
        
        # Optional filtering
        problem_type = request.query_params.get('type')  # manufacturing | purchasing
        if problem_type:
            problems = [p for p in problems if p['type'] == problem_type]
        
        severity = request.query_params.get('severity')  # critical | risk | normal
        if severity:
            problems = [p for p in problems if p['severity'] == severity]
        
        project_id = request.query_params.get('project')
        if project_id:
            problems = [p for p in problems if p['project_id'] == project_id]
        
        return Response({
            'count': len(problems),
            'results': problems,
        })
    
    @action(detail=False, methods=['get'], url_path='warnings')
    def warnings(self, request):
        """Get early warnings."""
        days_ahead = int(request.query_params.get('days_ahead', 7))
        warnings = self._collect_warnings(days_ahead)
        
        # Optional filtering
        warning_type = request.query_params.get('type')  # manufacturing | purchasing
        if warning_type:
            warnings = [w for w in warnings if w['type'] == warning_type]
        
        project_id = request.query_params.get('project')
        if project_id:
            warnings = [w for w in warnings if w['project_id'] == project_id]
        
        return Response({
            'count': len(warnings),
            'results': warnings,
        })
    
    def _get_business_status(self):
        """
        Calculate overall business status KPIs.
        
        Returns:
        - active_projects: count of active projects
        - projects_normal/risk/critical: breakdown by health
        - problems_manufacturing/purchasing/contractor: problem counts by type
        - total_overdue: total overdue items count
        """
        today = date.today()
        
        # Get active projects
        active_projects = Project.objects.filter(
            is_active=True,
            status__in=['in_progress']
        )
        
        projects_normal = 0
        projects_risk = 0
        projects_critical = 0
        
        for project in active_projects:
            health = self._get_project_health(project)
            if health['status'] == 'normal':
                projects_normal += 1
            elif health['status'] == 'risk':
                projects_risk += 1
            else:
                projects_critical += 1
        
        # Get all active items
        items = ProjectItem.objects.filter(
            is_active=True,
            project__is_active=True,
            project__status__in=['in_progress'],
        ).select_related('nomenclature_item__catalog_category')
        
        # Count problems by type
        problems_manufacturing = 0
        problems_purchasing = 0
        problems_contractor = 0
        total_overdue = 0
        
        for item in items:
            is_purchased = (
                item.nomenclature_item and 
                item.nomenclature_item.catalog_category and 
                item.nomenclature_item.catalog_category.is_purchased
            )
            
            has_problem = False
            
            if is_purchased:
                if item.purchase_status not in ['closed', 'written_off']:
                    if (item.order_date and item.order_date < today and item.purchase_status == 'waiting_order'):
                        has_problem = True
                    elif (item.required_date and item.required_date < today):
                        has_problem = True
                
                if has_problem or item.has_problem or item.delay_reason_id:
                    problems_purchasing += 1
                    total_overdue += 1
            else:
                if item.manufacturing_status not in ['completed']:
                    if item.planned_start and item.planned_start < today and not item.actual_start:
                        has_problem = True
                    elif item.planned_end and item.planned_end < today:
                        has_problem = True
                
                if has_problem or item.has_problem or item.delay_reason_id:
                    if item.manufacturer_type == 'contractor':
                        problems_contractor += 1
                    else:
                        problems_manufacturing += 1
                    total_overdue += 1
        
        return {
            'active_projects': active_projects.count(),
            'projects_normal': projects_normal,
            'projects_risk': projects_risk,
            'projects_critical': projects_critical,
            'problems_manufacturing': problems_manufacturing,
            'problems_purchasing': problems_purchasing,
            'problems_contractor': problems_contractor,
            'total_overdue': total_overdue,
        }
    
    def _get_projects_overview(self):
        """
        Get aggregated overview of all active projects.
        
        Returns list of projects with:
        - id, name
        - status: overall health status
        - progress: completion percentage
        - problem_count: number of problematic items
        - critical_date: earliest critical date
        """
        active_projects = Project.objects.filter(
            is_active=True,
            status__in=['in_progress']
        ).order_by('-created_at')
        
        projects_data = []
        
        for project in active_projects:
            health = self._get_project_health(project)
            
            projects_data.append({
                'id': str(project.id),
                'name': project.name,
                'project_status': project.status,
                'project_status_display': project.get_status_display(),
                'health_status': health['status'],
                'progress': health['progress'],
                'problem_count': health['problem_count'],
                'critical_count': health['critical_count'],
                'critical_date': health['critical_date'],
                'planned_end': project.planned_end.isoformat() if project.planned_end else None,
                'project_manager': project.project_manager.get_full_name() if project.project_manager else None,
            })
        
        return projects_data
