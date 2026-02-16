#!/usr/bin/env python
"""Debug script to check API response with authentication."""

import requests
import json
import os

# Disable proxy
os.environ['NO_PROXY'] = '127.0.0.1,localhost'
os.environ['no_proxy'] = '127.0.0.1,localhost'

# API base URL - try direct Django port
BASE_URL = "http://127.0.0.1:8000/api/v1"

# Login first
session = requests.Session()
session.trust_env = False  # Ignore proxy settings

try:
    print(f"Logging in to: {BASE_URL}/auth/login/")
    login_resp = session.post(
        f"{BASE_URL}/auth/login/", 
        json={"username": "admin", "password": "admin123"},
        timeout=10
    )
    print("Login response:", login_resp.status_code)
except requests.exceptions.RequestException as e:
    print(f"Login error: {e}")
    exit(1)
if login_resp.status_code == 200:
    auth_data = login_resp.json()
    token = auth_data.get('access')
    print("Got token:", token[:50] + "...")
    
    # Set auth header
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get project ID
    PROJECT_ID = "85775ffe-4a38-477b-a267-e416ae3e126d"
    
    # Call project-items API
    url = f"{BASE_URL}/project-items/?project={PROJECT_ID}&page_size=1000"
    print(f"\nCalling: {url}")
    
    resp = requests.get(url, headers=headers)
    print(f"Response status: {resp.status_code}")
    
    data = resp.json()
    print(f"\n=== API Response ===")
    print(f"count: {data.get('count')}")
    print(f"results length: {len(data.get('results', []))}")
    
    results = data.get('results', [])
    if results:
        # Count roots
        roots = [r for r in results if not r.get('parent_item')]
        print(f"\nROOT items (parent_item=null): {len(roots)}")
        
        if roots:
            print(f"\nRoot item:")
            print(f"  id: {roots[0].get('id')}")
            print(f"  name: {roots[0].get('name')}")
        
        # First 5 items
        print(f"\nFirst 5 items:")
        for i, item in enumerate(results[:5]):
            print(f"  {i+1}. id={item.get('id')[:8]}... name={item.get('name')} parent_item={item.get('parent_item')}")
        
        # Check all project_ids
        project_ids = set(r.get('project') for r in results)
        print(f"\nUnique project IDs in response: {project_ids}")
        
        # Check if all items belong to our project
        matching = sum(1 for r in results if r.get('project') == PROJECT_ID)
        print(f"Items matching our project ID: {matching} out of {len(results)}")
else:
    print("Login failed:", login_resp.text)
