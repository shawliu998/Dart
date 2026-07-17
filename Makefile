SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup dev dev-infra down logs test lint seed demo generate-demo verify-demo acceptance acceptance-api verify desktop-dev desktop-build desktop-test verify-desktop clean

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "BidEvidence commands:\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install local backend/frontend dependencies and generate demo files
	bash scripts/setup.sh

dev: ## Start the complete local stack with Docker Compose
	docker compose up --build

dev-infra: ## Start PostgreSQL, Redis and MinIO only
	docker compose up -d postgres redis minio minio-init

down: ## Stop the Docker Compose stack
	docker compose down

logs: ## Follow application service logs
	docker compose logs -f api worker web

test: ## Run backend, frontend and deterministic fixture verification
	bash scripts/test.sh

lint: ## Run backend lint/type checks and frontend lint/type checks
	bash scripts/lint.sh

seed: ## Generate fixtures, migrate, and seed the deterministic demo project
	bash scripts/seed.sh

demo: ## Build/start/seed the complete local demo and create acceptance artifacts
	bash scripts/demo.sh

generate-demo: ## Rebuild deterministic PDF/DOCX/XLSX demo documents
	python3 scripts/generate_demo_assets.py

verify-demo: ## Validate fixture inventory, formats, hashes and expected results
	python3 scripts/verify_demo.py

acceptance: ## Validate Phase 0-5 oracle and build a local preview ZIP/manifest
	python3 scripts/acceptance_mvp.py --artifacts-dir .data/acceptance --clean

acceptance-api: ## Validate a seeded running API and its real ZIP/audit artifacts
	python3 scripts/acceptance_api.py --artifacts-dir .data/service-acceptance --clean

verify: ## Run the complete local delivery gate including E2E and production build
	bash scripts/verify.sh

desktop-dev: ## Build the local frontend if needed and start the Electron development host
	bash scripts/desktop_dev.sh

desktop-build: ## Build the Next standalone renderer and Electron host
	cd frontend && npm run build
	cd desktop && npm run build

desktop-test: ## Run focused desktop backend, frontend, and Electron TypeScript checks
	cd backend && .venv/bin/python -m pytest tests/test_desktop_local.py
	cd frontend && npm run typecheck && npm run lint
	cd desktop && npm run typecheck

verify-desktop: desktop-test desktop-build ## Validate the P0 desktop development runtime

clean: ## Remove disposable local caches (does not delete database volumes)
	rm -rf backend/.pytest_cache backend/.ruff_cache frontend/.next frontend/coverage frontend/playwright-report frontend/test-results .data/acceptance .data/demo-delivery .data/service-acceptance .data/verify-runtime
