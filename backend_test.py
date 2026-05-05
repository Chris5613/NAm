#!/usr/bin/env python3
"""
Comprehensive backend tests for Unity Nodes extension inbox endpoints.
Tests all scenarios specified in the review request.
"""

import json
import sys
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

import requests

# Backend URL from frontend/.env
BASE_URL = "https://sync-multi-account.preview.emergentagent.com"
INBOX_URL = f"{BASE_URL}/api/integrations/unity-network/inbox"


class TestResult:
    """Track test results."""
    
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def pass_test(self, name: str):
        self.passed += 1
        print(f"✅ PASS: {name}")
    
    def fail_test(self, name: str, reason: str):
        self.failed += 1
        error_msg = f"❌ FAIL: {name}\n   Reason: {reason}"
        self.errors.append(error_msg)
        print(error_msg)
    
    def summary(self):
        print("\n" + "="*80)
        print(f"TEST SUMMARY: {self.passed} passed, {self.failed} failed")
        print("="*80)
        if self.errors:
            print("\nFailed Tests:")
            for error in self.errors:
                print(error)
        return self.failed == 0


def create_sample_payload(
    synced_at: Optional[str] = None,
    total_usd: float = 1.234567,
    lifetime_usd: float = 152.834012
) -> Dict[str, Any]:
    """Create a sample extension payload."""
    if synced_at is None:
        synced_at = datetime.now(timezone.utc).isoformat()
    
    return {
        "source": "chrome-extension",
        "version": "1.0.0",
        "synced_at": synced_at,
        "email": "test@example.com",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "total_usd": total_usd,
        "allocation_count": 12,
        "device_count": 3,
        "balance_usd": 4.825001,
        "lifetime_usd": lifetime_usd,
        "devices": [
            {"license_id": "abc123", "amount_usd": 0.456, "allocation_count": 4}
        ],
        "allocations": []
    }


def test_1_fresh_state_get(result: TestResult):
    """Test 1: GET on fresh state should return {empty: true}."""
    print("\n--- Test 1: GET on fresh state ---")
    
    # First, clear the inbox to ensure fresh state
    try:
        requests.delete(INBOX_URL, timeout=10)
    except Exception:
        pass  # Ignore if it fails
    
    try:
        response = requests.get(INBOX_URL, timeout=10)
        
        if response.status_code != 200:
            result.fail_test(
                "Fresh state GET",
                f"Expected status 200, got {response.status_code}"
            )
            return
        
        data = response.json()
        if data.get("empty") is True:
            result.pass_test("Fresh state GET returns {empty: true}")
        else:
            result.fail_test(
                "Fresh state GET",
                f"Expected {{empty: true}}, got {data}"
            )
    
    except Exception as e:
        result.fail_test("Fresh state GET", f"Exception: {e}")


def test_2_post_valid_payload(result: TestResult) -> Optional[str]:
    """Test 2: POST valid payload should return {ok: true, received_at: <iso>}."""
    print("\n--- Test 2: POST valid payload ---")
    
    payload = create_sample_payload()
    
    try:
        response = requests.post(
            INBOX_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code != 200:
            result.fail_test(
                "POST valid payload",
                f"Expected status 200, got {response.status_code}. Body: {response.text}"
            )
            return None
        
        data = response.json()
        
        if data.get("ok") is not True:
            result.fail_test(
                "POST valid payload",
                f"Expected {{ok: true}}, got {data}"
            )
            return None
        
        received_at = data.get("received_at")
        if not received_at:
            result.fail_test(
                "POST valid payload",
                "Missing 'received_at' field in response"
            )
            return None
        
        # Validate received_at is a valid ISO 8601 timestamp
        try:
            datetime.fromisoformat(received_at.replace('Z', '+00:00'))
            result.pass_test("POST valid payload returns {ok: true, received_at}")
            return received_at
        except ValueError:
            result.fail_test(
                "POST valid payload",
                f"Invalid ISO 8601 timestamp: {received_at}"
            )
            return None
    
    except Exception as e:
        result.fail_test("POST valid payload", f"Exception: {e}")
        return None


def test_3_post_second_payload(result: TestResult) -> Optional[str]:
    """Test 3: POST second payload with different values."""
    print("\n--- Test 3: POST second payload ---")
    
    # Create a second payload with different values
    synced_at = (datetime.now(timezone.utc) + timedelta(seconds=5)).isoformat()
    payload = create_sample_payload(
        synced_at=synced_at,
        total_usd=2.345678,
        lifetime_usd=155.179690
    )
    
    try:
        response = requests.post(
            INBOX_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code != 200:
            result.fail_test(
                "POST second payload",
                f"Expected status 200, got {response.status_code}"
            )
            return None
        
        data = response.json()
        
        if data.get("ok") is True and data.get("received_at"):
            result.pass_test("POST second payload returns {ok: true, received_at}")
            return data.get("received_at")
        else:
            result.fail_test(
                "POST second payload",
                f"Expected {{ok: true, received_at}}, got {data}"
            )
            return None
    
    except Exception as e:
        result.fail_test("POST second payload", f"Exception: {e}")
        return None


def test_4_get_after_post(result: TestResult):
    """Test 4: GET after POST should return full payload."""
    print("\n--- Test 4: GET after POST ---")
    
    try:
        response = requests.get(INBOX_URL, timeout=10)
        
        if response.status_code != 200:
            result.fail_test(
                "GET after POST",
                f"Expected status 200, got {response.status_code}"
            )
            return
        
        data = response.json()
        
        # Check required fields
        if data.get("empty") is not False:
            result.fail_test(
                "GET after POST",
                f"Expected {{empty: false}}, got empty={data.get('empty')}"
            )
            return
        
        if "received_at" not in data:
            result.fail_test("GET after POST", "Missing 'received_at' field")
            return
        
        if "today_usd" not in data:
            result.fail_test("GET after POST", "Missing 'today_usd' field")
            return
        
        if "payload" not in data:
            result.fail_test("GET after POST", "Missing 'payload' field")
            return
        
        # Verify today_usd matches the most recent posted total_usd (2.345678)
        expected_today_usd = 2.345678
        actual_today_usd = data.get("today_usd")
        
        if abs(actual_today_usd - expected_today_usd) < 0.000001:
            result.pass_test("GET after POST returns full payload with correct today_usd")
        else:
            result.fail_test(
                "GET after POST",
                f"Expected today_usd={expected_today_usd}, got {actual_today_usd}"
            )
    
    except Exception as e:
        result.fail_test("GET after POST", f"Exception: {e}")


def test_5_get_with_since_parameter(result: TestResult):
    """Test 5: GET with ?since parameter (various cases)."""
    print("\n--- Test 5: GET with ?since parameter ---")
    
    # First, get the current payload to know its synced_at
    try:
        response = requests.get(INBOX_URL, timeout=10)
        if response.status_code != 200:
            result.fail_test("GET with ?since (setup)", "Failed to get current payload")
            return
        
        data = response.json()
        if data.get("empty"):
            result.fail_test("GET with ?since (setup)", "No payload in inbox")
            return
        
        stored_synced_at = data["payload"].get("synced_at")
        
        # Test 5a: since is strictly newer than stored synced_at
        print("\n  5a: since is strictly newer than stored synced_at")
        future_since = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        response = requests.get(f"{INBOX_URL}?since={future_since}", timeout=10)
        
        if response.status_code != 200:
            result.fail_test(
                "GET with ?since (future)",
                f"Expected status 200, got {response.status_code}"
            )
        else:
            data = response.json()
            if data.get("empty") is True and data.get("no_new_data") is True:
                result.pass_test("GET with ?since (future) returns {empty: true, no_new_data: true}")
            else:
                result.fail_test(
                    "GET with ?since (future)",
                    f"Expected {{empty: true, no_new_data: true}}, got {data}"
                )
        
        # Test 5b: since is equal to stored synced_at
        print("\n  5b: since is equal to stored synced_at")
        response = requests.get(f"{INBOX_URL}?since={stored_synced_at}", timeout=10)
        
        if response.status_code != 200:
            result.fail_test(
                "GET with ?since (equal)",
                f"Expected status 200, got {response.status_code}"
            )
        else:
            data = response.json()
            # Per review: "When since is equal to or older than synced_at, expect full payload"
            if data.get("empty") is False and "payload" in data:
                result.pass_test("GET with ?since (equal) returns full payload")
            else:
                result.fail_test(
                    "GET with ?since (equal)",
                    f"Expected full payload (empty: false), got {data}"
                )
        
        # Test 5c: since is older than stored synced_at
        print("\n  5c: since is older than stored synced_at")
        past_since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        response = requests.get(f"{INBOX_URL}?since={past_since}", timeout=10)
        
        if response.status_code != 200:
            result.fail_test(
                "GET with ?since (past)",
                f"Expected status 200, got {response.status_code}"
            )
        else:
            data = response.json()
            if data.get("empty") is False and "payload" in data:
                result.pass_test("GET with ?since (past) returns full payload")
            else:
                result.fail_test(
                    "GET with ?since (past)",
                    f"Expected full payload, got {data}"
                )
        
        # Test 5d: since is malformed/garbage
        print("\n  5d: since is malformed/garbage")
        response = requests.get(f"{INBOX_URL}?since=garbage-timestamp", timeout=10)
        
        if response.status_code != 200:
            result.fail_test(
                "GET with ?since (malformed)",
                f"Expected status 200 (fallthrough), got {response.status_code}"
            )
        else:
            data = response.json()
            # Should fall through and return the payload (not crash)
            if data.get("empty") is False and "payload" in data:
                result.pass_test("GET with ?since (malformed) falls through and returns payload")
            else:
                result.fail_test(
                    "GET with ?since (malformed)",
                    f"Expected fallthrough to payload, got {data}"
                )
    
    except Exception as e:
        result.fail_test("GET with ?since parameter", f"Exception: {e}")


def test_6_post_invalid_bodies(result: TestResult):
    """Test 6: POST with invalid bodies should return 400."""
    print("\n--- Test 6: POST invalid bodies ---")
    
    # Test 6a: Plain text (not JSON)
    print("\n  6a: Plain text body")
    try:
        response = requests.post(
            INBOX_URL,
            data="not json",
            headers={"Content-Type": "text/plain"},
            timeout=10
        )
        
        if response.status_code != 400:
            result.fail_test(
                "POST plain text",
                f"Expected status 400, got {response.status_code}"
            )
        else:
            data = response.json()
            if data.get("ok") is False and "invalid json" in data.get("error", "").lower():
                result.pass_test("POST plain text returns 400 with 'invalid json' error")
            else:
                result.fail_test(
                    "POST plain text",
                    f"Expected {{ok: false, error: 'invalid json'}}, got {data}"
                )
    except Exception as e:
        result.fail_test("POST plain text", f"Exception: {e}")
    
    # Test 6b: JSON array (not object)
    print("\n  6b: JSON array body")
    try:
        response = requests.post(
            INBOX_URL,
            json=[1, 2, 3],
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code != 400:
            result.fail_test(
                "POST JSON array",
                f"Expected status 400, got {response.status_code}"
            )
        else:
            data = response.json()
            if data.get("ok") is False and "expected JSON object" in data.get("error", ""):
                result.pass_test("POST JSON array returns 400 with 'expected JSON object' error")
            else:
                result.fail_test(
                    "POST JSON array",
                    f"Expected {{ok: false, error: 'expected JSON object'}}, got {data}"
                )
    except Exception as e:
        result.fail_test("POST JSON array", f"Exception: {e}")


def test_7_delete_inbox(result: TestResult):
    """Test 7: DELETE should clear the inbox."""
    print("\n--- Test 7: DELETE inbox ---")
    
    try:
        # DELETE the inbox
        response = requests.delete(INBOX_URL, timeout=10)
        
        if response.status_code != 200:
            result.fail_test(
                "DELETE inbox",
                f"Expected status 200, got {response.status_code}"
            )
            return
        
        data = response.json()
        if data.get("ok") is not True:
            result.fail_test(
                "DELETE inbox",
                f"Expected {{ok: true}}, got {data}"
            )
            return
        
        result.pass_test("DELETE inbox returns {ok: true}")
        
        # Verify subsequent GET returns {empty: true}
        response = requests.get(INBOX_URL, timeout=10)
        
        if response.status_code != 200:
            result.fail_test(
                "GET after DELETE",
                f"Expected status 200, got {response.status_code}"
            )
            return
        
        data = response.json()
        if data.get("empty") is True:
            result.pass_test("GET after DELETE returns {empty: true}")
        else:
            result.fail_test(
                "GET after DELETE",
                f"Expected {{empty: true}}, got {data}"
            )
    
    except Exception as e:
        result.fail_test("DELETE inbox", f"Exception: {e}")


def test_8_health_endpoints(result: TestResult):
    """Test 8: Health and root endpoints should work."""
    print("\n--- Test 8: Health and root endpoints ---")
    
    # Test root endpoint
    try:
        response = requests.get(f"{BASE_URL}/api/", timeout=10)
        
        if response.status_code != 200:
            result.fail_test(
                "GET /api/",
                f"Expected status 200, got {response.status_code}"
            )
        else:
            data = response.json()
            if data.get("status") == "ok":
                result.pass_test("GET /api/ returns {status: 'ok'}")
            else:
                result.fail_test(
                    "GET /api/",
                    f"Expected {{status: 'ok'}}, got {data}"
                )
    except Exception as e:
        result.fail_test("GET /api/", f"Exception: {e}")
    
    # Test health endpoint
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        
        if response.status_code != 200:
            result.fail_test(
                "GET /api/health",
                f"Expected status 200, got {response.status_code}"
            )
        else:
            data = response.json()
            if data.get("status") == "ok":
                result.pass_test("GET /api/health returns {status: 'ok'}")
            else:
                result.fail_test(
                    "GET /api/health",
                    f"Expected {{status: 'ok'}}, got {data}"
                )
    except Exception as e:
        result.fail_test("GET /api/health", f"Exception: {e}")


def test_9_cors_headers(result: TestResult):
    """Test 9: CORS headers should be present."""
    print("\n--- Test 9: CORS headers ---")
    
    # Test OPTIONS preflight
    try:
        response = requests.options(
            INBOX_URL,
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "GET"
            },
            timeout=10
        )
        
        # Check for CORS headers
        allow_origin = response.headers.get("Access-Control-Allow-Origin")
        
        if allow_origin == "*":
            result.pass_test("OPTIONS preflight returns Access-Control-Allow-Origin: *")
        else:
            result.fail_test(
                "OPTIONS preflight",
                f"Expected Access-Control-Allow-Origin: *, got {allow_origin}"
            )
    except Exception as e:
        result.fail_test("OPTIONS preflight", f"Exception: {e}")
    
    # Test GET with Origin header
    try:
        response = requests.get(
            INBOX_URL,
            headers={"Origin": "https://example.com"},
            timeout=10
        )
        
        allow_origin = response.headers.get("Access-Control-Allow-Origin")
        
        if allow_origin == "*":
            result.pass_test("GET with Origin header returns Access-Control-Allow-Origin: *")
        else:
            result.fail_test(
                "GET with Origin",
                f"Expected Access-Control-Allow-Origin: *, got {allow_origin}"
            )
    except Exception as e:
        result.fail_test("GET with Origin", f"Exception: {e}")


def main():
    """Run all tests."""
    print("="*80)
    print("Unity Nodes Extension Inbox - Backend API Tests")
    print(f"Testing against: {BASE_URL}")
    print("="*80)
    
    result = TestResult()
    
    # Run tests in sequence
    test_1_fresh_state_get(result)
    test_2_post_valid_payload(result)
    test_3_post_second_payload(result)
    test_4_get_after_post(result)
    test_5_get_with_since_parameter(result)
    test_6_post_invalid_bodies(result)
    test_7_delete_inbox(result)
    test_8_health_endpoints(result)
    test_9_cors_headers(result)
    
    # Print summary
    success = result.summary()
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
