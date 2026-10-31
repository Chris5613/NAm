"""Shared Postgres attempt windows, with a bounded local fallback for tests."""
import hashlib
import time
from collections import defaultdict, deque
from threading import Lock
from fastapi import HTTPException
from sqlalchemy import delete, select, text

from .db import SessionLocal, engine
from .models import RateLimitBucket

_lock = Lock()
_hits = defaultdict(deque)
MAX_IDENTITIES = 2048
_last_cleanup = 0.0


def _shared_rate(namespace: str, identity: str, max_attempts: int, seconds: int, now: float) -> None:
    global _last_cleanup
    digest = hashlib.sha256(f"{namespace}:{identity}".encode()).hexdigest()
    # The transaction-level lock also serializes the first insert, when no row exists.
    advisory_id = int(digest[:15], 16)
    with SessionLocal.begin() as db:
        db.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": advisory_id})
        if now - _last_cleanup >= 60:
            db.execute(delete(RateLimitBucket).where(RateLimitBucket.expires_at <= now))
            _last_cleanup = now
        row = db.get(RateLimitBucket, digest)
        hits = [float(hit) for hit in (row.hits or []) if float(hit) > now - seconds] if row else []
        if len(hits) >= max_attempts:
            retry_after = max(1, int(hits[0] + seconds - now) + 1)
            raise HTTPException(status_code=429, detail="Too many requests. Try again later.",
                                headers={"Retry-After": str(retry_after)})
        hits.append(now)
        if row:
            row.hits = hits
            row.expires_at = now + seconds
        else:
            db.add(RateLimitBucket(key=digest, hits=hits, expires_at=now + seconds))


def check_request_rate(namespace: str, identity: str, *, max_attempts: int, seconds: int, now: float | None = None) -> None:
    identity = identity.lower().strip()
    if now is None and engine.dialect.name == "postgresql":
        _shared_rate(namespace, identity, max_attempts, seconds, time.time())
        return
    now = time.monotonic() if now is None else now
    key = (namespace, identity)
    with _lock:
        if key not in _hits and len(_hits) >= MAX_IDENTITIES:
            for stale_key, old_queue in list(_hits.items()):
                if not old_queue or old_queue[-1] <= now - seconds:
                    _hits.pop(stale_key, None)
            if len(_hits) >= MAX_IDENTITIES:
                _hits.pop(next(iter(_hits)))
        queue = _hits[key]
        while queue and queue[0] <= now - seconds:
            queue.popleft()
        if len(queue) >= max_attempts:
            retry_after = max(1, int(queue[0] + seconds - now) + 1)
            raise HTTPException(status_code=429, detail="Too many requests. Try again later.",
                                headers={"Retry-After": str(retry_after)})
        queue.append(now)
