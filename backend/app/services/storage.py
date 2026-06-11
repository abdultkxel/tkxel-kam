from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.config import get_settings


class StoredFile:
    def __init__(self, *, file_name: str, file_path: str, storage_backend: str, mime_type: str | None, size_bytes: int) -> None:
        self.file_name = file_name
        self.file_path = file_path
        self.storage_backend = storage_backend
        self.mime_type = mime_type
        self.size_bytes = size_bytes


class ContentStorageService:
    allowed_mime_types = {
        "application/pdf",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel.sheet.macroEnabled.12",
        "text/plain",
        "text/csv",
        "image/png",
        "image/jpeg",
    }

    def __init__(self) -> None:
        self.settings = get_settings()

    async def save_upload(self, upload: UploadFile) -> StoredFile:
        if self.settings.content_storage_backend != "local":
            raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Only local content storage is configured in this environment")
        if upload.content_type and upload.content_type not in self.allowed_mime_types:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded content type is not allowed")

        data = await upload.read()
        if not data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file cannot be empty")
        max_bytes = self.settings.content_storage_max_file_mb * 1024 * 1024
        if len(data) > max_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Uploaded file must be {self.settings.content_storage_max_file_mb} MB or smaller")

        storage_dir = Path(self.settings.local_content_storage_dir)
        try:
            storage_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Local content storage is unavailable") from exc
        original_name = Path(upload.filename or "content-upload").name
        stored_name = f"{uuid4()}-{original_name}"
        destination = storage_dir / stored_name
        try:
            destination.write_bytes(data)
        except OSError as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Uploaded file could not be stored") from exc
        return StoredFile(
            file_name=original_name,
            file_path=str(destination),
            storage_backend="local",
            mime_type=upload.content_type,
            size_bytes=len(data),
        )

    def delete_stored_file(self, stored_file: StoredFile | str | None) -> None:
        if not stored_file:
            return
        path = Path(stored_file.file_path if isinstance(stored_file, StoredFile) else stored_file)
        if not path.is_absolute():
            path = Path(self.settings.local_content_storage_dir) / path
        try:
            if path.exists() and path.is_file():
                path.unlink()
        except OSError:
            # Duplicate/error cleanup should not hide the primary upload error.
            return
