from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db, ping
from app.services.setup_service import is_setup_complete

router = APIRouter()


@router.get("/")
def health_check(db: Session = Depends(get_db)):
    s = get_settings()
    return {
        "status": "ok",
        "app": s.app_name,
        "version": "3.0.0",
        "env": s.app_env,
        "database_configured": s.database_configured,
        "database_connected": ping(),
        "setup_complete": is_setup_complete(),
        "setup_required": s.setup_required,
    }
