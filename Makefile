COMPOSE ?= docker compose

.PHONY: help dev-run build run migrate seed test down logs clean

help:
	@echo "Available commands:"
	@echo "  make dev-run  - Build and run frontend, backend, and PostgreSQL with live reload"
	@echo "  make build    - Build Docker images"
	@echo "  make run      - Run all services in the background"
	@echo "  make migrate  - Create/update database schema"
	@echo "  make seed     - Seed default data"
	@echo "  make test     - Run backend and frontend tests in Docker"
	@echo "  make down     - Stop Docker services"
	@echo "  make logs     - Follow Docker logs"
	@echo "  make clean    - Stop services and remove project volumes"

dev-run:
	$(COMPOSE) up --build

build:
	$(COMPOSE) build

run:
	$(COMPOSE) up -d --build

migrate:
	$(COMPOSE) up -d db
	$(COMPOSE) run --rm backend python -m app.cli migrate

seed:
	$(COMPOSE) up -d db
	$(COMPOSE) run --rm backend python -m app.cli seed

test:
	$(COMPOSE) run --rm --no-deps backend pytest
	$(COMPOSE) run --rm --no-deps frontend npm test

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

clean:
	$(COMPOSE) down -v --remove-orphans
