"""Debug script to check API response format."""

import os
import sys
import json
import django

# Setup Django
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
django.setup()

from infrastructure.persistence.models import Project, ProjectItem
from presentation.api.v1.serializers.project import ProjectItemListSerializer


def check_api_format():
    """Check how serializer formats parent_item."""
    print("=" * 60)
    print("CHECKING API RESPONSE FORMAT")
    print("=" * 60)
    
    project = Project.objects.first()
    if not project:
        print("No project found!")
        return
    
    items = ProjectItem.objects.filter(project=project).select_related(
        'parent_item', 'nomenclature_item', 'contractor', 'supplier', 
        'responsible', 'delay_reason'
    )[:20]
    
    serializer = ProjectItemListSerializer(items, many=True)
    data = serializer.data
    
    print(f"\nSerialized {len(data)} items:")
    print("-" * 60)
    
    # Check parent_item format
    for item in data:
        parent = item.get('parent_item')
        name = item.get('name', 'Unknown')[:30]
        item_id = str(item.get('id', ''))[:8]
        
        parent_type = type(parent).__name__
        parent_str = str(parent)[:20] if parent else 'None'
        
        print(f"ID: {item_id}... | Parent: {parent_str:20s} (type: {parent_type:10s}) | Name: {name}")
    
    # Verify parent_item is a string, not UUID
    print("\n" + "-" * 60)
    print("VERIFICATION:")
    
    problems = []
    for item in data:
        parent = item.get('parent_item')
        if parent is not None and not isinstance(parent, str):
            problems.append({
                'id': item.get('id'),
                'name': item.get('name'),
                'parent_type': type(parent).__name__
            })
    
    if problems:
        print(f"FOUND {len(problems)} PROBLEMS:")
        for p in problems:
            print(f"  - {p['name']}: parent_item is {p['parent_type']}, should be str")
    else:
        print("OK - All parent_item values are strings (or None)")
    
    # Check if IDs match
    print("\n" + "-" * 60)
    print("CHECKING PARENT REFERENCES:")
    
    all_ids = set(str(item.get('id')) for item in data)
    items_with_parent = [item for item in data if item.get('parent_item')]
    
    for item in items_with_parent[:5]:
        parent_id = item.get('parent_item')
        exists = parent_id in all_ids
        name = item.get('name', 'Unknown')[:30]
        print(f"  {name}: parent={parent_id[:8]}... exists_in_data={exists}")


if __name__ == '__main__':
    check_api_format()
