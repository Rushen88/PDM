import os
import requests
from datetime import date

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

warehouses = s.get(f'{BASE_URL}/warehouses/', headers=headers, timeout=10)
print('warehouses', warehouses.status_code)
warehouses.raise_for_status()
warehouses_data = warehouses.json()
first = (warehouses_data.get('results') or [None])[0]
print('first warehouse:', first)

if not first:
    raise SystemExit('No warehouses found')

payload = {
    'warehouse': first['id'],
    'planned_date': date.today().isoformat(),
    'document_type': 'full',
    'notes': 'tmp test',
    'commission_members': [],
}

create = s.post(f'{BASE_URL}/inventory-documents/', headers=headers, json=payload, timeout=10)
print('create', create.status_code)
text = create.text or ''
print(text[:2000])

if create.status_code >= 500:
    # Try to extract the headline from Django debug page
    import re
    m = re.search(r'<h1[^>]*>(.*?)</h1>', text, re.IGNORECASE | re.DOTALL)
    if m:
        headline = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', m.group(1))).strip()
        print('\nHEADLINE:', headline)

    m = re.search(r'Exception Value:\s*</th>\s*<td class="code">\s*<pre>(.*?)</pre>', text, re.IGNORECASE | re.DOTALL)
    if m:
        exc_value = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', m.group(1))).strip()
        print('EXCEPTION VALUE:', exc_value)
    else:
        if 'Exception Value' in text:
            idx = text.lower().find('exception value')
            print('EXCEPTION VALUE (raw excerpt):', text[idx:idx+500])
        else:
            print('EXCEPTION VALUE: <not found in response HTML>')
