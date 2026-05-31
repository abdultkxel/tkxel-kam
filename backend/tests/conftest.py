import os
from pathlib import Path

TEST_DB_PATH = Path(__file__).resolve().parents[1] / ".pytest_cache" / "lifespan.db"
TEST_DB_PATH.parent.mkdir(exist_ok=True)

os.environ.setdefault("DATABASE_URL", f"sqlite:///{TEST_DB_PATH.as_posix()}")
os.environ.setdefault("EXPOSE_RESET_TOKENS", "true")
