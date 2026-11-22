#!/usr/bin/env python3
"""Opt-in read-only Honeygain -> NAm bridge.

Requires your OWN Honeygain dashboard bearer token and a distinct NAm Honeygain
bridge token generated in the Honeygain project card. Tokens remain on this PC.
The Honeygain API is undocumented: use only with authorization from Honeygain.
No login requests, writes to Honeygain, auto-claims, or credential persistence.
"""
import json
import os
import sys
import time
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "https://dashboard.honeygain.com/api/v1"


def positive(value, field):
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise ValueError(f"{field} missing or non-numeric; refusing to record guessed income")
    v = float(value)
    if v < 0 or v > 1e9:
        raise ValueError(f"{field} outside allowable range")
    return v


def fetch(path, jwt):
    req = Request(BASE + path, headers={
        "Authorization": "Bearer " + jwt,
        "Accept": "application/json",
        "User-Agent": "NAm-Honeygain-ReadOnly/1.0",
    }, method="GET")
    with urlopen(req, timeout=15) as response:
        return json.load(response)


def read_today(response):
    # Community clients have observed BOTH "total_credits" and
    # { "total": { "credits": ... } } shapes. Never silently infer a
    # daily amount from the unrelated unpaid/payout balance.
    doc = response.get("data", response) if isinstance(response, dict) else {}
    if not isinstance(doc, dict):
        raise ValueError("Unexpected Honeygain daily-earnings response")
    if "total_credits" in doc:
        return positive(doc["total_credits"], "total_credits")
    total = doc.get("total")
    if isinstance(total, dict) and "credits" in total:
        return positive(total["credits"], "total.credits")
    raise ValueError("Unknown daily credits schema; contact support or update adapter")


def read_balance(response):
    doc = response.get("data", response) if isinstance(response, dict) else {}
    if not isinstance(doc, dict):
        return None
    payout = doc.get("payout")
    # Honeygain's payout credits are not JumpTask wallet transfers.
    return positive(payout["credits"], "payout.credits") if isinstance(payout, dict) and "credits" in payout else None


def send_nam(base_url, token, payload):
    req = Request(base_url.rstrip("/") + "/api/honeygain/ingest",
                  data=json.dumps(payload).encode("utf-8"),
                  headers={"Authorization": "Bearer " + token,
                           "Content-Type": "application/json"},
                  method="POST")
    with urlopen(req, timeout=20) as response:
        return json.load(response)


def run():
    jwt = os.getenv("HONEYGAIN_DASHBOARD_TOKEN", "").strip()
    token = os.getenv("NAM_HONEYGAIN_TOKEN", "").strip()
    url = os.getenv("NAM_API_URL", "").strip()
    mode = os.getenv("HONEYGAIN_MODE", "jumptask").lower()
    if not jwt or not token or not url or not url.startswith("https://"):
        raise ValueError("Set HONEYGAIN_DASHBOARD_TOKEN, NAM_HONEYGAIN_TOKEN and https:// NAM_API_URL locally")
    if mode not in ("jumptask", "honeygain"):
        raise ValueError("HONEYGAIN_MODE must be jumptask or honeygain")
    today_path = "/jt-earnings/today" if mode == "jumptask" else "/earnings/today"
    while True:
        try:
            today = read_today(fetch(today_path, jwt))
            unpaid = read_balance(fetch("/users/balances", jwt))
            day = datetime.now().astimezone().strftime("%Y-%m-%d")
            result = send_nam(url, token, {
                "day": day,
                "todayCredits": today,
                "unpaidBalanceCredits": unpaid,
                # JumpTask transfer is not earnings and is not inferred here.
            })
            print(f"{day}: {today:.4f} credits today; NAm accepted={result.get('ok')}", flush=True)
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as exc:
            # Don't print response bodies, tokens, URLs, or request objects.
            print(f"Honeygain bridge: sync failed ({type(exc).__name__}); previous values preserved", file=sys.stderr, flush=True)
        if "--once" in sys.argv:
            break
        time.sleep(300)


if __name__ == "__main__":
    run()
