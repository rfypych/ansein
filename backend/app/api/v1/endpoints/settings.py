from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import UserSettingsOut, UserSettingsUpdate
from app.services import user_service

router = APIRouter()


@router.get("", response_model=UserSettingsOut)
def get_settings_(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return user_service.get_settings_out(db, user.id)


@router.put("", response_model=UserSettingsOut)
def update_settings_(
    payload: UserSettingsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return user_service.update_user_settings(db, user.id, payload)
