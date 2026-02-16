#!/usr/bin/env python3
"""
Run server and test API using requests library.
"""
import subprocess
import time
import requests
import json
import sys
import os

# Start Django server on port 8888
os.chdir(r"D:\B2B\PDM\backend")
server = subprocess.Popen(
    [r"D:\B2B\PDM\.venv\Scripts\python.exe", "manage.py", "runserver", "127.0.0.1:8888"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

print("Starting server on port 8888...")
time.sleep(5)  # Wait for server to start

# Test API using requests
URL = "http://127.0.0.1:8888/api/v1/project-items/"
params = {
    'project': '85775ffe-4a38-477b-a267-e416ae3e126d',
    'page_size': 1000
}

try:
    print(f"Testing: {URL}")
    resp = requests.get(URL, params=params, timeout=10)
    print(f"Status: {resp.status_code}")
    print(f"Headers: {dict(resp.headers)}")
    
    if resp.status_code == 200:
        data = resp.json()
        
        results = data.get('results', [])
        print(f"Count: {data.get('count')}")
        print(f"Results: {len(results)}")
        
        # Find root
        roots = [r for r in results if r.get('parent_item') is None]
        print(f"Roots: {len(roots)}")
        
        if roots:
            root_id = roots[0]['id']
            print(f"Root: {roots[0]['name']} (id: {root_id[:8]}...)")
            
            # Find children
            children = [r for r in results if r.get('parent_item') == root_id]
            print(f"Children of root: {len(children)}")
            
            for c in children:
                print(f"  - {c['name']}")
        
        print("\n=== SUCCESS! ===")
    else:
        print(f"ERROR: {resp.text[:500]}")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
finally:
    # Stop server
    server.terminate()
    server.wait()
