"""
Project Tasks.

Celery tasks for project-related operations.
"""

from celery import shared_task
from django.db import transaction
from django.db.models import Sum, Max
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def recalculate_project_progress(self, project_id: str):
    """
    Recalculate progress for a specific project.
    
    This task recalculates:
    - Overall project progress
    - Parent item progress (bottom-up)
    - Project statistics
    """
    from infrastructure.persistence.models import Project, ProjectItem
    
    try:
        project = Project.objects.get(id=project_id)
        
        with transaction.atomic():
            items = project.items.all()
            
            if not items.exists():
                project.progress_percent = 0
                project.save(update_fields=['progress_percent'])
                return {'project_id': project_id, 'progress': 0}
            
            # Calculate from leaf items up
            # First, recalculate all leaf items
            leaf_items = items.filter(children__isnull=True)
            
            # Then calculate parent items
            for level in range(items.aggregate(max_level=Max('level'))['max_level'] or 0, -1, -1):
                level_items = items.filter(level=level, children__isnull=False)
                
                for item in level_items:
                    children = item.children.all()
                    if children.exists():
                        total_required = children.aggregate(
                            total=Sum('quantity_required')
                        )['total'] or 0
                        total_completed = children.aggregate(
                            total=Sum('quantity_completed')
                        )['total'] or 0
                        
                        if total_required > 0:
                            # Weight the parent's progress by children's progress
                            child_progress = (total_completed / total_required)
                            item.quantity_completed = item.quantity_required * child_progress
                            item.save(update_fields=['quantity_completed'])
            
            # Calculate overall project progress
            total_required = items.aggregate(
                total=Sum('quantity_required')
            )['total'] or 0
            total_completed = items.aggregate(
                total=Sum('quantity_completed')
            )['total'] or 0
            
            if total_required > 0:
                project.progress_percent = round(
                    (total_completed / total_required) * 100, 2
                )
            else:
                project.progress_percent = 0
            
            # Calculate actual cost
            project.actual_cost = items.aggregate(
                total=Sum('actual_cost')
            )['total'] or 0
            
            project.save(update_fields=['progress_percent', 'actual_cost'])
        
        project_label = getattr(project, 'name', None) or str(project_id)
        logger.info(f"Recalculated project {project_label}: {project.progress_percent}%")
        
        return {
            'project_id': project_id,
            'progress': float(project.progress_percent),
            'actual_cost': float(project.actual_cost),
        }
        
    except Project.DoesNotExist:
        logger.error(f"Project {project_id} not found")
        return {'error': 'Project not found'}
    except Exception as e:
        logger.error(f"Error recalculating project {project_id}: {e}")
        self.retry(countdown=60)


@shared_task
def recalculate_all_projects():
    """Recalculate progress for all active projects."""
    from infrastructure.persistence.models import Project
    
    projects = Project.objects.filter(
        status__in=['planning', 'in_progress']
    )
    
    results = []
    for project in projects:
        result = recalculate_project_progress.delay(str(project.id))
        results.append(str(project.id))
    
    return {'scheduled': len(results), 'project_ids': results}


@shared_task
def take_progress_snapshot():
    """
    Take daily snapshot of all active project progress.
    
    Should be scheduled to run daily.
    """
    from infrastructure.persistence.models import (
        Project,
        ProjectItem,
        ProgressSnapshot,
    )
    
    today = timezone.now().date()
    projects = Project.objects.filter(
        status__in=['planning', 'in_progress']
    )
    
    snapshots_created = 0
    
    for project in projects:
        # Project-level snapshot
        ProgressSnapshot.objects.update_or_create(
            project=project,
            project_item=None,
            snapshot_date=today,
            defaults={
                'progress_percent': project.progress_percent or 0,
                'total_items': project.items.count(),
                'completed_items': project.items.filter(status='completed').count(),
                'problematic_items': project.items.filter(
                    is_critical=True
                ).exclude(status='completed').count(),
            }
        )
        snapshots_created += 1
        
        # Top-level item snapshots (level 0 only for efficiency)
        for item in project.items.filter(level=0):
            progress = (
                (item.quantity_completed / item.quantity_required * 100)
                if item.quantity_required > 0 else 0
            )
            
            ProgressSnapshot.objects.update_or_create(
                project=project,
                project_item=item,
                snapshot_date=today,
                defaults={
                    'progress_percent': progress,
                    'total_items': item.children.count(),
                    'completed_items': item.children.filter(status='completed').count(),
                }
            )
            snapshots_created += 1
    
    logger.info(f"Created {snapshots_created} progress snapshots")
    return {'snapshots_created': snapshots_created}


@shared_task(bind=True, max_retries=3)
def check_project_deadlines(self):
    """
    Check for approaching and missed deadlines.
    
    Sends notifications for:
    - Items due within 7 days
    - Overdue items
    - Milestone approaching
    """
    from infrastructure.persistence.models import (
        Project,
        ProjectItem,
        ProjectMilestone,
    )
    
    today = timezone.now().date()
    week_ahead = today + timezone.timedelta(days=7)
    
    # Find overdue items
    overdue_items = ProjectItem.objects.filter(
        planned_end_date__lt=today
    ).exclude(
        status__in=['completed', 'cancelled']
    ).select_related('project', 'nomenclature', 'responsible')
    
    # Find items due soon
    due_soon_items = ProjectItem.objects.filter(
        planned_end_date__gte=today,
        planned_end_date__lte=week_ahead
    ).exclude(
        status__in=['completed', 'cancelled']
    ).select_related('project', 'nomenclature', 'responsible')
    
    # Find overdue milestones
    overdue_milestones = ProjectMilestone.objects.filter(
        planned_date__lt=today
    ).exclude(
        status='completed'
    ).select_related('project', 'responsible')
    
    # TODO: Send notifications via email/websocket
    # For now, just log
    
    logger.info(
        f"Deadline check: {overdue_items.count()} overdue items, "
        f"{due_soon_items.count()} due soon, "
        f"{overdue_milestones.count()} overdue milestones"
    )
    
    return {
        'overdue_items': overdue_items.count(),
        'due_soon_items': due_soon_items.count(),
        'overdue_milestones': overdue_milestones.count(),
    }


@shared_task
def update_project_status():
    """
    Auto-update project status based on progress.
    
    - Set to 'in_progress' when first item starts
    - Set to 'completed' when all items are done
    """
    from infrastructure.persistence.models import Project
    
    updated = 0
    
    # Projects that should be marked as in_progress
    planning_projects = Project.objects.filter(
        status='planning'
    ).exclude(
        items__status='not_started'  # Has at least one non-not_started item
    )
    
    for project in planning_projects:
        if project.items.exclude(status='not_started').exists():
            project.status = 'in_progress'
            if not project.actual_start_date:
                project.actual_start_date = timezone.now().date()
            project.save(update_fields=['status', 'actual_start_date'])
            updated += 1
    
    # Projects that should be marked as completed
    in_progress_projects = Project.objects.filter(
        status='in_progress',
        progress_percent__gte=100
    )
    
    for project in in_progress_projects:
        # Verify all items are completed
        if not project.items.exclude(
            status__in=['completed', 'cancelled']
        ).exists():
            project.status = 'completed'
            project.actual_end_date = timezone.now().date()
            project.save(update_fields=['status', 'actual_end_date'])
            updated += 1
    
    return {'updated_projects': updated}
