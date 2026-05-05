"""
Stub backend with a tiny in-memory inbox for the Unity Nodes Earnings Tracker
Chrome extension.

The frontend is fully client-side (React + localStorage). The only piece of
state the server holds is a single transient slot — the most recent JSON push
from the extension. The frontend polls it, applies the delta to localStorage,
and the server can drop the data on restart with zero consequence (the
extension auto-syncs again on its next schedule).

No database, no auth — by design. The endpoint is single-user and lives behind
the same ingress as the rest of the app.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = logging.getLogger("unity_inbox")
logger.setLevel(logging.INFO)

app = FastAPI(title="Net Worth Tracker - Stub Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # extension POSTs without cookies; '*' + creds is invalid anyway
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ─────────────────────── Unity Nodes extension inbox ────────────────────────
# A single in-memory slot. The Chrome extension POSTs the latest earnings
# payload here every time it auto-syncs (default schedule: 7:30 PM PST). The
# frontend polls GET /api/integrations/unity-network/inbox, compares
# `synced_at` against its own `last_applied_synced_at`, and credits any new
# earnings to the Phone Farm investment project.
#
# Persistence is intentionally absent — the extension is the source of truth
# and will re-push on its next cycle if we ever lose state.
_unity_inbox: dict[str, Any] = {
    "received_at": None,   # ISO 8601 — when the server received the push
    "payload": None,       # full extension JSON body
}


def _today_total_from_payload(payload: Optional[dict[str, Any]]) -> float:
    """Extract today's earnings (USD) from an extension payload, defensively."""
    if not payload:
        return 0.0
    raw = payload.get("total_usd")
    try:
        return float(raw) if raw is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


@app.get("/api/")
async def root() -> dict[str, str]:
    return {
        "status": "ok",
        "message": "App is fully client-side. Unity Nodes extension inbox is the only stateful endpoint.",
    }


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/integrations/unity-network/inbox")
async def unity_inbox_push(request: Request) -> JSONResponse:
    """Receive a JSON payload from the Chrome extension.

    Accepts any JSON body — we don't enforce a schema because the extension
    payload may evolve. The frontend handles missing fields defensively. The
    server simply timestamps the push and stores it in memory.
    """
    try:
        payload = await request.json()
    except Exception as exc:  # noqa: BLE001 — surface any JSON error to the extension
        logger.warning("unity inbox push: invalid JSON (%s)", exc)
        return JSONResponse({"ok": False, "error": "invalid json"}, status_code=400)

    if not isinstance(payload, dict):
        return JSONResponse({"ok": False, "error": "expected JSON object"}, status_code=400)

    received_at = datetime.now(timezone.utc).isoformat()
    _unity_inbox["received_at"] = received_at
    _unity_inbox["payload"] = payload

    today_total = _today_total_from_payload(payload)
    logger.info(
        "unity inbox push received: date=%s today_total_usd=%.6f lifetime_usd=%s synced_at=%s",
        payload.get("date"),
        today_total,
        payload.get("lifetime_usd"),
        payload.get("synced_at"),
    )

    return JSONResponse({"ok": True, "received_at": received_at})


@app.get("/api/integrations/unity-network/inbox")
async def unity_inbox_latest(since: Optional[str] = None) -> JSONResponse:
    """Return the latest extension push.

    Query params:
      - `since` (optional ISO 8601 string) — if provided and the stored
        `synced_at` is not strictly newer than `since`, return 204 so the
        client knows there's nothing fresh.

    Response shape on hit:
      {
        "received_at": "2025-07-...",
        "today_usd": 1.234567,           # convenience field — payload.total_usd
        "payload": { ...full extension body... }
      }
    """
    payload = _unity_inbox.get("payload")
    received_at = _unity_inbox.get("received_at")

    if not payload or not received_at:
        return JSONResponse({"empty": True}, status_code=200)

    if since:
        synced_at = payload.get("synced_at") or received_at
        # Parse both as datetimes for robust comparison; fall through (return
        # the payload) on any parse error so a malformed `since` never
        # accidentally hides a valid push.
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            stored_dt = datetime.fromisoformat(str(synced_at).replace("Z", "+00:00"))
            if stored_dt <= since_dt:
                return JSONResponse({"empty": True, "no_new_data": True}, status_code=200)
        except (ValueError, TypeError, AttributeError):
            pass  # fall through and return current payload

    return JSONResponse(
        {
            "empty": False,
            "received_at": received_at,
            "today_usd": _today_total_from_payload(payload),
            "payload": payload,
        },
        status_code=200,
    )


@app.delete("/api/integrations/unity-network/inbox")
async def unity_inbox_clear() -> dict[str, bool]:
    """Manually clear the in-memory inbox (used by frontend 'Reset' / tests)."""
    _unity_inbox["received_at"] = None
    _unity_inbox["payload"] = None
    return {"ok": True}
