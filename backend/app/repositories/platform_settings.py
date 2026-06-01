from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlatformSetting, utc_now


class PlatformSettingRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_key(self, key: str) -> PlatformSetting | None:
        return self.db.scalar(select(PlatformSetting).where(PlatformSetting.key == key))

    def set_value(self, key: str, value: object, *, updated_by_id: str | None = None) -> PlatformSetting:
        setting = self.get_by_key(key)
        if setting is None:
            setting = PlatformSetting(key=key, value_json=value, updated_by_id=updated_by_id)
            self.db.add(setting)
        else:
            setting.value_json = value
            setting.updated_by_id = updated_by_id
            setting.updated_at = utc_now()
        self.db.flush()
        return setting
