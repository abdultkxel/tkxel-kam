# KAM Backend

FastAPI backend scaffold for the KAM Intelligence Platform.

## PostgreSQL

The local API is configured to use:

```text
postgresql+psycopg://kam_app:kam_app_password@127.0.0.1:5433/kam_intelligence
```

The app creates the auth tables on startup and seeds a super admin when one does not exist.

Super admin:

```text
Email: admin@tkxel.com
Password: Admin@12345
```

Default allowed email domains are `tkxel.com`, `tkxel.io`, and `camp1.tkxel.com`.
Google Sign-In ID token verification uses `GOOGLE_SIGN_IN_CLIENT_ID`.

## Docker Development

Run backend through the root Makefile:

```bash
make dev-run
make migrate
make seed
make test
```

## Local Development Fallback

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Health check:

```bash
curl http://127.0.0.1:8001/health
```

Swagger API documentation:

```text
http://127.0.0.1:8001/docs
```

Tests:

```bash
pip install -r requirements-dev.txt
pytest
```
