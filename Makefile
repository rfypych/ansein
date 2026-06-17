.PHONY: help install test test-cov run dev build clean

help:
	@echo "AnseIn v3.0 — Make targets"
	@echo ""
	@echo "Backend:"
	@echo "  install       Install Python deps in current env"
	@echo "  run           Run the FastAPI dev server (port 8000)"
	@echo "  test          Run pytest suite"
	@echo "  test-cov      Run pytest with coverage report"
	@echo "  migrate       Run alembic migrations"
	@echo ""
	@echo "Frontend:"
	@echo "  dev           Run Vite dev server (port 5173)"
	@echo "  build         Build frontend production bundle"
	@echo ""
	@echo "Docker:"
	@echo "  up            docker compose up -d (full stack)"
	@echo "  down          docker compose down"
	@echo ""
	@echo "Misc:"
	@echo "  clean         Remove build artifacts and caches"

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

run:
	cd backend && python run.py

dev:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

test:
	cd backend && python -m pytest tests/ -v

test-cov:
	cd backend && python -m pytest tests/ --cov=app --cov-report=term-missing

migrate:
	cd backend && alembic upgrade head

up:
	docker compose up -d --build

down:
	docker compose down

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	rm -rf backend/.coverage backend/htmlcov
	rm -rf frontend/node_modules frontend/dist
	rm -f backend/*.db backend/*.sqlite
