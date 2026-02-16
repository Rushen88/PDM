"""Check data integrity for project items."""
import os
import django

os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from infrastructure.persistence.models.project import Project, ProjectItem

project = Project.objects.filter(is_active=True).first()
print(f'Project: {project.name}')
print(f'Project ID: {project.id}')

# Get all active items
all_items = list(ProjectItem.objects.filter(project=project, is_active=True).values('id', 'parent_item_id', 'name'))
all_ids = {str(item['id']) for item in all_items}

print(f'\nTotal active items: {len(all_items)}')

# Find orphans - items with parent_item that doesn't exist in active items
orphans = []
for item in all_items:
    if item['parent_item_id']:
        parent_id = str(item['parent_item_id'])
        if parent_id not in all_ids:
            orphans.append({
                'id': str(item['id']),
                'name': item['name'],
                'missing_parent': parent_id
            })

print(f'Orphan items (parent not in active items): {len(orphans)}')

if orphans:
    print('\nFirst 10 orphans:')
    for o in orphans[:10]:
        print(f"  - {o['name']}: parent {o['missing_parent'][:8]}... NOT FOUND")
    
    # Check if missing parents exist but are inactive
    missing_ids = [o['missing_parent'] for o in orphans]
    
    # Check in ALL items (including inactive)
    all_existing = ProjectItem.objects.filter(id__in=missing_ids).values('id', 'name', 'is_active')
    print(f'\nMissing parents that exist in DB (any state): {len(all_existing)}')
    for item in all_existing[:5]:
        print(f"  - {item['name']} (is_active={item['is_active']})")
    
    # Check if they belong to different project
    different_project = ProjectItem.objects.filter(id__in=missing_ids).exclude(project=project).count()
    print(f'\nMissing parents from different project: {different_project}')
else:
    print('\n✅ All parent references are valid!')

# Show tree structure
print('\n\n=== TREE STRUCTURE ===')
root_items = ProjectItem.objects.filter(project=project, parent_item__isnull=True, is_active=True)
print(f'Root items: {root_items.count()}')
for root in root_items:
    children = ProjectItem.objects.filter(parent_item=root, is_active=True)
    print(f'  └─ {root.name} (children: {children.count()})')
    for child in children[:3]:
        grandchildren = ProjectItem.objects.filter(parent_item=child, is_active=True).count()
        print(f'      └─ {child.name} (children: {grandchildren})')
