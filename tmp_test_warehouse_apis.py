"""
Тест работоспособности API складских документов.
"""
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

# Авторизация
def get_token():
    response = requests.post(f"{BASE_URL}/auth/login/", json={
        "username": "admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("access")
    print(f"Auth error: {response.status_code}, {response.text}")
    return None

def test_apis():
    token = get_token()
    if not token:
        print("FAIL: Could not authenticate")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Test stock-transfers list
    print("\n--- Test 1: Stock Transfers List ---")
    r = requests.get(f"{BASE_URL}/stock-transfers/", headers=headers)
    print(f"  Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"  Count: {data.get('count', len(data.get('results', [])))}")
    else:
        print(f"  Error: {r.text[:200]}")
    
    # 2. Test contractor-writeoffs list
    print("\n--- Test 2: Contractor Writeoffs List ---")
    r = requests.get(f"{BASE_URL}/contractor-writeoffs/", headers=headers)
    print(f"  Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"  Count: {data.get('count', len(data.get('results', [])))}")
    else:
        print(f"  Error: {r.text[:200]}")
    
    # 3. Test contractor-receipts list
    print("\n--- Test 3: Contractor Receipts List ---")
    r = requests.get(f"{BASE_URL}/contractor-receipts/", headers=headers)
    print(f"  Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"  Count: {data.get('count', len(data.get('results', [])))}")
    else:
        print(f"  Error: {r.text[:200]}")
    
    # 4. Test inventory-documents list
    print("\n--- Test 4: Inventory Documents List ---")
    r = requests.get(f"{BASE_URL}/inventory-documents/", headers=headers)
    print(f"  Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"  Count: {data.get('count', len(data.get('results', [])))}")
    else:
        print(f"  Error: {r.text[:200]}")
    
    # 5. Test warehouses list (for testing create operations)
    print("\n--- Test 5: Warehouses List ---")
    r = requests.get(f"{BASE_URL}/warehouses/", headers=headers)
    print(f"  Status: {r.status_code}")
    warehouses = []
    if r.status_code == 200:
        data = r.json()
        warehouses = data.get('results', [])
        print(f"  Count: {len(warehouses)}")
        for w in warehouses[:3]:
            print(f"    - {w['name']} ({w['id']})")
    
    # 6. Test contractors list
    print("\n--- Test 6: Contractors List ---")
    r = requests.get(f"{BASE_URL}/contractors/", headers=headers)
    print(f"  Status: {r.status_code}")
    contractors = []
    if r.status_code == 200:
        data = r.json()
        contractors = data.get('results', [])
        print(f"  Count: {len(contractors)}")
        for c in contractors[:3]:
            print(f"    - {c['name']} ({c['id']})")
    
    # 7. Test stock-items list
    print("\n--- Test 7: Stock Items List ---")
    r = requests.get(f"{BASE_URL}/stock-items/", headers=headers)
    print(f"  Status: {r.status_code}")
    stock_items = []
    if r.status_code == 200:
        data = r.json()
        stock_items = data.get('results', [])
        print(f"  Count: {len(stock_items)}")
        for si in stock_items[:3]:
            print(f"    - {si.get('nomenclature_name', 'N/A')} qty={si['quantity']} ({si['id']})")
    
    # 8. Test creating a stock transfer (if we have warehouses)
    if len(warehouses) >= 2:
        print("\n--- Test 8: Create Stock Transfer ---")
        transfer_data = {
            "source_warehouse": warehouses[0]['id'],
            "destination_warehouse": warehouses[1]['id'],
            "reason": "Test transfer",
        }
        r = requests.post(f"{BASE_URL}/stock-transfers/", headers=headers, json=transfer_data)
        print(f"  Status: {r.status_code}")
        if r.status_code == 201:
            transfer = r.json()
            print(f"  Created: {transfer.get('number', 'N/A')}")
            # Delete it
            delete_r = requests.delete(f"{BASE_URL}/stock-transfers/{transfer['id']}/", headers=headers)
            print(f"  Deleted: {delete_r.status_code}")
        else:
            print(f"  Error: {r.text[:300]}")
    else:
        print("\n--- Test 8: Skipped (need at least 2 warehouses) ---")
    
    # 9. Test creating a contractor writeoff (if we have warehouse and contractor)
    if warehouses and contractors:
        print("\n--- Test 9: Create Contractor Writeoff ---")
        writeoff_data = {
            "contractor": contractors[0]['id'],
            "warehouse": warehouses[0]['id'],
            "writeoff_date": "2025-01-15",
            "notes": "Test writeoff",
            "items": []  # empty items for now
        }
        r = requests.post(f"{BASE_URL}/contractor-writeoffs/", headers=headers, json=writeoff_data)
        print(f"  Status: {r.status_code}")
        if r.status_code == 201:
            writeoff = r.json()
            print(f"  Created: {writeoff.get('number', 'N/A')}")
            # Delete it
            delete_r = requests.delete(f"{BASE_URL}/contractor-writeoffs/{writeoff['id']}/", headers=headers)
            print(f"  Deleted: {delete_r.status_code}")
        else:
            print(f"  Error: {r.text[:300]}")
    else:
        print("\n--- Test 9: Skipped (need warehouse and contractor) ---")
    
    print("\n=== All tests completed ===")

if __name__ == "__main__":
    test_apis()
