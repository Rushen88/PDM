import os
import requests
from datetime import date, timedelta

os.environ['NO_PROXY'] = '127.0.0.1,localhost'
os.environ['no_proxy'] = '127.0.0.1,localhost'

BASE_URL = 'http://127.0.0.1:8000/api/v1'

s = requests.Session()
s.trust_env = False

login = s.post(f'{BASE_URL}/auth/login/', json={'username': 'admin', 'password': 'admin123'}, timeout=10)
print('login', login.status_code)
login.raise_for_status()
token = login.json()['access']
headers = {'Authorization': f'Bearer {token}'}

# Get project items
items = s.get(f'{BASE_URL}/project-items/?page_size=5', headers=headers, timeout=10)
print('project-items', items.status_code)
items_data = items.json()
print(f'Count: {items_data.get("count")}')

if items_data.get('results'):
    item = items_data['results'][0]
    item_id = item['id']
    print(f'\nTesting update on item: {item_id}')
    print(f'  name: {item.get("name")}')
    print(f'  current quantity: {item.get("quantity")}')
    print(f'  current planned_start: {item.get("planned_start")}')
    
    # Test 1: Update quantity
    print('\n--- Test 1: Update quantity ---')
    r = s.patch(f'{BASE_URL}/project-items/{item_id}/', headers=headers, json={'quantity': 5}, timeout=10)
    print(f'  status: {r.status_code}')
    if r.status_code >= 400:
        # Extract exception from HTML
        import re
        m = re.search(r'Exception Value:\s*</th>\s*<td[^>]*>\s*<pre>(.*?)</pre>', r.text, re.IGNORECASE | re.DOTALL)
        if m:
            exc_value = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', m.group(1))).strip()
            print(f'  EXCEPTION: {exc_value}')
    else:
        print(f'  new quantity: {r.json().get("quantity")}')
    
    # Test 2: Update planned_start 
    print('\n--- Test 2: Update planned_start ---')
    new_date = (date.today() + timedelta(days=10)).isoformat()
    r = s.patch(f'{BASE_URL}/project-items/{item_id}/', headers=headers, json={'planned_start': new_date}, timeout=10)
    print(f'  status: {r.status_code}')
    if r.status_code >= 400:
        print(f'  error: {r.text[:500]}')
    else:
        print(f'  new planned_start: {r.json().get("planned_start")}')
    
    # Test 3: Update manufacturing_status
    print('\n--- Test 3: Update manufacturing_status ---')
    r = s.patch(f'{BASE_URL}/project-items/{item_id}/', headers=headers, json={'manufacturing_status': 'in_progress'}, timeout=10)
    print(f'  status: {r.status_code}')
    if r.status_code >= 400:
        print(f'  error: {r.text[:500]}')
    else:
        print(f'  new manufacturing_status: {r.json().get("manufacturing_status")}')
        
    # Test 4: Update responsible
    print('\n--- Test 4: Update responsible ---')
    users = s.get(f'{BASE_URL}/users/?page_size=1', headers=headers, timeout=10).json()
    if users.get('results'):
        user_id = users['results'][0]['id']
        r = s.patch(f'{BASE_URL}/project-items/{item_id}/', headers=headers, json={'responsible': user_id}, timeout=10)
        print(f'  status: {r.status_code}')
        if r.status_code >= 400:
            print(f'  error: {r.text[:500]}')
        else:
            print(f'  new responsible: {r.json().get("responsible")}')
