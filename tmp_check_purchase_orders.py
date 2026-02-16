import os
import sys
import requests

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"

BASE = "http://127.0.0.1:8000/api/v1"

s = requests.Session(); s.trust_env = False
login = s.post(f"{BASE}/auth/login/", json={"username":"admin","password":"admin123"}, timeout=10)
print('login', login.status_code)
if login.status_code != 200:
    print(login.text)
    sys.exit(1)
headers = {"Authorization": f"Bearer {login.json().get('access')}"}

resp = s.get(f"{BASE}/purchase-orders/", headers=headers, params={"page_size": 50}, timeout=20)
print('list', resp.status_code)
if resp.status_code != 200:
    print(resp.text[:800])
    sys.exit(1)

data = resp.json()
orders = data.get('results') or []
print('orders', len(orders), 'count', data.get('count'))
for o in orders[:10]:
    print('-', o.get('id'), o.get('number'), o.get('status'))

# Find a draft
Draft = next((o for o in orders if o.get('status') == 'draft'), None)
if not Draft:
    print('no draft orders in first page')
    sys.exit(0)

order_id = Draft['id']
print('\nDraft order:', order_id, Draft.get('number'))

# Try confirm
c = s.post(f"{BASE}/purchase-orders/{order_id}/confirm/", headers=headers, timeout=20)
print('confirm', c.status_code)
print(c.text[:600])

# Reload and try delete (should now fail because not draft anymore)
d = s.delete(f"{BASE}/purchase-orders/{order_id}/", headers=headers, timeout=20)
print('delete', d.status_code)
print(d.text[:600])
