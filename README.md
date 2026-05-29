# KAM Intelligence Platform

This repository is organized as:

```text
frontend/   React + Vite application
backend/    FastAPI + PostgreSQL API
```

## Run Frontend

```bash
cd frontend
npm install
npm run dev -- --port 5173
```

Frontend URL:

```text
http://127.0.0.1:5173/
```

## Run Backend

PostgreSQL must be reachable at `127.0.0.1:5432`.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Backend URLs:

```text
Health:  http://127.0.0.1:8001/health
Swagger: http://127.0.0.1:8001/docs
```

Seeded super admin:

```text
Email: admin@tkxelkam.com
Password: Admin@12345
```

## Tests

```bash
cd backend && pytest
cd frontend && npm test
```
