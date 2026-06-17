from fastapi import APIRouter

from app.api.v1.endpoints import (
    analysis,
    auth,
    copilot,
    entities,
    export,
    graph,
    health,
    ingest,
    investigations,
    settings,
    setup,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(setup.router, prefix="/setup", tags=["setup"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(investigations.router, prefix="/investigations", tags=["investigations"])
api_router.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
api_router.include_router(entities.router, prefix="/entities", tags=["entities"])
api_router.include_router(graph.router, prefix="/graph", tags=["graph"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
api_router.include_router(copilot.router, prefix="/copilot", tags=["copilot"])
api_router.include_router(export.router, prefix="/export", tags=["export"])
