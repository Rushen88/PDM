"""Check API response vs DB data."""
import os
import django
import json

os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from infrastructure.persistence.models.project import Project, ProjectItem
from presentation.api.v1.serializers.project import ProjectItemListSerializer
from rest_framework.request import Request
from django.test import RequestFactory

project = Project.objects.filter(is_active=True).first()
print(f'Project: {project.name}')

# Get all items from DB
db_items = ProjectItem.objects.filter(project=project, is_active=True)
print(f'\nDB items count: {db_items.count()}')

# Simulate API serialization
factory = RequestFactory()
request = factory.get('/')

# Serialize all items like the API does
serialized_items = []
for item in db_items:
    serializer = ProjectItemListSerializer(item)
    serialized_items.append(serializer.data)

print(f'Serialized items count: {len(serialized_items)}')

# Build the same map that frontend builds
item_map = {}
for item in serialized_items:
    item_map[item['id']] = item

print(f'Item map size: {len(item_map)}')

# Check for orphans in serialized data
orphans = []
for item in serialized_items:
    if item['parent_item']:
        if item['parent_item'] not in item_map:
            orphans.append({
                'id': item['id'],
                'name': item['name'],
                'parent_item': item['parent_item']
            })

print(f'\nOrphans in serialized data: {len(orphans)}')
if orphans:
    print('First 5 orphans:')
    for o in orphans[:5]:
        print(f"  - {o['name']}: parent {o['parent_item'][:8]}...")
        # Check if parent exists
        exists_in_db = ProjectItem.objects.filter(id=o['parent_item']).exists()
        exists_active = ProjectItem.objects.filter(id=o['parent_item'], is_active=True).exists()
        print(f"    In DB: {exists_in_db}, Active: {exists_active}")

# Check sample data
print('\n=== SAMPLE SERIALIZED DATA ===')
root = next((i for i in serialized_items if i['parent_item'] is None), None)
if root:
    print(f"Root: {root['name']}")
    print(f"  id: {root['id']} (type: {type(root['id']).__name__})")
    print(f"  parent_item: {root['parent_item']}")
    
    # Find a child
    child = next((i for i in serialized_items if i['parent_item'] == root['id']), None)
    if child:
        print(f"\nChild: {child['name']}")
        print(f"  id: {child['id']} (type: {type(child['id']).__name__})")
        print(f"  parent_item: {child['parent_item']} (type: {type(child['parent_item']).__name__})")
        print(f"  Match with root.id: {child['parent_item'] == root['id']}")
