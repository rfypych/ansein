"""Rate limiter middleware (in-memory; Redis-backed in production)."""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple per-IP rate limiter. For multi-process deploys, swap for Redis."""

    def __init__(self, app, limit_per_minute: int = 120):
        super().__init__(app)
        self.limit = limit_per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()
        # Allow disabling entirely via env (e.g. for tests)
        self._disabled = os.environ.get("RATE_LIMIT_DISABLED", "").lower() in ("1", "true", "yes")

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        if self._disabled:
            return await call_next(request)
        # Skip rate limit for setup endpoints and health checks
        path = request.url.path
        if (
            path.startswith("/api/v1/setup")
            or path in ("/", "/health", "/api/v1/health", "/api/v1/health/")
            or path.startswith("/api/docs")
            or path.startswith("/api/redoc")
            or path.startswith("/api/openapi")
        ):
            return await call_next(request)

        client = request.client.host if request.client else "unknown"
        now = time.time()
        with self._lock:
            dq = self._hits[client]
            while dq and dq[0] < now - 60:
                dq.popleft()
            if len(dq) >= self.limit:
                return Response(
                    content='{"detail":"Rate limit exceeded","code":"rate_limited"}',
                    status_code=429,
                    media_type="application/json",
                    headers={"Retry-After": "60"},
                )
            dq.append(now)
        return await call_next(request)
