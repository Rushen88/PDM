"""Debug script to simulate frontend API call."""

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


def simulate_frontend_call():
    """Simulate the API call that frontend makes."""
    print("=" * 60)
    print("SIMULATING FRONTEND API CALL")
    print("=" * 60)
    
    project = Project.objects.first()
    if not project:
        print("No project found!")
        return
    
    print(f"\nProject: {project.name}")
    
    # Simulate the frontend query with page_size=1000
    items = ProjectItem.objects.filter(
        project=project
    ).select_related(
        'project', 'nomenclature_item', 'parent_item',
        'contractor', 'supplier', 'responsible', 'delay_reason'
    )
    
    print(f"Total items in DB: {items.count()}")
    
    serializer = ProjectItemListSerializer(items, many=True)
    data = serializer.data
    
    print(f"Serialized items: {len(data)}")
    
    # Build a map of all IDs
    all_ids = set(str(item.get('id')) for item in data)
    print(f"Unique IDs: {len(all_ids)}")
    
    # Find root items (no parent)
    root_items = [item for item in data if item.get('parent_item') is None]
    print(f"\nRoot items (parent_item=None): {len(root_items)}")
    for item in root_items[:5]:
        print(f"  - {item.get('name')}")
    
    # Find items with parents
    items_with_parent = [item for item in data if item.get('parent_item') is not None]
    print(f"\nItems with parent: {len(items_with_parent)}")
    
    # Check if all parents exist in the data
    orphans = []
    for item in items_with_parent:
        parent_id = item.get('parent_item')
        if parent_id not in all_ids:
            orphans.append({
                'id': item.get('id'),
                'name': item.get('name'),
                'parent_id': parent_id
            })
    
    print(f"\nOrphans (parent not in data): {len(orphans)}")
    if orphans:
        print("First 10 orphans:")
        for o in orphans[:10]:
            print(f"  - {o['name']}: parent={o['parent_id'][:8]}...")
    
    # Build tree like frontend does
    print("\n" + "-" * 60)
    print("BUILDING TREE (like frontend):")
    
    item_map = {}
    for item in data:
        item['treeChildren'] = []
        item['level'] = 0
        item_map[str(item['id'])] = item
    
    roots = []
    found_parent_count = 0
    not_found_parent_count = 0
    
    for item in data:
        parent_id = item.get('parent_item')
        if parent_id:
            parent = item_map.get(parent_id)
            if parent:
                parent['treeChildren'].append(item)
                found_parent_count += 1
            else:
                roots.append(item)
                not_found_parent_count += 1
        else:
            roots.append(item)
    
    print(f"Found parents: {found_parent_count}")
    print(f"Not found parents (orphans added to roots): {not_found_parent_count}")
    print(f"Total roots: {len(roots)}")
    
    print("\nRoots:")
    for root in roots[:10]:
        children_count = len(root.get('treeChildren', []))
        print(f"  - {root['name']} ({children_count} children)")
    
    # The problem is here - if items are ordered wrong, parent might come AFTER child
    print("\n" + "-" * 60)
    print("CHECKING ORDER (parent should come before child):")
    
    id_position = {str(item['id']): idx for idx, item in enumerate(data)}
    out_of_order = []
    
    for item in items_with_parent:
        item_pos = id_position.get(str(item['id']))
        parent_pos = id_position.get(item.get('parent_item'))
        
        if parent_pos is not None and item_pos is not None:
            if item_pos < parent_pos:
                out_of_order.append({
                    'item': item['name'],
                    'item_pos': item_pos,
                    'parent_pos': parent_pos
                })
    
    if out_of_order:
        print(f"WARNING: {len(out_of_order)} items appear BEFORE their parents!")
        for o in out_of_order[:5]:
            print(f"  - {o['item']}: pos={o['item_pos']}, parent_pos={o['parent_pos']}")


if __name__ == '__main__':
    simulate_frontend_call()
