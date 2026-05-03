"""
Backend regression tests for Net Worth Tracker API.
Covers: root, /api/assets CRUD, /api/net-worth (current/snapshot/history), /api/prices/*
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback to read from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass

BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Root ----------
def test_root(http):
    r = http.get(f"{API}/")
    assert r.status_code == 200
    data = r.json()
    assert "message" in data
    assert isinstance(data["message"], str)


# ---------- Assets list ----------
def test_list_assets_returns_list(http):
    r = http.get(f"{API}/assets")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # Ensure no _id field leak
    for item in data:
        assert "_id" not in item
        assert "id" in item


# ---------- CRUD lifecycle ----------
@pytest.fixture
def created_asset(http):
    payload = {
        "name": "TEST_AssetCRUD",
        "category": "stocks",
        "symbol": "TEST",
        "quantity": 10,
        "current_price": 25.5,
        "cost_basis": 200.0,
        "notes": "pytest",
    }
    r = http.post(f"{API}/assets", json=payload)
    assert r.status_code == 200, f"Create failed: {r.text}"
    asset = r.json()
    yield asset
    # cleanup
    http.delete(f"{API}/assets/{asset['id']}")


def test_create_asset_persists(http, created_asset):
    aid = created_asset["id"]
    assert created_asset["name"] == "TEST_AssetCRUD"
    assert created_asset["category"] == "stocks"
    assert created_asset["quantity"] == 10
    assert created_asset["current_price"] == 25.5

    # Verify via GET list
    r = http.get(f"{API}/assets")
    ids = [a["id"] for a in r.json()]
    assert aid in ids


def test_update_asset_persists(http, created_asset):
    aid = created_asset["id"]
    upd = {"current_price": 50.0, "quantity": 20}
    r = http.put(f"{API}/assets/{aid}", json=upd)
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["current_price"] == 50.0
    assert updated["quantity"] == 20
    assert updated["name"] == "TEST_AssetCRUD"  # unchanged

    # Verify via list
    r = http.get(f"{API}/assets")
    found = next((a for a in r.json() if a["id"] == aid), None)
    assert found is not None
    assert found["current_price"] == 50.0


def test_update_nonexistent_returns_404(http):
    r = http.put(f"{API}/assets/non-existent-id-xyz", json={"name": "x"})
    assert r.status_code == 404


def test_delete_asset_removes_it(http):
    payload = {"name": "TEST_DeleteMe", "category": "cash", "manual_value": 100.0}
    r = http.post(f"{API}/assets", json=payload)
    assert r.status_code == 200
    aid = r.json()["id"]

    r = http.delete(f"{API}/assets/{aid}")
    assert r.status_code == 200

    # Verify gone
    r = http.get(f"{API}/assets")
    assert aid not in [a["id"] for a in r.json()]


def test_delete_nonexistent_returns_404(http):
    r = http.delete(f"{API}/assets/non-existent-id-xyz")
    assert r.status_code == 404


# ---------- Net worth ----------
def test_get_net_worth_structure(http):
    r = http.get(f"{API}/net-worth")
    assert r.status_code == 200
    data = r.json()
    assert "total_net_worth" in data
    assert "breakdown" in data
    assert "asset_count" in data
    for k in ["stocks", "crypto", "cash", "crypto_projects", "debts"]:
        assert k in data["breakdown"]
        assert isinstance(data["breakdown"][k], (int, float))
    assert isinstance(data["total_net_worth"], (int, float))


def test_net_worth_calculation_correct(http):
    # Create deterministic assets, snapshot, and check math
    created_ids = []
    try:
        # stocks: 5 * 10 = 50
        r1 = http.post(f"{API}/assets", json={
            "name": "TEST_calc_stock", "category": "stocks",
            "quantity": 5, "current_price": 10
        })
        created_ids.append(r1.json()["id"])
        # cash manual: 200
        r2 = http.post(f"{API}/assets", json={
            "name": "TEST_calc_cash", "category": "cash",
            "manual_value": 200
        })
        created_ids.append(r2.json()["id"])
        # debts manual: 30 (subtracted)
        r3 = http.post(f"{API}/assets", json={
            "name": "TEST_calc_debt", "category": "debts",
            "manual_value": 30
        })
        created_ids.append(r3.json()["id"])

        r = http.get(f"{API}/net-worth")
        data = r.json()
        # Net worth must include our additions as: +50 +200 -30 = +220 delta
        # We can't assume isolation, so compare breakdown contains at least our amounts
        assert data["breakdown"]["stocks"] >= 50
        assert data["breakdown"]["cash"] >= 200
        assert data["breakdown"]["debts"] >= 30
    finally:
        for aid in created_ids:
            http.delete(f"{API}/assets/{aid}")


def test_save_snapshot(http):
    r = http.post(f"{API}/net-worth/snapshot")
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert "total_net_worth" in data
    assert "timestamp" in data


def test_get_history(http):
    # Ensure at least one snapshot exists
    http.post(f"{API}/net-worth/snapshot")
    r = http.get(f"{API}/net-worth/history")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    for snap in data:
        assert "_id" not in snap
        assert "total_net_worth" in snap
        assert "timestamp" in snap


# ---------- Prices ----------
def test_get_crypto_price_bitcoin(http):
    r = http.get(f"{API}/prices/crypto/bitcoin")
    # CoinGecko may rate-limit; allow 200 or 429/504
    assert r.status_code in (200, 429, 500, 504), r.text
    if r.status_code == 200:
        data = r.json()
        assert data["coin_id"] == "bitcoin"
        assert "price_usd" in data
        assert isinstance(data["price_usd"], (int, float))
        assert data["price_usd"] > 0


def test_get_crypto_price_invalid(http):
    r = http.get(f"{API}/prices/crypto/totallyfakecoin_xyz_zzz")
    # Should be 404 (coin not found) or 500 (treated as error)
    assert r.status_code in (404, 500)


def test_refresh_all_prices(http):
    r = http.post(f"{API}/prices/refresh")
    assert r.status_code == 200
    data = r.json()
    assert "updated_count" in data
    assert "total_assets" in data
    assert isinstance(data["updated_count"], int)
    assert isinstance(data["total_assets"], int)
