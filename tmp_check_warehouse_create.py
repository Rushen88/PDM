import json
import sys
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError, URLError

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000/api/v1'


def http_json(method: str, url: str, payload=None, headers=None):
    # Avoid system proxy settings (common source of 502 when calling localhost)
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
    status, body = http_json(
        'POST',
        f'{BASE}/auth/login/',
        {'username': 'admin', 'password': 'admin123'},
    )
    print('LOGIN_STATUS', status)
    print(body)
    if status >= 400:
        sys.exit(1)

    token = json.loads(body).get('access')
    headers = {'Authorization': f'Bearer {token}'}

    status, body = http_json(
        'POST',
        f'{BASE}/warehouses/',
        {
            'name': 'Тестовый склад API',
            'address': 'Тестовый адрес',
            'description': 'Создан через tmp_check_warehouse_create.py',
            'is_active': True,
        },
        headers=headers,
    )
    print('CREATE_STATUS', status)
    print(body)


if __name__ == '__main__':
    main()
