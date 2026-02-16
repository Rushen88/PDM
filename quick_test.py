#!/usr/bin/env python3
"""Quick API test."""
import urllib.request
import json
import sys

URL = "http://127.0.0.1:8000/api/v1/project-items/?project=85775ffe-4a38-477b-a267-e416ae3e126d&page_size=1000"

try:
    print(f"Testing: {URL}")
    resp = urllib.request.urlopen(URL, timeout=10)
    data = json.loads(resp.read())
    
    results = data.get('results', [])
    print(f"Count: {data.get('count')}")
    print(f"Results: {len(results)}")
    
    # Find root
    roots = [r for r in results if r.get('parent_item') is None]
    print(f"Roots: {len(roots)}")
    
    if roots:
        root_id = roots[0]['id']
        print(f"Root: {roots[0]['name']} (id: {root_id})")
        
        # Find children
        children = [r for r in results if r.get('parent_item') == root_id]
        print(f"Children of root: {len(children)}")
        
        for c in children:
            print(f"  - {c['name']}")
    
    print("\nSUCCESS!")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
