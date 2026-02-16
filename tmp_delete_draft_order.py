import os, sys, requests
os.environ['NO_PROXY']='127.0.0.1,localhost'
os.environ['no_proxy']='127.0.0.1,localhost'
BASE='http://127.0.0.1:8000/api/v1'
s=requests.Session(); s.trust_env=False
login=s.post(f'{BASE}/auth/login/', json={'username':'admin','password':'admin123'}, timeout=10)
print('login', login.status_code)
headers={'Authorization': f"Bearer {login.json().get('access')}"}
resp=s.get(f'{BASE}/purchase-orders/', headers=headers, params={'page_size': 50}, timeout=20)
orders=(resp.json().get('results') or [])
draft=next((o for o in orders if o.get('status')=='draft'), None)
if not draft:
    print('no draft')
    sys.exit(0)
order_id=draft['id']
print('delete draft', order_id, draft.get('number'))
del_resp=s.delete(f'{BASE}/purchase-orders/{order_id}/', headers=headers, timeout=20)
print('delete', del_resp.status_code)
print(del_resp.text[:800])
