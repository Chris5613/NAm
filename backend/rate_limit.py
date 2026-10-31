"""Bound request volume for sensitive single-instance endpoints.

This defense is process-local; deploy a shared limiter before horizontal scaling.
"""
import time
from collections import defaultdict, deque
from threading import Lock
from fastapi import HTTPException

_lock = Lock()
_hits = defaultdict(deque)


def check_request_rate(namespace: str, identity: str, *, max_attempts: int, seconds: int, now: float | None = None) -> None:
    now = time.monotonic() if now is None else now
    key = (namespace, identity.lower().strip())
    with _lock:
        queue = _hits[key]
        while queue and queue[0] <= now - seconds:
            queue.popleft()
        if len(queue) >= max_attempts:
            retry_after = max(1, int(queue[0] + seconds - now) + 1)
            raise HTTPException(status_code=429, detail="Too many requests. Try again later.",
                                headers={"Retry-After": str(retry_after)})
        queue.append(now)
