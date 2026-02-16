#!/usr/bin/env python
"""Simple BOM E2E test"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ['NO_PROXY'] = '127.0.0.1,localhost'
sys.path.insert(0, 'D:/B2B/PDM/backend')
django.setup()

import requests
import logging
logging.getLogger('urllib3').setLevel(logging.ERROR)

BASE_URL = 'http://127.0.0.1:8000/api/v1'

# Login
login_resp = requests.post(f'{BASE_URL}/auth/login/', json={'username': 'admin', 'password': 'admin123'})
token = login_resp.json().get('access')
headers = {'Authorization': f'Bearer {token}'}

# Get nomenclature
nom_resp = requests.get(f'{BASE_URL}/nomenclature/', headers=headers)
nomenclature = nom_resp.json().get('results', [])
manufactured = [n for n in nomenclature if not n.get('is_purchased')]

print(f'Total manufactured items: {len(manufactured)}')

# Items with BOM
with_bom = [n for n in manufactured if n.get('has_bom')]
print(f'Items with BOM: {len(with_bom)}')
for item in with_bom:
    code = item['code']
    bom_id = item.get('bom_id')
    print(f'  - {code}: bom_id={bom_id}')

# Test creating BOM for item without BOM
without_bom = [n for n in manufactured if not n.get('has_bom')]
if without_bom:
    item = without_bom[0]
    code = item['code']
    item_id = item['id']
    print(f'\n📋 Creating BOM for {code}...')
    create_resp = requests.post(f'{BASE_URL}/bom/', headers=headers, json={
        'root_item': item_id, 
        'name': f'Test BOM {code}'
    })
    print(f'Create response: {create_resp.status_code}')
    
    if create_resp.status_code in [200, 201]:
        bom = create_resp.json()
        bom_id = bom['id']
        print(f'✅ Created BOM: {bom_id}')
        
        # Simulate navigation away
        print('\n📋 Simulating navigation away...')
        requests.get(f'{BASE_URL}/nomenclature/', headers=headers)
        
        # Verify it persists
        print('\n📋 Returning and verifying BOM persists...')
        verify_resp = requests.get(f'{BASE_URL}/bom/?root_item={item_id}', headers=headers)
        verify_boms = verify_resp.json().get('results', [])
        print(f'Found {len(verify_boms)} BOMs for this item')
        
        if verify_boms:
            matches = verify_boms[0]['id'] == bom_id
            print(f'BOM ID matches: {matches}')
            if matches:
                print('✅ SUCCESS! BOM persisted after navigation')
            else:
                print('❌ FAILURE! BOM changed')
        else:
            print('❌ FAILURE! BOM was lost')
            
        # Try to create duplicate
        print('\n📋 Testing duplicate prevention...')
        dup_resp = requests.post(f'{BASE_URL}/bom/', headers=headers, json={
            'root_item': item_id, 
            'name': f'Duplicate BOM {code}'
        })
        print(f'Duplicate response: {dup_resp.status_code}')
        if dup_resp.status_code in [400, 409]:
            print('✅ Server correctly rejected duplicate BOM')
        else:
            print(f'⚠️ Server response: {dup_resp.status_code}')
            
    else:
        print(f'Error: {create_resp.text[:500]}')
else:
    print('\nAll manufactured items already have BOMs')
    
print('\n✅ Test completed!')
