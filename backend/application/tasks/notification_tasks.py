"""
Notification Tasks.

Celery tasks for sending notifications.
"""

from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task
def send_email_notification(
    to_emails: list,
    subject: str,
    template_name: str,
    context: dict = None
):
    """
    Send email notification using template.
    
    Args:
        to_emails: List of recipient emails
        subject: Email subject
        template_name: Path to email template
        context: Template context
    """
    try:
        html_content = render_to_string(template_name, context or {})
        
        send_mail(
            subject=subject,
            message='',  # Plain text fallback
            html_message=html_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=to_emails,
            fail_silently=False,
        )
        
        logger.info(f"Sent email to {to_emails}: {subject}")
        return {'success': True, 'recipients': len(to_emails)}
        
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return {'success': False, 'error': str(e)}


@shared_task
def notify_overdue_items():
    """
    Send notifications for overdue project items.
    
    Notifies:
    - Item responsible person
    - Project manager
    """
    from infrastructure.persistence.models import ProjectItem, Project
    
    today = timezone.now().date()
    
    # Get overdue items
    overdue_items = ProjectItem.objects.filter(
        planned_end_date__lt=today
    ).exclude(
        status__in=['completed', 'cancelled']
    ).select_related(
        'project', 'nomenclature', 'responsible'
    )
    
    # Group by responsible person
    by_responsible = {}
    for item in overdue_items:
        if item.responsible and item.responsible.email:
            key = item.responsible.email
            if key not in by_responsible:
                by_responsible[key] = []
            by_responsible[key].append(item)
    
    # Send notifications
    sent = 0
    for email, items in by_responsible.items():
        try:
            context = {
                'items': items,
                'count': len(items),
                'date': today,
            }
            
            send_email_notification.delay(
                to_emails=[email],
                subject=f'[PDM] У вас {len(items)} просроченных задач',
                template_name='emails/overdue_items.html',
                context=context
            )
            sent += 1
        except Exception as e:
            logger.error(f"Failed to notify {email}: {e}")
    
    # Notify project managers about overdue projects
    overdue_projects = Project.objects.filter(
        planned_end_date__lt=today,
        manager__isnull=False
    ).exclude(
        status__in=['completed', 'cancelled']
    ).select_related('manager')
    
    for project in overdue_projects:
        if project.manager and project.manager.email:
            project_label = getattr(project, 'name', None) or str(project.id)
            send_email_notification.delay(
                to_emails=[project.manager.email],
                subject=f'[PDM] Проект {project_label} просрочен',
                template_name='emails/overdue_project.html',
                context={'project': project}
            )
            sent += 1
    
    return {'notifications_sent': sent}


@shared_task
def notify_approaching_deadlines():
    """
    Send notifications for items with approaching deadlines.
    
    Notifies about items due in the next 3 days.
    """
    from infrastructure.persistence.models import ProjectItem
    
    today = timezone.now().date()
    deadline = today + timezone.timedelta(days=3)
    
    # Get items due soon
    due_soon = ProjectItem.objects.filter(
        planned_end_date__gte=today,
        planned_end_date__lte=deadline
    ).exclude(
        status__in=['completed', 'cancelled']
    ).select_related(
        'project', 'nomenclature', 'responsible'
    )
    
    # Group by responsible person
    by_responsible = {}
    for item in due_soon:
        if item.responsible and item.responsible.email:
            key = item.responsible.email
            if key not in by_responsible:
                by_responsible[key] = []
            by_responsible[key].append(item)
    
    # Send notifications
    sent = 0
    for email, items in by_responsible.items():
        try:
            send_email_notification.delay(
                to_emails=[email],
                subject=f'[PDM] {len(items)} задач с приближающимся сроком',
                template_name='emails/approaching_deadlines.html',
                context={
                    'items': items,
                    'count': len(items),
                }
            )
            sent += 1
        except Exception as e:
            logger.error(f"Failed to notify {email}: {e}")
    
    return {'notifications_sent': sent}


@shared_task
def notify_milestone_completion(milestone_id: str):
    """
    Send notification when milestone is completed.
    """
    from infrastructure.persistence.models import ProjectMilestone
    
    try:
        milestone = ProjectMilestone.objects.select_related(
            'project', 'project__manager', 'responsible'
        ).get(id=milestone_id)
        
        # Collect recipients
        recipients = set()
        if milestone.project.manager and milestone.project.manager.email:
            recipients.add(milestone.project.manager.email)
        if milestone.responsible and milestone.responsible.email:
            recipients.add(milestone.responsible.email)
        
        if recipients:
            send_email_notification.delay(
                to_emails=list(recipients),
                subject=f'[PDM] Веха "{milestone.name}" завершена',
                template_name='emails/milestone_completed.html',
                context={
                    'milestone': milestone,
                    'project': milestone.project,
                }
            )
        
        return {'success': True}
        
    except ProjectMilestone.DoesNotExist:
        return {'error': 'Milestone not found'}


@shared_task
def notify_project_status_change(project_id: str, old_status: str, new_status: str):
    """
    Send notification when project status changes.
    """
    from infrastructure.persistence.models import Project
    
    try:
        project = Project.objects.select_related('manager', 'created_by').get(
            id=project_id
        )
        
        # Collect recipients
        recipients = set()
        if project.manager and project.manager.email:
            recipients.add(project.manager.email)
        if project.created_by and project.created_by.email:
            recipients.add(project.created_by.email)
        
        status_display = dict(Project.STATUS_CHOICES)
        
        if recipients:
            project_label = getattr(project, 'name', None) or str(project.id)
            send_email_notification.delay(
                to_emails=list(recipients),
                subject=f'[PDM] Проект {project_label}: статус изменен',
                template_name='emails/project_status_change.html',
                context={
                    'project': project,
                    'old_status': status_display.get(old_status, old_status),
                    'new_status': status_display.get(new_status, new_status),
                }
            )
        
        return {'success': True}
        
    except Project.DoesNotExist:
        return {'error': 'Project not found'}


@shared_task
def send_daily_digest():
    """
    Send daily digest email to project managers.
    
    Includes:
    - Projects status summary
    - Overdue items count
    - Items due today
    - Recent activity
    """
    from infrastructure.persistence.models import Project, ProjectItem, User
    from django.db.models import Count, Q
    
    today = timezone.now().date()
    
    # Get all project managers
    managers = User.objects.filter(
        managed_projects__isnull=False,
        is_active=True,
        email__isnull=False
    ).distinct()
    
    sent = 0
    for manager in managers:
        # Get manager's projects
        projects = Project.objects.filter(manager=manager).exclude(
            status__in=['completed', 'cancelled']
        )
        
        if not projects.exists():
            continue
        
        # Aggregate data
        project_ids = projects.values_list('id', flat=True)
        
        overdue_count = ProjectItem.objects.filter(
            project_id__in=project_ids,
            planned_end_date__lt=today
        ).exclude(
            status__in=['completed', 'cancelled']
        ).count()
        
        due_today = ProjectItem.objects.filter(
            project_id__in=project_ids,
            planned_end_date=today
        ).exclude(
            status__in=['completed', 'cancelled']
        ).count()
        
        context = {
            'manager': manager,
            'projects': projects,
            'overdue_count': overdue_count,
            'due_today': due_today,
            'date': today,
        }
        
        try:
            send_email_notification.delay(
                to_emails=[manager.email],
                subject=f'[PDM] Ежедневная сводка на {today}',
                template_name='emails/daily_digest.html',
                context=context
            )
            sent += 1
        except Exception as e:
            logger.error(f"Failed to send digest to {manager.email}: {e}")
    
    return {'digests_sent': sent}
