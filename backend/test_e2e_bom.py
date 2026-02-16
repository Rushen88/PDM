#!/usr/bin/env python
"""
End-to-End BOM Test Script

Tests the critical user requirement:
1. Create BOM for item A
2. "Navigate away" (verify via different API call)
3. "Return" and verify BOM is still there
4. Create BOM for item B (same category)
5. Verify item A and B have DIFFERENT BOMs
"""

import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ['NO_PROXY'] = '127.0.0.1,localhost'
os.environ['no_proxy'] = '127.0.0.1,localhost'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

import requests
import json
import uuid

BASE_URL = 'http://127.0.0.1:8000/api/v1'

def get_auth_headers():
    """Get authentication headers."""
    login_response = requests.post(
        f'{BASE_URL}/auth/login/',
        json={'username': 'admin', 'password': 'admin123'}
    )
    if login_response.status_code != 200:
        raise Exception(f"Login failed: {login_response.text}")
    
    token = login_response.json().get('access')
    return {'Authorization': f'Bearer {token}'}


def test_e2e_bom():
    print("\n" + "="*60)
    print("🧪 END-TO-END BOM TEST")
    print("="*60)
    
    headers = get_auth_headers()
    
    # 1. Get all nomenclature items
    print("\n📋 Step 1: Fetching nomenclature items...")
    response = requests.get(f'{BASE_URL}/nomenclature/', headers=headers)
    nomenclature = response.json().get('results', [])
    
    # Find manufactured items (non-purchased)
    manufactured = [n for n in nomenclature if not n.get('is_purchased')]
    print(f"   Found {len(manufactured)} manufactured items")
    
    if len(manufactured) < 2:
        print("   ❌ Need at least 2 manufactured items for test")
        return
    
    # Pick two items (preferably from same category)
    item_a = None
    item_b = None
    
    # Group by category
    by_category = {}
    for item in manufactured:
        cat = item.get('catalog_category')
        if cat:
            by_category.setdefault(cat, []).append(item)
    
    # Find category with 2+ items
    for cat, items in by_category.items():
        if len(items) >= 2:
            item_a = items[0]
            item_b = items[1]
            print(f"   Found category {cat} with {len(items)} items")
            break
    
    if not item_a or not item_b:
        # Just pick any two manufactured items
        item_a = manufactured[0]
        item_b = manufactured[1]
    
    print(f"\n   Item A: {item_a['code']} (id={item_a['id']}, has_bom={item_a.get('has_bom')}, bom_id={item_a.get('bom_id')})")
    print(f"   Item B: {item_b['code']} (id={item_b['id']}, has_bom={item_b.get('has_bom')}, bom_id={item_b.get('bom_id')})")
    
    # 2. Get existing BOM for item A (or create one)
    print("\n📋 Step 2: Checking/creating BOM for Item A...")
    
    bom_a_response = requests.get(f'{BASE_URL}/bom/?root_item={item_a["id"]}', headers=headers)
    bom_a_list = bom_a_response.json().get('results', [])
    
    if bom_a_list:
        bom_a = bom_a_list[0]
        print(f"   ✅ Item A already has BOM: {bom_a['id']}")
    else:
        # Create BOM for item A
        print("   Creating new BOM for Item A...")
        create_response = requests.post(
            f'{BASE_URL}/bom/',
            headers=headers,
            json={
                'root_item': item_a['id'],
                'name': f"Test BOM for {item_a['code']}"
            }
        )
        if create_response.status_code in [200, 201]:
            bom_a = create_response.json()
            print(f"   ✅ Created BOM for Item A: {bom_a['id']}")
        else:
            print(f"   ❌ Failed to create BOM: {create_response.status_code} - {create_response.text}")
            return
    
    # 3. "Navigate away" - do other API calls
    print("\n📋 Step 3: Simulating navigation away (fetching other data)...")
    requests.get(f'{BASE_URL}/nomenclature/', headers=headers)
    requests.get(f'{BASE_URL}/bom/', headers=headers)
    print("   ✅ Simulated navigation")
    
    # 4. "Return" - check BOM is still there
    print("\n📋 Step 4: Returning to Item A - verifying BOM persists...")
    
    # Re-fetch nomenclature to get updated has_bom status
    response = requests.get(f'{BASE_URL}/nomenclature/{item_a["id"]}/', headers=headers)
    item_a_updated = response.json()
    
    bom_a_response = requests.get(f'{BASE_URL}/bom/?root_item={item_a["id"]}', headers=headers)
    bom_a_list = bom_a_response.json().get('results', [])
    
    if bom_a_list and bom_a_list[0]['id'] == bom_a['id']:
        print(f"   ✅ BOM persists! ID: {bom_a['id']}")
        print(f"   ✅ Item A has_bom={item_a_updated.get('has_bom')}, bom_id={item_a_updated.get('bom_id')}")
    else:
        print("   ❌ BOM was LOST after navigation!")
        return
    
    # 5. Create/check BOM for Item B
    print("\n📋 Step 5: Checking/creating BOM for Item B...")
    
    bom_b_response = requests.get(f'{BASE_URL}/bom/?root_item={item_b["id"]}', headers=headers)
    bom_b_list = bom_b_response.json().get('results', [])
    
    if bom_b_list:
        bom_b = bom_b_list[0]
        print(f"   ✅ Item B already has BOM: {bom_b['id']}")
    else:
        print("   Creating new BOM for Item B...")
        create_response = requests.post(
            f'{BASE_URL}/bom/',
            headers=headers,
            json={
                'root_item': item_b['id'],
                'name': f"Test BOM for {item_b['code']}"
            }
        )
        if create_response.status_code in [200, 201]:
            bom_b = create_response.json()
            print(f"   ✅ Created BOM for Item B: {bom_b['id']}")
        else:
            print(f"   ❌ Failed to create BOM: {create_response.status_code} - {create_response.text}")
            return
    
    # 6. Verify Item A and Item B have DIFFERENT BOMs
    print("\n📋 Step 6: Verifying BOM isolation...")
    
    # Re-check both BOMs
    bom_a_response = requests.get(f'{BASE_URL}/bom/?root_item={item_a["id"]}', headers=headers)
    bom_a_final = bom_a_response.json().get('results', [])[0]
    
    bom_b_response = requests.get(f'{BASE_URL}/bom/?root_item={item_b["id"]}', headers=headers)
    bom_b_final = bom_b_response.json().get('results', [])[0]
    
    print(f"\n   Item A ({item_a['code']}) BOM ID: {bom_a_final['id']}")
    print(f"   Item B ({item_b['code']}) BOM ID: {bom_b_final['id']}")
    
    if bom_a_final['id'] != bom_b_final['id']:
        print("\n   ✅ SUCCESS! Items A and B have DIFFERENT independent BOMs")
    else:
        print("\n   ❌ FAILURE! Items A and B share the SAME BOM (should never happen)")
        return
    
    # 7. Final verification - try to create duplicate BOM for Item A
    print("\n📋 Step 7: Testing duplicate BOM prevention...")
    
    duplicate_response = requests.post(
        f'{BASE_URL}/bom/',
        headers=headers,
        json={
            'root_item': item_a['id'],
            'name': f"Duplicate BOM for {item_a['code']}"
        }
    )
    
    if duplicate_response.status_code in [400, 409]:
        print(f"   ✅ Server correctly rejected duplicate BOM (status={duplicate_response.status_code})")
    elif duplicate_response.status_code in [200, 201]:
        print("   ⚠️  Server allowed creating duplicate BOM - may need to check constraint")
        # Check if it's actually a different BOM
        new_bom = duplicate_response.json()
        if new_bom['id'] == bom_a_final['id']:
            print("   ℹ️  Server returned existing BOM instead of creating duplicate")
        else:
            print(f"   ❌ CRITICAL: Created duplicate BOM! ID: {new_bom['id']}")
    else:
        print(f"   ℹ️  Response: {duplicate_response.status_code} - {duplicate_response.text}")
    
    print("\n" + "="*60)
    print("🏁 END-TO-END BOM TEST COMPLETED")
    print("="*60)


if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    
    try:
        test_e2e_bom()
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
