"""
Детальный тест создания складских документов.
"""
import requests
import json
from datetime import date

BASE_URL = "http://127.0.0.1:8000/api/v1"
NO_PROXY = {'http': None, 'https': None}

def get_token():
    response = requests.post(f"{BASE_URL}/auth/login/", json={
        "username": "admin",
        "password": "admin123"
    }, proxies=NO_PROXY)
    if response.status_code == 200:
        return response.json().get("access")
    print(f"Auth error: {response.status_code}, {response.text}")
    return None

def test_all():
    token = get_token()
    if not token:
        print("FAIL: Could not authenticate")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Получаем справочные данные
    print("=== Loading reference data ===")
    
    # Warehouses
    r = requests.get(f"{BASE_URL}/warehouses/", headers=headers, proxies=NO_PROXY)
    warehouses = r.json().get('results', []) if r.status_code == 200 else []
    print(f"Warehouses: {len(warehouses)}")
    for w in warehouses:
        print(f"  - {w['name']} ({w['id']})")
    
    # Contractors
    r = requests.get(f"{BASE_URL}/contractors/", headers=headers, proxies=NO_PROXY)
    contractors = r.json().get('results', []) if r.status_code == 200 else []
    print(f"Contractors: {len(contractors)}")
    
    # Stock items
    r = requests.get(f"{BASE_URL}/stock-items/", headers=headers, proxies=NO_PROXY)
    stock_items = r.json().get('results', []) if r.status_code == 200 else []
    print(f"Stock items: {len(stock_items)}")
    
    # Nomenclature
    r = requests.get(f"{BASE_URL}/nomenclature/", headers=headers, proxies=NO_PROXY)
    nomenclature = r.json().get('results', []) if r.status_code == 200 else []
    print(f"Nomenclature: {len(nomenclature)}")
    
    # === Test Stock Transfer ===
    print("\n=== Test Stock Transfer ===")
    if len(warehouses) >= 2:
        transfer_data = {
            "source_warehouse": warehouses[0]['id'],
            "destination_warehouse": warehouses[1]['id'],
            "reason": "Test transfer",
        }
        r = requests.post(f"{BASE_URL}/stock-transfers/", headers=headers, json=transfer_data, proxies=NO_PROXY)
        print(f"Create: {r.status_code}")
        if r.status_code == 201:
            transfer = r.json()
            print(f"  Number: {transfer.get('number')}")
            print(f"  Status: {transfer.get('status')}")
            
            # Delete
            r2 = requests.delete(f"{BASE_URL}/stock-transfers/{transfer['id']}/", headers=headers, proxies=NO_PROXY)
            print(f"Delete: {r2.status_code}")
        else:
            print(f"  Error: {r.text[:300]}")
    else:
        print("Skip: need at least 2 warehouses")
    
    # === Test Contractor Writeoff ===
    print("\n=== Test Contractor Writeoff ===")
    if warehouses and contractors:
        writeoff_data = {
            "contractor": contractors[0]['id'],
            "warehouse": warehouses[0]['id'],
            "writeoff_date": str(date.today()),
            "notes": "Test writeoff",
            "items": []  # empty for now
        }
        r = requests.post(f"{BASE_URL}/contractor-writeoffs/", headers=headers, json=writeoff_data, proxies=NO_PROXY)
        print(f"Create: {r.status_code}")
        if r.status_code == 201:
            writeoff = r.json()
            print(f"  Number: {writeoff.get('number')}")
            print(f"  Status: {writeoff.get('status')}")
            
            # Delete
            r2 = requests.delete(f"{BASE_URL}/contractor-writeoffs/{writeoff['id']}/", headers=headers, proxies=NO_PROXY)
            print(f"Delete: {r2.status_code}")
        else:
            print(f"  Error: {r.text[:300]}")
    else:
        print("Skip: need warehouse and contractor")
    
    # === Test Contractor Receipt ===
    print("\n=== Test Contractor Receipt ===")
    if warehouses and contractors:
        receipt_data = {
            "contractor": contractors[0]['id'],
            "warehouse": warehouses[0]['id'],
            "receipt_date": str(date.today()),
            "notes": "Test receipt",
            "items": []  # empty for now
        }
        r = requests.post(f"{BASE_URL}/contractor-receipts/", headers=headers, json=receipt_data, proxies=NO_PROXY)
        print(f"Create: {r.status_code}")
        if r.status_code == 201:
            receipt = r.json()
            print(f"  Number: {receipt.get('number')}")
            print(f"  Status: {receipt.get('status')}")
            
            # Delete
            r2 = requests.delete(f"{BASE_URL}/contractor-receipts/{receipt['id']}/", headers=headers, proxies=NO_PROXY)
            print(f"Delete: {r2.status_code}")
        else:
            print(f"  Error: {r.text[:300]}")
    else:
        print("Skip: need warehouse and contractor")
    
    # === Test Inventory Document ===
    print("\n=== Test Inventory Document ===")
    if warehouses:
        # Get users for responsible
        r = requests.get(f"{BASE_URL}/settings/users/responsible-candidates/", headers=headers, proxies=NO_PROXY)
        users = r.json() if r.status_code == 200 else []
        
        if users:
            doc_data = {
                "warehouse": warehouses[0]['id'],
                "document_type": "full",
                "planned_date": str(date.today()),
                "responsible": users[0]['id'],
                "notes": "Test inventory"
            }
            r = requests.post(f"{BASE_URL}/inventory-documents/", headers=headers, json=doc_data, proxies=NO_PROXY)
            print(f"Create: {r.status_code}")
            if r.status_code == 201:
                doc = r.json()
                print(f"  Number: {doc.get('number')}")
                print(f"  Status: {doc.get('status')}")
                
                # Delete
                r2 = requests.delete(f"{BASE_URL}/inventory-documents/{doc['id']}/", headers=headers, proxies=NO_PROXY)
                print(f"Delete: {r2.status_code}")
            else:
                print(f"  Error: {r.text[:300]}")
        else:
            print("Skip: no users available")
    else:
        print("Skip: need warehouse")
    
    # === Test Goods Receipt ===
    print("\n=== Test Goods Receipt ===")
    # Need a purchase order first
    r = requests.get(f"{BASE_URL}/purchase-orders/", headers=headers, proxies=NO_PROXY)
    orders = r.json().get('results', []) if r.status_code == 200 else []
    available_orders = [o for o in orders if o['status'] in ['ordered', 'partially_delivered']]
    print(f"Available orders: {len(available_orders)}")
    
    if available_orders and warehouses:
        receipt_data = {
            "purchase_order": available_orders[0]['id'],
            "warehouse": warehouses[0]['id'],
            "receipt_date": str(date.today()),
            "notes": "Test receipt",
            "items": []  # empty for now
        }
        r = requests.post(f"{BASE_URL}/goods-receipts/", headers=headers, json=receipt_data, proxies=NO_PROXY)
        print(f"Create: {r.status_code}")
        if r.status_code == 201:
            receipt = r.json()
            print(f"  Number: {receipt.get('number')}")
            print(f"  Status: {receipt.get('status')}")
            
            # Delete
            r2 = requests.delete(f"{BASE_URL}/goods-receipts/{receipt['id']}/", headers=headers, proxies=NO_PROXY)
            print(f"Delete: {r2.status_code}")
        else:
            print(f"  Error: {r.text[:300]}")
    else:
        print("Skip: need purchase order in status 'ordered' and warehouse")
    
    print("\n=== All tests completed ===")

if __name__ == "__main__":
    test_all()
