#!/usr/bin/env python3
"""
Backend API Tests for Crypto Cache and Net Worth Override
Tests the crypto cache endpoints and verifies net-worth calculations use cached crypto.
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend/.env
BASE_URL = "https://crypto-sync-main.preview.emergentagent.com/api"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def log_test(name):
    print(f"\n{Colors.BLUE}[TEST]{Colors.END} {name}")

def log_pass(msg):
    print(f"  {Colors.GREEN}✓{Colors.END} {msg}")

def log_fail(msg):
    print(f"  {Colors.RED}✗{Colors.END} {msg}")

def log_info(msg):
    print(f"  {Colors.YELLOW}ℹ{Colors.END} {msg}")

def test_get_crypto_cache_empty():
    """Test GET /api/crypto/cache when no cache exists"""
    log_test("GET /api/crypto/cache (initial state)")
    
    try:
        response = requests.get(f"{BASE_URL}/crypto/cache", timeout=10)
        
        if response.status_code != 200:
            log_fail(f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        log_info(f"Response: {json.dumps(data, indent=2)}")
        
        # Should return {total: 0, updated_at: null} or {total: <value>, updated_at: <timestamp>}
        if "total" not in data:
            log_fail("Response missing 'total' field")
            return False
        
        if "updated_at" not in data:
            log_fail("Response missing 'updated_at' field")
            return False
        
        log_pass(f"Cache state: total={data['total']}, updated_at={data['updated_at']}")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {e}")
        return False

def test_post_crypto_cache_valid():
    """Test POST /api/crypto/cache with valid data"""
    log_test("POST /api/crypto/cache with valid total (50000)")
    
    try:
        payload = {"total": 50000}
        response = requests.post(f"{BASE_URL}/crypto/cache", json=payload, timeout=10)
        
        if response.status_code != 200:
            log_fail(f"Expected 200, got {response.status_code}")
            log_info(f"Response: {response.text}")
            return False
        
        data = response.json()
        log_info(f"Response: {json.dumps(data, indent=2)}")
        
        if data.get("total") != 50000:
            log_fail(f"Expected total=50000, got {data.get('total')}")
            return False
        
        if not data.get("updated_at"):
            log_fail("Missing updated_at timestamp")
            return False
        
        log_pass(f"Cache set successfully: total=50000, updated_at={data['updated_at']}")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {e}")
        return False

def test_post_crypto_cache_invalid():
    """Test POST /api/crypto/cache with invalid data"""
    log_test("POST /api/crypto/cache with invalid data")
    
    test_cases = [
        ({"total": "not_a_number"}, "non-numeric string"),
        ({"total": None}, "null value"),
        ({}, "missing total field"),
    ]
    
    all_passed = True
    for payload, description in test_cases:
        try:
            response = requests.post(f"{BASE_URL}/crypto/cache", json=payload, timeout=10)
            
            # Should return 400 or handle gracefully
            if response.status_code == 400:
                log_pass(f"Correctly rejected {description} with 400")
            elif response.status_code == 200:
                data = response.json()
                # If it returns 200, it should have set total to 0
                if data.get("total") == 0:
                    log_pass(f"Handled {description} gracefully (set to 0)")
                else:
                    log_info(f"Accepted {description}, set total={data.get('total')}")
            else:
                log_info(f"Returned {response.status_code} for {description}")
                
        except Exception as e:
            log_fail(f"Exception testing {description}: {e}")
            all_passed = False
    
    return all_passed

def test_get_crypto_cache_after_set():
    """Test GET /api/crypto/cache after setting value"""
    log_test("GET /api/crypto/cache (after setting to 50000)")
    
    try:
        response = requests.get(f"{BASE_URL}/crypto/cache", timeout=10)
        
        if response.status_code != 200:
            log_fail(f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        log_info(f"Response: {json.dumps(data, indent=2)}")
        
        if data.get("total") != 50000:
            log_fail(f"Expected total=50000, got {data.get('total')}")
            return False
        
        log_pass(f"Cache retrieved correctly: total=50000")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {e}")
        return False

def test_net_worth_with_crypto_cache():
    """Test GET /api/net-worth uses cached crypto value"""
    log_test("GET /api/net-worth (should use cached crypto=50000)")
    
    try:
        response = requests.get(f"{BASE_URL}/net-worth", timeout=10)
        
        if response.status_code != 200:
            log_fail(f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        log_info(f"Response: {json.dumps(data, indent=2)}")
        
        breakdown = data.get("breakdown", {})
        crypto_value = breakdown.get("crypto", 0)
        
        if crypto_value != 50000:
            log_fail(f"Expected breakdown.crypto=50000, got {crypto_value}")
            log_info("The cached crypto value is not being used in net-worth calculation")
            return False
        
        # Verify total_net_worth includes the cached crypto
        total = data.get("total_net_worth", 0)
        expected_total = (breakdown.get("stocks", 0) + 
                         breakdown.get("crypto", 0) + 
                         breakdown.get("cash", 0) + 
                         breakdown.get("crypto_projects", 0) + 
                         breakdown.get("investments", 0) - 
                         breakdown.get("debts", 0))
        
        if abs(total - expected_total) > 0.01:
            log_fail(f"Total mismatch: got {total}, expected {expected_total}")
            return False
        
        log_pass(f"Net worth correctly uses cached crypto: breakdown.crypto=50000")
        log_pass(f"Total net worth: ${total:,.2f}")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {e}")
        return False

def test_net_worth_snapshot_with_crypto_cache():
    """Test POST /api/net-worth/snapshot uses cached crypto value"""
    log_test("POST /api/net-worth/snapshot (should use cached crypto=50000)")
    
    try:
        response = requests.post(f"{BASE_URL}/net-worth/snapshot", timeout=10)
        
        if response.status_code != 200:
            log_fail(f"Expected 200, got {response.status_code}")
            log_info(f"Response: {response.text}")
            return False
        
        data = response.json()
        log_info(f"Response: {json.dumps(data, indent=2)}")
        
        crypto_value = data.get("crypto_value", 0)
        
        if crypto_value != 50000:
            log_fail(f"Expected crypto_value=50000, got {crypto_value}")
            log_info("The cached crypto value is not being used in snapshot")
            return False
        
        log_pass(f"Snapshot correctly uses cached crypto: crypto_value=50000")
        log_pass(f"Snapshot saved with ID: {data.get('id')}")
        return True
        
    except Exception as e:
        log_fail(f"Exception: {e}")
        return False

def test_update_crypto_cache():
    """Test updating crypto cache to different value"""
    log_test("POST /api/crypto/cache with updated total (75000)")
    
    try:
        payload = {"total": 75000}
        response = requests.post(f"{BASE_URL}/crypto/cache", json=payload, timeout=10)
        
        if response.status_code != 200:
            log_fail(f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get("total") != 75000:
            log_fail(f"Expected total=75000, got {data.get('total')}")
            return False
        
        log_pass(f"Cache updated successfully: total=75000")
        
        # Verify net-worth reflects the update
        nw_response = requests.get(f"{BASE_URL}/net-worth", timeout=10)
        if nw_response.status_code == 200:
            nw_data = nw_response.json()
            crypto_value = nw_data.get("breakdown", {}).get("crypto", 0)
            
            if crypto_value == 75000:
                log_pass(f"Net worth immediately reflects updated cache: crypto=75000")
            else:
                log_fail(f"Net worth not updated: crypto={crypto_value}, expected 75000")
                return False
        
        return True
        
    except Exception as e:
        log_fail(f"Exception: {e}")
        return False

def test_crypto_cache_zero():
    """Test setting crypto cache to zero"""
    log_test("POST /api/crypto/cache with total=0")
    
    try:
        payload = {"total": 0}
        response = requests.post(f"{BASE_URL}/crypto/cache", json=payload, timeout=10)
        
        if response.status_code != 200:
            log_fail(f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get("total") != 0:
            log_fail(f"Expected total=0, got {data.get('total')}")
            return False
        
        log_pass(f"Cache set to zero successfully")
        
        # Verify net-worth uses zero
        nw_response = requests.get(f"{BASE_URL}/net-worth", timeout=10)
        if nw_response.status_code == 200:
            nw_data = nw_response.json()
            crypto_value = nw_data.get("breakdown", {}).get("crypto", 0)
            
            if crypto_value == 0:
                log_pass(f"Net worth correctly uses cached crypto=0")
            else:
                log_fail(f"Net worth crypto={crypto_value}, expected 0")
                return False
        
        return True
        
    except Exception as e:
        log_fail(f"Exception: {e}")
        return False

def restore_cache_state(original_total):
    """Restore crypto cache to original state"""
    log_test(f"Restoring crypto cache to original value ({original_total})")
    
    try:
        payload = {"total": original_total}
        response = requests.post(f"{BASE_URL}/crypto/cache", json=payload, timeout=10)
        
        if response.status_code == 200:
            log_pass(f"Cache restored to {original_total}")
            return True
        else:
            log_fail(f"Failed to restore cache: {response.status_code}")
            return False
            
    except Exception as e:
        log_fail(f"Exception: {e}")
        return False

def main():
    print(f"\n{Colors.BLUE}{'='*70}{Colors.END}")
    print(f"{Colors.BLUE}Crypto Cache & Net Worth Override Backend Tests{Colors.END}")
    print(f"{Colors.BLUE}{'='*70}{Colors.END}")
    print(f"Backend URL: {BASE_URL}")
    print(f"Test Time: {datetime.now().isoformat()}")
    
    # Store original cache state
    original_cache = None
    try:
        response = requests.get(f"{BASE_URL}/crypto/cache", timeout=10)
        if response.status_code == 200:
            original_cache = response.json().get("total", 0)
            log_info(f"Original cache state: total={original_cache}")
    except:
        pass
    
    results = []
    
    # Run tests in sequence
    results.append(("GET crypto/cache (initial)", test_get_crypto_cache_empty()))
    results.append(("POST crypto/cache (valid)", test_post_crypto_cache_valid()))
    results.append(("POST crypto/cache (invalid)", test_post_crypto_cache_invalid()))
    results.append(("GET crypto/cache (after set)", test_get_crypto_cache_after_set()))
    results.append(("GET net-worth (with cache)", test_net_worth_with_crypto_cache()))
    results.append(("POST net-worth/snapshot (with cache)", test_net_worth_snapshot_with_crypto_cache()))
    results.append(("POST crypto/cache (update)", test_update_crypto_cache()))
    results.append(("POST crypto/cache (zero)", test_crypto_cache_zero()))
    
    # Restore original state
    if original_cache is not None:
        results.append(("Restore original cache", restore_cache_state(original_cache)))
    
    # Summary
    print(f"\n{Colors.BLUE}{'='*70}{Colors.END}")
    print(f"{Colors.BLUE}Test Summary{Colors.END}")
    print(f"{Colors.BLUE}{'='*70}{Colors.END}")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = f"{Colors.GREEN}PASS{Colors.END}" if result else f"{Colors.RED}FAIL{Colors.END}"
        print(f"  {status} - {name}")
    
    print(f"\n{Colors.BLUE}Results: {passed}/{total} tests passed{Colors.END}")
    
    if passed == total:
        print(f"{Colors.GREEN}✓ All tests passed!{Colors.END}\n")
        return 0
    else:
        print(f"{Colors.RED}✗ Some tests failed{Colors.END}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
