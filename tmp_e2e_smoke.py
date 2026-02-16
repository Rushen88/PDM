import json
import sys
import time
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000/api/v1'


def http_json(method: str, url: str, payload=None, headers=None):
    opener = build_opener(ProxyHandler({}))
    data = None
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
    req = Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with opener.open(req, timeout=30) as resp:
            body = resp.read().decode('utf-8')
            return resp.status, body
    except HTTPError as e:
        body = e.read().decode('utf-8')
        return e.code, body


def main():
    # 1) Login
    status, body = http_json(
        'POST',
        f'{BASE}/auth/login/',
        {'username': 'admin', 'password': 'admin123'},
    )
    print('LOGIN', status)
    if status >= 400:
        print(body)
        raise SystemExit(1)

    token = json.loads(body).get('access')
    headers = {'Authorization': f'Bearer {token}'}

    # 2) Create role with visibility fields
    suffix = str(int(time.time()))[-6:]
    role_payload = {
        'code': f'smoke_role_{suffix}',
        'name': f'Smoke Role {suffix}',
        'description': 'E2E smoke test role',
        'is_active': True,
        'can_be_production_responsible': True,
        'visibility_type': 'own',
    }
    status, body = http_json('POST', f'{BASE}/roles/', role_payload, headers=headers)
    print('ROLE_CREATE', status)
    if status >= 400:
        print(body)
    else:
        print(body)

    # 3) Create two warehouses
    wh1 = {
        'name': f'Smoke WH A {suffix}',
        'address': 'Smoke address A',
        'description': 'E2E smoke test',
        'is_active': True,
    }
    wh2 = {
        'name': f'Smoke WH B {suffix}',
        'address': 'Smoke address B',
        'description': 'E2E smoke test',
        'is_active': True,
    }

    status, body = http_json('POST', f'{BASE}/warehouses/', wh1, headers=headers)
    print('WH_CREATE_A', status)
    if status >= 400:
        print(body)
        raise SystemExit(1)
    wh1_id = json.loads(body)['id']

    status, body = http_json('POST', f'{BASE}/warehouses/', wh2, headers=headers)
    print('WH_CREATE_B', status)
    if status >= 400:
        print(body)
        raise SystemExit(1)
    wh2_id = json.loads(body)['id']

    # 4) Create stock transfer (without items)
    transfer_payload = {
        'source_warehouse': wh1_id,
        'destination_warehouse': wh2_id,
        'reason': 'Smoke test transfer',
        'notes': 'Created by tmp_e2e_smoke.py',
    }
    status, body = http_json('POST', f'{BASE}/stock-transfers/', transfer_payload, headers=headers)
    print('TRANSFER_CREATE', status)
    print(body)


if __name__ == '__main__':
    main()
