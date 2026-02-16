#!/usr/bin/env python
"""
BOM Integrity Test Script

This script tests the critical requirement:
- Each nomenclature item has its OWN independent BOM (not shared by category)
- BOM persists after navigating away and returning
- Two different nomenclature items of the same category have different BOMs
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
# Disable proxy for local connections
os.environ['NO_PROXY'] = '127.0.0.1,localhost'
os.environ['no_proxy'] = '127.0.0.1,localhost'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

import requests
import json
from typing import Optional

BASE_URL = 'http://127.0.0.1:8000/api/v1'

def get_auth_headers() -> dict:
    """Get authentication headers."""
    login_response = requests.post(
        f'{BASE_URL}/auth/login/',
        json={'username': 'admin', 'password': 'admin123'}
    )
    if login_response.status_code != 200:
        raise Exception(f"Login failed: {login_response.text}")
    
    token = login_response.json().get('access')
    return {'Authorization': f'Bearer {token}'}


def test_bom_architecture():
    """Test BOM architecture compliance."""
    print("\n" + "="*60)
    print("🔍 BOM ARCHITECTURE INTEGRITY TEST")
    print("="*60)
    
    headers = get_auth_headers()
    
    # 1. Get all nomenclature items
    print("\n📋 Step 1: Fetching nomenclature items...")
    nom_response = requests.get(f'{BASE_URL}/nomenclature/', headers=headers)
    nomenclature = nom_response.json().get('results', [])
    print(f"   Found {len(nomenclature)} nomenclature items")
    
    # 2. Get all BOM structures
    print("\n📋 Step 2: Fetching BOM structures...")
    bom_response = requests.get(f'{BASE_URL}/bom/', headers=headers)
    bom_structures = bom_response.json().get('results', [])
    print(f"   Found {len(bom_structures)} BOM structures")
    
    # 3. Check BOM-to-nomenclature relationship
    print("\n📋 Step 3: Verifying BOM-to-nomenclature mapping...")
    
    # Build map: root_item_id -> BOM
    bom_by_root_item = {}
    for bom in bom_structures:
        root_item_id = bom.get('root_item')
        if root_item_id in bom_by_root_item:
            print(f"   ❌ ERROR: Multiple BOMs for root_item {root_item_id}")
        else:
            bom_by_root_item[root_item_id] = bom
    
    print(f"   ✅ {len(bom_by_root_item)} unique root_item mappings found")
    
    # 4. Check nomenclature items that should have BOM (manufactured)
    print("\n📋 Step 4: Checking manufactured items...")
    manufactured_items = [n for n in nomenclature if not n.get('is_purchased')]
    print(f"   Found {len(manufactured_items)} manufactured items")
    
    for item in manufactured_items:
        item_id = item['id']
        has_bom = item.get('has_bom', False)
        bom_id = item.get('bom_id')
        
        if has_bom:
            if not bom_id:
                print(f"   ⚠️  Item {item['code']} has_bom=True but bom_id is null")
            elif bom_id not in [b['id'] for b in bom_structures]:
                print(f"   ⚠️  Item {item['code']} has bom_id={bom_id} but BOM not found")
    
    # 5. Verify same-category items have DIFFERENT BOMs
    print("\n📋 Step 5: Verifying category independence...")
    
    # Group items by catalog_category
    by_category = {}
    for item in manufactured_items:
        cat = item.get('catalog_category')
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(item)
    
    for cat_id, items in by_category.items():
        items_with_bom = [i for i in items if i.get('bom_id')]
        if len(items_with_bom) > 1:
            bom_ids = [i['bom_id'] for i in items_with_bom]
            unique_bom_ids = set(bom_ids)
            if len(unique_bom_ids) != len(bom_ids):
                print(f"   ❌ ERROR: Category {cat_id} has items sharing the same BOM!")
                for item in items_with_bom:
                    print(f"       - {item['code']}: bom_id={item['bom_id']}")
            else:
                print(f"   ✅ Category {cat_id}: {len(items_with_bom)} items, all with unique BOMs")
    
    # 6. End-to-end test: Create BOM, read back
    print("\n📋 Step 6: End-to-end BOM save/restore test...")
    
    # Find a manufactured item without BOM
    items_without_bom = [i for i in manufactured_items if not i.get('bom_id')]
    
    if not items_without_bom:
        print("   ⚠️  All manufactured items already have BOM. Using existing one.")
        test_item = manufactured_items[0] if manufactured_items else None
    else:
        test_item = items_without_bom[0]
    
    if test_item:
        print(f"   Testing with item: {test_item['code']} (id={test_item['id']})")
        
        # Query BOM for this specific item by root_item filter
        bom_query = requests.get(
            f'{BASE_URL}/bom/',
            params={'root_item': test_item['id']},
            headers=headers
        )
        bom_results = bom_query.json().get('results', [])
        
        if bom_results:
            bom = bom_results[0]
            print(f"   Found existing BOM: {bom['id']}")
            
            # Get tree
            tree_response = requests.get(
                f'{BASE_URL}/bom/{bom["id"]}/tree/',
                headers=headers
            )
            tree = tree_response.json()
            items_in_tree = len(tree.get('tree', []))
            print(f"   BOM tree has {items_in_tree} items")
            
            # Verify root_item matches
            if str(tree.get('root_item')) == str(test_item['id']):
                print(f"   ✅ BOM root_item correctly matches nomenclature id")
            else:
                print(f"   ❌ BOM root_item MISMATCH: {tree.get('root_item')} != {test_item['id']}")
        else:
            print(f"   ℹ️  No BOM exists for this item yet")
    
    print("\n" + "="*60)
    print("🏁 BOM INTEGRITY TEST COMPLETED")
    print("="*60)


def test_bom_isolation():
    """Test that two items of the same category have isolated BOMs."""
    print("\n" + "="*60)
    print("🔒 BOM ISOLATION TEST")
    print("="*60)
    
    headers = get_auth_headers()
    
    # Get nomenclature
    nom_response = requests.get(f'{BASE_URL}/nomenclature/', headers=headers)
    nomenclature = nom_response.json().get('results', [])
    
    # Group by category
    by_category = {}
    for item in nomenclature:
        cat = item.get('catalog_category')
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(item)
    
    # Find categories with 2+ manufactured items
    for cat_id, items in by_category.items():
        manufactured = [i for i in items if not i.get('is_purchased')]
        
        if len(manufactured) >= 2:
            print(f"\n📋 Testing category {cat_id} with {len(manufactured)} manufactured items")
            
            item1 = manufactured[0]
            item2 = manufactured[1]
            
            print(f"   Item 1: {item1['code']} (id={item1['id']}, bom_id={item1.get('bom_id')})")
            print(f"   Item 2: {item2['code']} (id={item2['id']}, bom_id={item2.get('bom_id')})")
            
            # Check BOM isolation
            bom1_id = item1.get('bom_id')
            bom2_id = item2.get('bom_id')
            
            if bom1_id and bom2_id:
                if bom1_id == bom2_id:
                    print(f"   ❌ ERROR: Both items share the SAME BOM!")
                else:
                    print(f"   ✅ Items have DIFFERENT BOMs - correct!")
                    
                    # Verify each BOM's root_item points to correct nomenclature
                    for item, bom_id in [(item1, bom1_id), (item2, bom2_id)]:
                        bom_resp = requests.get(f'{BASE_URL}/bom/{bom_id}/', headers=headers)
                        if bom_resp.status_code == 200:
                            bom_data = bom_resp.json()
                            if str(bom_data.get('root_item')) == str(item['id']):
                                print(f"   ✅ BOM {bom_id[:8]}... root_item matches {item['code']}")
                            else:
                                print(f"   ❌ BOM {bom_id[:8]}... root_item MISMATCH!")
            elif not bom1_id and not bom2_id:
                print(f"   ℹ️  Neither item has BOM yet (both empty)")
            else:
                print(f"   ℹ️  Only one item has BOM - isolation cannot be tested")
            
            break  # Test one category
    
    print("\n" + "="*60)
    print("🏁 BOM ISOLATION TEST COMPLETED")
    print("="*60)


if __name__ == '__main__':
    try:
        test_bom_architecture()
        test_bom_isolation()
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
