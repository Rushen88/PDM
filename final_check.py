"""Final check: verify structure is displayed correctly."""

import os
import sys
import django

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
django.setup()

from infrastructure.persistence.models import Project, ProjectItem
from presentation.api.v1.serializers.project import ProjectItemListSerializer


def final_check():
    """Final verification of the structure."""
    print("=" * 70)
    print("FINAL CHECK: PROJECT STRUCTURE")
    print("=" * 70)
    
    project = Project.objects.first()
    if not project:
        print("❌ No project found!")
        return False
    
    print(f"\n✓ Project: {project.name}")
    
    # Get all items with proper relations
    items = ProjectItem.objects.filter(project=project).select_related(
        'nomenclature_item__catalog_category',
        'parent_item', 'contractor', 'supplier', 'responsible', 'delay_reason'
    )
    
    print(f"✓ Total items in DB: {items.count()}")
    
    # Serialize items
    serializer = ProjectItemListSerializer(items, many=True)
    data = serializer.data
    
    print(f"✓ Serialized items: {len(data)}")
    
    # Check root items
    root_items = [item for item in data if item.get('parent_item') is None]
    print(f"\n✓ Root items (no parent): {len(root_items)}")
    
    if len(root_items) != 1:
        print(f"❌ ERROR: Expected 1 root item, got {len(root_items)}")
        return False
    
    root = root_items[0]
    print(f"  - Root: {root['name']}")
    
    # Build tree structure
    item_map = {str(item['id']): item for item in data}
    for item in data:
        item['children'] = []
    
    for item in data:
        parent_id = item.get('parent_item')
        if parent_id and parent_id in item_map:
            item_map[parent_id]['children'].append(item)
    
    # Check root children
    root_children_count = len(root['children'])
    print(f"\n✓ Root has {root_children_count} direct children")
    
    if root_children_count != 8:
        print(f"❌ ERROR: Expected 8 direct children, got {root_children_count}")
        print("Children:")
        for child in root['children']:
            print(f"  - {child['name']}")
        return False
    
    print("\nDirect children of root:")
    for idx, child in enumerate(root['children'], 1):
        child_children_count = len(child['children'])
        is_purchased = child.get('is_purchased', False)
        type_label = "ЗАКУП" if is_purchased else "ИЗГОТ"
        print(f"  {idx}. {child['name']:30s} | Children: {child_children_count:2d} | {type_label}")
    
    # Verify is_purchased field
    print("\n✓ Checking is_purchased field:")
    has_is_purchased = all('is_purchased' in item for item in data)
    if not has_is_purchased:
        print("❌ ERROR: Some items don't have is_purchased field")
        return False
    
    purchased_count = sum(1 for item in data if item.get('is_purchased') == True)
    manufactured_count = sum(1 for item in data if item.get('is_purchased') == False)
    
    print(f"  - Purchased items: {purchased_count}")
    print(f"  - Manufactured items: {manufactured_count}")
    print(f"  - Total: {purchased_count + manufactured_count}")
    
    # Check tree depth
    def get_max_depth(item, depth=0):
        if not item['children']:
            return depth
        return max(get_max_depth(child, depth + 1) for child in item['children'])
    
    max_depth = get_max_depth(root)
    print(f"\n✓ Maximum tree depth: {max_depth} levels")
    
    print("\n" + "=" * 70)
    print("✅ ALL CHECKS PASSED!")
    print("=" * 70)
    print("\nStructure is ready to display:")
    print("- Root: СТЕНД 001 with 8 direct children")
    print("- All items have is_purchased field")
    print("- Tree structure is correct")
    print("\nFrontend should now display the hierarchy correctly!")
    
    return True


if __name__ == '__main__':
    success = final_check()
    sys.exit(0 if success else 1)
