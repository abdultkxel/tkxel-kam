from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import KamAiChatMessage, KamAiChatMessageSource, KamAiChatSession, KamAiSourceChunk


class KamAiChatRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_sessions(self, user_id: str, *, page: int = 1, page_size: int = 25, include_archived: bool = False) -> tuple[list[KamAiChatSession], int]:
        conditions = [KamAiChatSession.user_id == user_id]
        if not include_archived:
            conditions.append(KamAiChatSession.archived_at.is_(None))
        total = self.db.scalar(select(func.count(KamAiChatSession.id)).where(*conditions)) or 0
        items = list(
            self.db.scalars(
                select(KamAiChatSession)
                .where(*conditions)
                .order_by(KamAiChatSession.last_message_at.desc().nullslast(), KamAiChatSession.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_session(self, session_id: str) -> KamAiChatSession | None:
        return self.db.scalar(
            select(KamAiChatSession)
            .where(KamAiChatSession.id == session_id)
            .options(
                selectinload(KamAiChatSession.messages).selectinload(KamAiChatMessage.sources),
                selectinload(KamAiChatSession.account),
            )
        )

    def save_session(self, session: KamAiChatSession) -> KamAiChatSession:
        self.db.add(session)
        self.db.flush()
        return session

    def save_message(self, message: KamAiChatMessage) -> KamAiChatMessage:
        self.db.add(message)
        self.db.flush()
        return message

    def save_message_source(self, source: KamAiChatMessageSource) -> KamAiChatMessageSource:
        self.db.add(source)
        self.db.flush()
        return source

    def get_source_chunk(self, *, account_id: str, source_type: str, source_record_id: str, chunk_hash: str) -> KamAiSourceChunk | None:
        return self.db.scalar(
            select(KamAiSourceChunk).where(
                KamAiSourceChunk.account_id == account_id,
                KamAiSourceChunk.source_type == source_type,
                KamAiSourceChunk.source_record_id == source_record_id,
                KamAiSourceChunk.chunk_hash == chunk_hash,
            )
        )

    def save_source_chunk(self, chunk: KamAiSourceChunk) -> KamAiSourceChunk:
        self.db.add(chunk)
        self.db.flush()
        return chunk

    def source_chunks_for_accounts(self, account_ids: list[str]) -> list[KamAiSourceChunk]:
        if not account_ids:
            return []
        return list(
            self.db.scalars(
                select(KamAiSourceChunk)
                .where(KamAiSourceChunk.account_id.in_(account_ids), KamAiSourceChunk.deleted_at.is_(None))
                .order_by(KamAiSourceChunk.updated_at.desc())
            )
        )

    def source_chunk_count(self) -> int:
        return self.db.scalar(select(func.count(KamAiSourceChunk.id)).where(KamAiSourceChunk.deleted_at.is_(None))) or 0

