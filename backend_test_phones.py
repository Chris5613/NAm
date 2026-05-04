#!/usr/bin/env python3
"""
Comprehensive backend tests for Phone List endpoints
Tests all CRUD operations, eBay price integration, and bulk operations
"""

import requests
import time
from typing import List, Dict, Any

# Backend URL from frontend/.env
BASE_URL = "https://crypto-sync-main.preview.emergentagent.com/api"

# Test data
created_phone_ids: List[str] = []

def log_test(name: str, passed: bool, details: str = ""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {name}")
    if details:
        print(f"    {details}")
    if not passed:
        raise AssertionError(f"Test failed: {name} - {details}")

def cleanup_phones():
    """Delete all test phones created during testing"""
    print("\n🧹 Cleanup: Deleting all test phones...")
    for phone_id in created_phone_ids:
        try:
            resp = requests.delete(f"{BASE_URL}/phones/{phone_id}", timeout=10)
            if resp.status_code == 200:
                print(f"  Deleted phone {phone_id}")
        except Exception as e:
            print(f"  Failed to delete {phone_id}: {e}")
    created_phone_ids.clear()

def test_1_list_phones_empty():
    """Test GET /api/phones - should return empty list initially"""
    print("\n📋 Test 1: List phones (initial state)")
    resp = requests.get(f"{BASE_URL}/phones", timeout=10)
    log_test("GET /api/phones returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    
    data = resp.json()
    log_test("Response has 'phones' key", "phones" in data, f"Keys: {list(data.keys())}")
    log_test("Response has 'total_value' key", "total_value" in data, f"Keys: {list(data.keys())}")
    log_test("Response has 'count' key", "count" in data, f"Keys: {list(data.keys())}")
    log_test("'phones' is a list", isinstance(data["phones"], list), f"Type: {type(data['phones'])}")
    
    initial_count = data["count"]
    print(f"  Initial phone count: {initial_count}")
    return initial_count

def test_2_create_phone_with_auto_ebay_price():
    """Test POST /api/phones - create iPhone 8 with auto eBay price fetch"""
    print("\n📱 Test 2: Create phone with auto eBay price (iPhone 8)")
    
    payload = {
        "device_id": "DEV-001",
        "os": "iOS",
        "model": "iPhone 8",
        "unity_id": "unity_abc",
        "carrier": "Helium",
        "tags": ["NOS", "MainProject"]
    }
    
    resp = requests.post(f"{BASE_URL}/phones", json=payload, timeout=30)
    log_test("POST /api/phones returns 200/201", resp.status_code in [200, 201], f"Status: {resp.status_code}")
    
    phone = resp.json()
    log_test("Response has 'id' field", "id" in phone, f"Keys: {list(phone.keys())}")
    log_test("Response has 'market_value' field", "market_value" in phone, f"Keys: {list(phone.keys())}")
    log_test("Response has 'market_value_source' field", "market_value_source" in phone, f"Keys: {list(phone.keys())}")
    
    # Store phone ID for cleanup
    created_phone_ids.append(phone["id"])
    
    # Verify eBay auto-fetch worked
    market_value = phone.get("market_value", 0)
    market_value_source = phone.get("market_value_source", "")
    
    log_test("market_value > 0 (eBay returned price)", market_value > 0, 
             f"market_value: ${market_value}, source: {market_value_source}")
    log_test("market_value_source is 'ebay'", market_value_source == "ebay", 
             f"Expected 'ebay', got '{market_value_source}'")
    
    # Verify all fields are preserved
    log_test("device_id preserved", phone.get("device_id") == "DEV-001", f"device_id: {phone.get('device_id')}")
    log_test("os preserved", phone.get("os") == "iOS", f"os: {phone.get('os')}")
    log_test("model preserved", phone.get("model") == "iPhone 8", f"model: {phone.get('model')}")
    log_test("tags preserved", phone.get("tags") == ["NOS", "MainProject"], f"tags: {phone.get('tags')}")
    
    print(f"  Created iPhone 8: ${market_value:.2f} (source: {market_value_source})")
    return phone

def test_3_create_phone_with_manual_price():
    """Test POST /api/phones - create iPhone X with manual price"""
    print("\n📱 Test 3: Create phone with manual price (iPhone X)")
    
    payload = {
        "model": "iPhone X",
        "market_value": 250,
        "tags": ["TestDevice", "Manual"]
    }
    
    resp = requests.post(f"{BASE_URL}/phones", json=payload, timeout=30)
    log_test("POST /api/phones returns 200/201", resp.status_code in [200, 201], f"Status: {resp.status_code}")
    
    phone = resp.json()
    created_phone_ids.append(phone["id"])
    
    market_value = phone.get("market_value", 0)
    market_value_source = phone.get("market_value_source", "")
    
    log_test("market_value is 250 (manual)", market_value == 250, 
             f"Expected 250, got {market_value}")
    log_test("market_value_source is 'manual'", market_value_source == "manual", 
             f"Expected 'manual', got '{market_value_source}'")
    
    print(f"  Created iPhone X: ${market_value:.2f} (source: {market_value_source})")
    return phone

def test_4_create_phone_with_fake_model():
    """Test POST /api/phones - create phone with made-up model (should not fail)"""
    print("\n📱 Test 4: Create phone with fake model (totallymadeupphonefoobar)")
    
    payload = {
        "model": "totallymadeupphonefoobar",
        "tags": ["FakeDevice", "Test"]
    }
    
    resp = requests.post(f"{BASE_URL}/phones", json=payload, timeout=30)
    log_test("POST /api/phones returns 200/201 (doesn't fail)", resp.status_code in [200, 201], 
             f"Status: {resp.status_code}")
    
    phone = resp.json()
    created_phone_ids.append(phone["id"])
    
    market_value = phone.get("market_value", 0)
    
    log_test("market_value is 0 (eBay returns no results)", market_value == 0, 
             f"Expected 0, got {market_value}")
    
    print(f"  Created fake phone: ${market_value:.2f} (eBay returned no results)")
    return phone

def test_5_create_additional_phones():
    """Create additional phones for testing tags and total_value"""
    print("\n📱 Test 5: Create additional phones (iPhone XR, Moto G)")
    
    phones = [
        {
            "model": "iPhone XR",
            "os": "iOS",
            "carrier": "AT&T",
            "tags": ["NOS", "Secondary"]
        },
        {
            "model": "Moto G",
            "os": "Android",
            "carrier": "Verizon",
            "tags": ["MainProject", "Android"]
        }
    ]
    
    created = []
    for payload in phones:
        resp = requests.post(f"{BASE_URL}/phones", json=payload, timeout=30)
        log_test(f"POST /api/phones for {payload['model']} returns 200/201", 
                 resp.status_code in [200, 201], f"Status: {resp.status_code}")
        
        phone = resp.json()
        created_phone_ids.append(phone["id"])
        created.append(phone)
        print(f"  Created {phone.get('model')}: ${phone.get('market_value', 0):.2f}")
    
    return created

def test_6_list_phones_and_verify_total():
    """Test GET /api/phones - verify total_value calculation"""
    print("\n📋 Test 6: List phones and verify total_value")
    
    resp = requests.get(f"{BASE_URL}/phones", timeout=10)
    log_test("GET /api/phones returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    
    data = resp.json()
    phones = data.get("phones", [])
    total_value = data.get("total_value", 0)
    count = data.get("count", 0)
    
    log_test("count matches number of phones", count == len(phones), 
             f"count: {count}, len(phones): {len(phones)}")
    
    # Calculate expected total
    expected_total = sum(p.get("market_value", 0) for p in phones)
    
    log_test("total_value matches sum of market_values", abs(total_value - expected_total) < 0.01, 
             f"total_value: ${total_value:.2f}, expected: ${expected_total:.2f}")
    
    print(f"  Total phones: {count}")
    print(f"  Total value: ${total_value:.2f}")
    
    # Print breakdown
    for phone in phones:
        print(f"    - {phone.get('model', 'Unknown')}: ${phone.get('market_value', 0):.2f} ({phone.get('market_value_source', 'unknown')})")
    
    return phones

def test_7_list_tags():
    """Test GET /api/phones/tags - verify deduped, sorted tag list"""
    print("\n🏷️  Test 7: List tags (deduped and sorted)")
    
    resp = requests.get(f"{BASE_URL}/phones/tags", timeout=10)
    log_test("GET /api/phones/tags returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    
    tags = resp.json()
    log_test("Response is a list", isinstance(tags, list), f"Type: {type(tags)}")
    
    # Expected tags from our test data: NOS, MainProject, TestDevice, Manual, FakeDevice, Test, Secondary, Android
    expected_tags = {"NOS", "MainProject", "TestDevice", "Manual", "FakeDevice", "Test", "Secondary", "Android"}
    actual_tags = set(tags)
    
    log_test("All expected tags present", expected_tags.issubset(actual_tags), 
             f"Expected: {expected_tags}, Got: {actual_tags}")
    
    # Verify sorted (case-insensitive)
    sorted_tags = sorted(tags, key=lambda s: s.lower())
    log_test("Tags are sorted (case-insensitive)", tags == sorted_tags, 
             f"Expected: {sorted_tags}, Got: {tags}")
    
    # Verify no duplicates
    log_test("No duplicate tags", len(tags) == len(set(tags)), 
             f"Length: {len(tags)}, Unique: {len(set(tags))}")
    
    print(f"  Tags: {tags}")
    return tags

def test_8_update_phone():
    """Test PUT /api/phones/{id} - update phone and verify fields preserved"""
    print("\n✏️  Test 8: Update phone (preserve existing fields)")
    
    if not created_phone_ids:
        print("  ⚠️  No phones to update, skipping")
        return
    
    phone_id = created_phone_ids[0]
    
    # First, get the current phone
    resp = requests.get(f"{BASE_URL}/phones", timeout=10)
    phones = resp.json().get("phones", [])
    phone = next((p for p in phones if p["id"] == phone_id), None)
    
    if not phone:
        print(f"  ⚠️  Phone {phone_id} not found, skipping")
        return
    
    original_model = phone.get("model")
    original_market_value = phone.get("market_value")
    
    # Update only tags and carrier
    update_payload = {
        "tags": ["Updated", "NewTag"],
        "carrier": "T-Mobile"
    }
    
    resp = requests.put(f"{BASE_URL}/phones/{phone_id}", json=update_payload, timeout=10)
    log_test("PUT /api/phones/{id} returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    
    updated_phone = resp.json()
    
    # Verify updated fields
    log_test("tags updated", updated_phone.get("tags") == ["Updated", "NewTag"], 
             f"Expected ['Updated', 'NewTag'], got {updated_phone.get('tags')}")
    log_test("carrier updated", updated_phone.get("carrier") == "T-Mobile", 
             f"Expected 'T-Mobile', got {updated_phone.get('carrier')}")
    
    # Verify preserved fields
    log_test("model preserved", updated_phone.get("model") == original_model, 
             f"Expected '{original_model}', got '{updated_phone.get('model')}'")
    log_test("market_value preserved", updated_phone.get("market_value") == original_market_value, 
             f"Expected {original_market_value}, got {updated_phone.get('market_value')}")
    
    print(f"  Updated phone {phone_id}: tags={updated_phone.get('tags')}, carrier={updated_phone.get('carrier')}")

def test_9_refresh_single_phone_price():
    """Test POST /api/phones/{id}/refresh-price - force refresh eBay price"""
    print("\n🔄 Test 9: Refresh single phone price")
    
    # Find a phone with eBay source (not manual)
    resp = requests.get(f"{BASE_URL}/phones", timeout=10)
    phones = resp.json().get("phones", [])
    ebay_phone = next((p for p in phones if p.get("market_value_source") == "ebay" and p.get("model")), None)
    
    if not ebay_phone:
        print("  ⚠️  No eBay-sourced phone found, skipping")
        return
    
    phone_id = ebay_phone["id"]
    old_value = ebay_phone.get("market_value", 0)
    
    resp = requests.post(f"{BASE_URL}/phones/{phone_id}/refresh-price", timeout=30)
    log_test("POST /api/phones/{id}/refresh-price returns 200", resp.status_code == 200, 
             f"Status: {resp.status_code}")
    
    result = resp.json()
    log_test("Response has 'phone_id' field", "phone_id" in result, f"Keys: {list(result.keys())}")
    log_test("Response has 'ebay' field", "ebay" in result, f"Keys: {list(result.keys())}")
    log_test("Response has 'market_value' field", "market_value" in result, f"Keys: {list(result.keys())}")
    
    new_value = result.get("market_value", 0)
    log_test("market_value > 0", new_value > 0, f"market_value: ${new_value}")
    
    print(f"  Refreshed {ebay_phone.get('model')}: ${old_value:.2f} -> ${new_value:.2f}")

def test_10_refresh_all_prices():
    """Test POST /api/phones/refresh-all-prices - refresh all phones"""
    print("\n🔄 Test 10: Refresh all phone prices")
    
    resp = requests.post(f"{BASE_URL}/phones/refresh-all-prices", timeout=60)
    log_test("POST /api/phones/refresh-all-prices returns 200", resp.status_code == 200, 
             f"Status: {resp.status_code}")
    
    result = resp.json()
    log_test("Response has 'updated' field", "updated" in result, f"Keys: {list(result.keys())}")
    log_test("Response has 'failed' field", "failed" in result, f"Keys: {list(result.keys())}")
    log_test("Response has 'skipped' field", "skipped" in result, f"Keys: {list(result.keys())}")
    log_test("Response has 'total' field", "total" in result, f"Keys: {list(result.keys())}")
    
    updated = result.get("updated", 0)
    failed = result.get("failed", 0)
    skipped = result.get("skipped", 0)
    total = result.get("total", 0)
    
    # Verify manual-priced phones are skipped
    resp = requests.get(f"{BASE_URL}/phones", timeout=10)
    phones = resp.json().get("phones", [])
    manual_count = sum(1 for p in phones if p.get("market_value_source") == "manual" and p.get("market_value", 0) > 0)
    
    log_test("Manual-priced phones are skipped", skipped >= manual_count, 
             f"Expected at least {manual_count} skipped, got {skipped}")
    
    log_test("updated + failed + skipped = total", updated + failed + skipped == total, 
             f"updated({updated}) + failed({failed}) + skipped({skipped}) = {updated+failed+skipped}, total: {total}")
    
    print(f"  Results: updated={updated}, failed={failed}, skipped={skipped}, total={total}")

def test_11_delete_phone():
    """Test DELETE /api/phones/{id} - delete a phone"""
    print("\n🗑️  Test 11: Delete phone")
    
    if not created_phone_ids:
        print("  ⚠️  No phones to delete, skipping")
        return
    
    phone_id = created_phone_ids[0]
    
    resp = requests.delete(f"{BASE_URL}/phones/{phone_id}", timeout=10)
    log_test("DELETE /api/phones/{id} returns 200", resp.status_code == 200, f"Status: {resp.status_code}")
    
    result = resp.json()
    log_test("Response has 'deleted' field", "deleted" in result, f"Keys: {list(result.keys())}")
    log_test("deleted is True", result.get("deleted") == True, f"deleted: {result.get('deleted')}")
    
    # Verify phone is actually deleted
    resp = requests.get(f"{BASE_URL}/phones", timeout=10)
    phones = resp.json().get("phones", [])
    deleted_phone = next((p for p in phones if p["id"] == phone_id), None)
    
    log_test("Phone no longer in list", deleted_phone is None, 
             f"Phone {phone_id} should not exist")
    
    print(f"  Deleted phone {phone_id}")
    created_phone_ids.remove(phone_id)

def test_12_delete_nonexistent_phone():
    """Test DELETE /api/phones/{id} - delete nonexistent phone (should return 404)"""
    print("\n🗑️  Test 12: Delete nonexistent phone (expect 404)")
    
    fake_id = "nonexistent-phone-id-12345"
    
    resp = requests.delete(f"{BASE_URL}/phones/{fake_id}", timeout=10)
    log_test("DELETE /api/phones/{id} returns 404", resp.status_code == 404, 
             f"Expected 404, got {resp.status_code}")
    
    print(f"  Correctly returned 404 for nonexistent phone")

def main():
    print("=" * 80)
    print("🧪 Phone List Backend API Tests")
    print("=" * 80)
    print(f"Backend URL: {BASE_URL}")
    print()
    
    try:
        # Run all tests
        test_1_list_phones_empty()
        test_2_create_phone_with_auto_ebay_price()
        test_3_create_phone_with_manual_price()
        test_4_create_phone_with_fake_model()
        test_5_create_additional_phones()
        test_6_list_phones_and_verify_total()
        test_7_list_tags()
        test_8_update_phone()
        test_9_refresh_single_phone_price()
        test_10_refresh_all_prices()
        test_11_delete_phone()
        test_12_delete_nonexistent_phone()
        
        print("\n" + "=" * 80)
        print("✅ ALL TESTS PASSED!")
        print("=" * 80)
        
    except AssertionError as e:
        print("\n" + "=" * 80)
        print(f"❌ TEST FAILED: {e}")
        print("=" * 80)
        return 1
    except Exception as e:
        print("\n" + "=" * 80)
        print(f"❌ UNEXPECTED ERROR: {e}")
        print("=" * 80)
        import traceback
        traceback.print_exc()
        return 1
    finally:
        # Cleanup
        cleanup_phones()
    
    return 0

if __name__ == "__main__":
    exit(main())
