COMPOSE ?= docker compose
SONAR_COMPOSE ?= $(COMPOSE) -f docker-compose.sonar.yml
SONAR_HOST_URL ?= http://127.0.0.1:9000
SONAR_TOKEN ?=
LAN_IP ?= $(shell hostname -I | awk '{print $$1}')

.PHONY: help dev-run build run qa-run migrate seed test down logs clean sonar-up sonar-scan sonar-down sonar-logs

help:
	@echo "Available commands:"
	@echo "  make dev-run  - Build and run frontend, backend, and PostgreSQL with live reload"
	@echo "  make build    - Build Docker images"
	@echo "  make run      - Run all services in the background"
	@echo "  make qa-run   - Run all services for office LAN sharing using this machine's LAN IP"
	@echo "  make migrate  - Create/update database schema"
	@echo "  make seed     - Seed base roles, users, and login domain data"
	@echo "  make test     - Run backend and frontend tests in Docker"
	@echo "  make down     - Stop Docker services"
	@echo "  make logs     - Follow Docker logs"
	@echo "  make clean    - Stop services and remove project volumes"
	@echo "  make sonar-up - Start local SonarQube on http://127.0.0.1:9000"
	@echo "  make sonar-scan SONAR_TOKEN=... - Run SonarQube analysis"
	@echo "  make sonar-down - Stop local SonarQube"
	@echo "  make sonar-logs - Follow SonarQube logs"

dev-run:
	$(COMPOSE) up --build

build:
	$(COMPOSE) build

run:
	$(COMPOSE) up -d --build

qa-run:
	APP_ACCESS_MODE=QA LAN_HOST_IP=$(LAN_IP) $(COMPOSE) up -d --build
	@echo "Frontend: http://$(LAN_IP):$${FRONTEND_HOST_PORT:-5173}"
	@echo "Backend:  http://$(LAN_IP):$${BACKEND_HOST_PORT:-8001}/docs"

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

sonar-up:
	$(SONAR_COMPOSE) up -d

sonar-scan:
	@test -n "$(SONAR_TOKEN)" || (echo "SONAR_TOKEN is required. Start SonarQube, create a token, then run: make sonar-scan SONAR_TOKEN=your_token"; exit 1)
	docker run --rm --network host \
		-v "$(PWD):/usr/src" \
		-e SONAR_HOST_URL="$(SONAR_HOST_URL)" \
		-e SONAR_TOKEN="$(SONAR_TOKEN)" \
		sonarsource/sonar-scanner-cli:latest

sonar-down:
	$(SONAR_COMPOSE) down

sonar-logs:
	$(SONAR_COMPOSE) logs -f
