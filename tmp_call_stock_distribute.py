import os
import sys
import requests

os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"

BASE = "http://127.0.0.1:8000/api/v1"
USERNAME = "admin"
PASSWORD = "admin123"
STOCK_ID = "c8bf7485-0f29-4c85-9c0b-d1b18833469a"

s = requests.Session()
s.trust_env = False

login = s.post(f"{BASE}/auth/login/", json={"username": USERNAME, "password": PASSWORD}, timeout=10)
print("login", login.status_code)
if login.status_code != 200:
    print(login.text)
    sys.exit(1)

token = login.json().get("access")
headers = {"Authorization": f"Bearer {token}"}

resp = s.post(
    f"{BASE}/stock-items/{STOCK_ID}/distribute_to_projects/",
    headers=headers,
    json={"quantity": 1},
    timeout=30,
)

print("distribute", resp.status_code)

text = resp.text or ""
print("content-type", resp.headers.get("content-type"))
print(text[:1200])

# If Django debug HTML page, try to extract the exception headline
if "<title>" in text and "exception_value" in text:
    import re

    title = re.search(r"<title>(.*?)</title>", text)
    exc = re.search(r"<pre class=\"exception_value\">(.*?)</pre>", text, re.S)
    if title:
        print("\n[title]", title.group(1))
    if exc:
        exc_text = re.sub(r"\s+", " ", exc.group(1)).strip()
        print("[exception_value]", exc_text[:500])
