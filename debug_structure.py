"""Debug script to analyze project structure."""

import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
django.setup()

from infrastructure.persistence.models import Project, ProjectItem, BOMStructure, BOMItem


def analyze_project_structure():
    """Analyze the project structure in database."""
    print("=" * 60)
    print("ANALYZING PROJECT STRUCTURE")
    print("=" * 60)
    
    # Get the project
    project = Project.objects.first()
    if not project:
        print("No project found!")
        return
    
    print(f"\nProject: {project.name} (ID: {project.id})")
    
    # Get all project items
    items = ProjectItem.objects.filter(project=project).select_related(
        'parent_item', 'nomenclature_item'
    ).order_by('id')
    
    print(f"Total items: {items.count()}")
    
    # Find root items (no parent)
    root_items = items.filter(parent_item__isnull=True)
    print(f"\nROOT items (no parent): {root_items.count()}")
    for item in root_items:
        print(f"  - {item.name} (ID: {item.id})")
    
    # Analyze parent-child relationships
    print("\n" + "-" * 60)
    print("PARENT-CHILD ANALYSIS:")
    
    items_by_parent = {}
    for item in items:
        parent_id = str(item.parent_item_id) if item.parent_item_id else 'ROOT'
        if parent_id not in items_by_parent:
            items_by_parent[parent_id] = []
        items_by_parent[parent_id].append(item)
    
    print(f"\nItems grouped by parent:")
    for parent_id, children in items_by_parent.items():
        if parent_id == 'ROOT':
            print(f"  ROOT: {len(children)} items")
        else:
            parent = items.filter(id=parent_id).first()
            parent_name = parent.name if parent else "UNKNOWN"
            print(f"  {parent_name[:30]:30s}: {len(children)} children")
    
    # Check for orphans (parent_item points to non-existent item)
    print("\n" + "-" * 60)
    print("CHECKING FOR ORPHANS:")
    
    item_ids = set(str(item.id) for item in items)
    orphans = []
    for item in items:
        if item.parent_item_id:
            if str(item.parent_item_id) not in item_ids:
                orphans.append(item)
    
    if orphans:
        print(f"FOUND {len(orphans)} orphan items (parent not in project):")
        for orphan in orphans[:10]:
            print(f"  - {orphan.name} (parent: {orphan.parent_item_id})")
    else:
        print("No orphans found.")
    
    # Print tree structure
    print("\n" + "-" * 60)
    print("TREE STRUCTURE (first 3 levels):")
    
    def print_tree(parent_id, level=0, max_level=3):
        if level >= max_level:
            return
        children = items_by_parent.get(str(parent_id) if parent_id else 'ROOT', [])
        for child in children[:10]:  # Limit to 10 children per level
            indent = "  " * level
            child_count = len(items_by_parent.get(str(child.id), []))
            print(f"{indent}- {child.name} ({child_count} children)")
            if child_count > 0:
                print_tree(child.id, level + 1, max_level)
    
    print_tree(None)
    
    # Analyze BOM structure for comparison
    print("\n" + "=" * 60)
    print("BOM STRUCTURE ANALYSIS")
    print("=" * 60)
    
    bom = BOMStructure.objects.filter(is_active=True).first()
    if bom:
        print(f"\nBOM: {bom.name} (Root: {bom.root_item.name if bom.root_item else 'None'})")
        
        bom_items = BOMItem.objects.filter(bom=bom).select_related(
            'parent_item', 'child_item'
        )
        print(f"Total BOM items: {bom_items.count()}")
        
        # Find root BOM items (parent_item = root_item or None)
        root_bom_items = bom_items.filter(parent_item=bom.root_item)
        print(f"\nDirect children of root item ({bom.root_item.name if bom.root_item else 'None'}):")
        for item in root_bom_items:
            print(f"  - {item.child_item.name} (qty: {item.quantity})")


if __name__ == '__main__':
    analyze_project_structure()
