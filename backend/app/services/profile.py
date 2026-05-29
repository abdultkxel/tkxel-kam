from sqlalchemy.orm import Session

from app.models import User
from app.repositories.users import UserRepository
from app.schemas import ProfileUpdateRequest
from app.services.users import apply_profile_updates


class ProfileService:
    def __init__(self, db: Session, repository: UserRepository | None = None) -> None:
        self.repository = repository or UserRepository(db)

    def update_profile(self, user: User, payload: ProfileUpdateRequest) -> User:
        updates = payload.model_dump(exclude_unset=True)
        apply_profile_updates(user, updates)
        return self.repository.save_user(user, refresh=True)
