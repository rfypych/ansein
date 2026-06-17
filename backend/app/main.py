"""
FastAPI application entrypoint.

Startup flow:
1. Load settings (cached)
2. Initialise DB engine (auto-falls-back to in-memory SQLite if not configured)
3. Create tables (idempotent — Alembic handles migrations in production)
4. Mount API routers
5. Mount frontend (Vite build → /static, SPA fallback to index.html)
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.db.session import Base, get_engine, init_engine
from app.middleware.rate_limit import RateLimitMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("ansein")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    log.info("Starting %s v3.0.0 (env=%s)", s.app_name, s.app_env)
    init_engine()
    try:
        Base.metadata.create_all(bind=get_engine())
        log.info("DB tables ensured")
    except Exception as e:
        log.warning("Could not ensure DB tables (likely setup mode): %s", e)
    yield
    log.info("Shutting down %s", s.app_name)


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title=s.app_name,
        version="3.0.0",
        description="Advanced Neural Security Extractor Intelligence — CTI/OSINT platform",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Rate limit
    app.add_middleware(RateLimitMiddleware, limit_per_minute=s.rate_limit_per_minute)

    # API
    app.include_router(api_router, prefix="/api/v1")

    # Frontend (if built and present)
    frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    if frontend_dist.exists():
        app.mount("/static", StaticFiles(directory=str(frontend_dist / "assets")), name="static")

        @app.get("/{full_path:path}")
        async def spa_fallback(full_path: str, request: Request):  # noqa: ARG001
            # Never catch /api/* — those routes should always 404 properly.
            # If the user requested /api/v1/foo but only /api/v1/foo/ exists,
            # redirect to the trailing-slash version so FastAPI can match it.
            if full_path.startswith("api/"):
                if not full_path.endswith("/"):
                    return RedirectResponse(
                        url=f"/{full_path}/", status_code=307
                    )
                return JSONResponse({"detail": "Not found"}, status_code=404)
            # SPA fallback
            index = frontend_dist / "index.html"
            if index.exists():
                return Response(
                    content=index.read_text(encoding="utf-8"),
                    media_type="text/html",
                )
            return JSONResponse({"detail": "Frontend not built"}, status_code=404)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):  # noqa: ARG001
        log.exception("Unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error", "code": "internal"},
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=get_settings().app_debug,
    )
