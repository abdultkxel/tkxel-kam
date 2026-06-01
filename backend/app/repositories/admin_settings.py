from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdminSetting


class AdminSettingsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_key(self, key: str) -> AdminSetting | None:
        return self.db.scalar(select(AdminSetting).where(AdminSetting.key == key))

    def save(self, setting: AdminSetting) -> AdminSetting:
        self.db.add(setting)
        self.db.commit()
        self.db.refresh(setting)
        return setting
