import os
import sys
import requests

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"

BASE = "http://127.0.0.1:8000/api/v1"
USERNAME = "admin"
PASSWORD = "admin123"

PROJECT_NAMES = [
    "сб. ед. 000001",
    "Подсистема 00001",
]

s = requests.Session()
s.trust_env = False

login = s.post(f"{BASE}/auth/login/", json={"username": USERNAME, "password": PASSWORD}, timeout=10)
print("login", login.status_code)
if login.status_code != 200:
    print(login.text)
    sys.exit(1)

token = login.json().get("access")
headers = {"Authorization": f"Bearer {token}"}

for name in PROJECT_NAMES:
    resp = s.get(f"{BASE}/projects/", headers=headers, params={"search": name, "page_size": 50}, timeout=20)
    print("\nprojects search", repr(name), resp.status_code)
    if resp.status_code != 200:
        print(resp.text[:400])
        continue

    data = resp.json()
    results = data.get("results") or []
    match = None
    for p in results:
        if (p.get("name") or "").strip() == name:
            match = p
            break

    if not match and results:
        match = results[0]

    if not match:
        print("  not found")
        continue

    pid = match.get("id")
    print("  project id:", pid)

    items = s.get(f"{BASE}/project-items/", headers=headers, params={"project": pid, "page_size": 2000}, timeout=30)
    print("  project-items", items.status_code)
    if items.status_code != 200:
        print(items.text[:800])
        continue

    items_data = items.json()
    results = items_data.get("results") or []
    roots = [r for r in results if not r.get("parent_item")]
    print("  items:", len(results), "roots:", len(roots))
    if roots:
        print("  root sample:", roots[0].get("name"), "id", roots[0].get("id"))
