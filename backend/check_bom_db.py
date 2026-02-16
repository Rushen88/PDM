"""Check BOM data in database."""
import os
import django

os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from infrastructure.persistence.models import BOMStructure, BOMItem, NomenclatureItem

print('=== BOM Structures ===')
for bom in BOMStructure.objects.all():
    root_code = bom.root_item.code if bom.root_item else 'NULL'
    print(f'BOM id={bom.id}')
    print(f'    root_item={bom.root_item_id} ({root_code})')
    print(f'    name={bom.name}')
    items_count = bom.items.count()
    components_count = bom.items.filter(parent_item__isnull=False).count()
    print(f'    total_items={items_count}, components={components_count}')
    print()

print('=== Nomenclature with has_bom check ===')
for nom in NomenclatureItem.objects.filter(is_active=True).order_by('code')[:20]:
    bom = nom.bom_structures.filter(is_active=True).first()
    has_components = False
    if bom:
        has_components = bom.items.filter(parent_item__isnull=False).exists()
    
    bom_id_str = str(bom.id)[:8] if bom else 'None'
    print(f'{nom.code}: bom_exists={bom is not None}, bom_id={bom_id_str}..., has_components={has_components}')

print()
print('=== Checking BOM uniqueness by root_item ===')
from collections import Counter
root_items = [str(bom.root_item_id) for bom in BOMStructure.objects.all()]
counter = Counter(root_items)
for root_item, count in counter.items():
    if count > 1:
        print(f'ERROR: root_item {root_item} has {count} BOMs!')
    else:
        nom = NomenclatureItem.objects.filter(id=root_item).first()
        print(f'OK: root_item {root_item} ({nom.code if nom else "?"}) has 1 BOM')
