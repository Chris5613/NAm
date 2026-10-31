"""Read-only live Phase 7 deployment verification (no financial mutations).

The operator must close all NAm browser tabs and run against their own
HTTPS deployment with a session cookie supplied in the environment.
Only GET requests are made, and no provider/financial records are printed.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler

from tools.phase7_readiness_check import inspect_diagnostics

PATHS = (
    "/api/yield-sources/latest",
    "/api/yield-sources/migration-status",
    "/api/yield-sources/cutover-backups",
)
MAX_BYTES = 2_000_000


def parse_timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None


def source_timestamps(snapshot):
    """Compare the same registered provider account without printing IDs."""
    result = {}
    accounts = snapshot.get("lulo")
    if isinstance(accounts, dict):
        for wallet, reading in accounts.items():
            if isinstance(wallet, str) and isinstance(reading, dict):
                stamp = parse_timestamp(reading.get("syncedAt"))
                if stamp:
                    result[("lulo", wallet)] = stamp
    loop = snapshot.get("loopscale")
    if isinstance(loop, dict):
        wallet = loop.get("walletAddress")
        stamp = parse_timestamp(loop.get("syncedAt"))
        if isinstance(wallet, str) and stamp:
            result[("loopscale", wallet)] = stamp
    return result


def assess_progress(first, second):
    """Require an actual newer upstream sample, not just a new HTTP request."""
    if not isinstance(first, dict) or not isinstance(second, dict):
        return False
    first_at = parse_timestamp(first.get("successfulAt"))
    second_at = parse_timestamp(second.get("successfulAt"))
    if first_at is None or second_at is None or second_at <= first_at:
        return False
    old = source_timestamps(first)
    new = source_timestamps(second)
    return any(new_at > old[key] for key, new_at in new.items() if key in old)


def validate_base_url(value):
    address = urlparse(value)
    is_local = address.hostname in {"localhost", "127.0.0.1", "::1"}
    if address.username or address.password or address.query or address.fragment or address.path not in ("", "/"):
        raise ValueError("Base URL must contain only a scheme and host (and optional port)")
    if address.scheme != "https" and not (is_local and address.scheme == "http"):
        raise ValueError("Use HTTPS except for explicitly local test servers")
    if not address.netloc:
        raise ValueError("Missing host")
    return value.rstrip("/")


class _NoRedirect(HTTPRedirectHandler):
    """Never forward an authenticated cookie to a redirect destination."""

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def fetch_json(base, path, cookie):
    if path not in PATHS:
        raise ValueError("Endpoint not allowed")
    request = Request(base + path, headers={
        "Accept": "application/json",
        "Cookie": cookie,
        "User-Agent": "NAm-phase7-readonly-verification",
    }, method="GET")
    # Do not follow any redirect, including same-origin redirects. Cookie
    # forwarding across redirects is unsafe for an authenticated probe.
    with build_opener(_NoRedirect).open(request, timeout=15) as response:
        payload = response.read(MAX_BYTES + 1)
        if len(payload) > MAX_BYTES:
            raise ValueError("Response exceeds safe size limit")
        result = json.loads(payload)
        if not isinstance(result, dict):
            raise ValueError("Unexpected diagnostic response format")
        return result


def verify_once(base, cookie):
    return {path: fetch_json(base, path, cookie) for path in PATHS}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Read-only Phase 7 source polling and parity diagnostic probe")
    parser.add_argument("--base-url", required=True, help="HTTPS origin for deployed NAm (no path)")
    parser.add_argument("--interval-seconds", type=int, default=660,
                        help="Time between checks; choose longer than the production poll cadence")
    args = parser.parse_args(argv)
    if args.interval_seconds < 1 or args.interval_seconds > 3600:
        parser.error("interval must be between 1 and 3600 seconds")
    try:
        base = validate_base_url(args.base_url)
    except ValueError as exc:
        parser.error(str(exc))
    cookie = os.getenv("NAM_SESSION_COOKIE", "")
    if not cookie:
        parser.error("NAM_SESSION_COOKIE environment variable required; never put cookies in command arguments")
    try:
        first = verify_once(base, cookie)
        time.sleep(args.interval_seconds)
        second = verify_once(base, cookie)
        diagnostic = inspect_diagnostics(
            second["/api/yield-sources/migration-status"],
            second["/api/yield-sources/cutover-backups"],
        )
        advanced = assess_progress(first["/api/yield-sources/latest"],
                                   second["/api/yield-sources/latest"])
        result = {
            "sourceObservationAdvancedWhileBrowserClosed": advanced,
            "diagnosticReady": diagnostic["diagnosticReady"],
            "blockerCount": len(diagnostic["blockers"]),
            "projectsReviewed": diagnostic["projectsReviewed"],
            "manualChecksRequired": True,
            "financialWritesMayBeEnabled": False,
        }
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
        # Never echo provider data or HTTP response bodies containing sensitive
        # user information. The class indicates the failure without secrets.
        print(json.dumps({"verificationFailed": type(exc).__name__,
                          "financialWritesMayBeEnabled": False}))
        return 2
    print(json.dumps(result, indent=2))
    return 0 if advanced and diagnostic["diagnosticReady"] else 2


if __name__ == "__main__":
    sys.exit(main())
