.PHONY: backend frontend dev build prod

backend:
	cd backend && PYTHONPATH=. .venv/bin/uvicorn main:app --reload --host 127.0.0.1 --port 8000

frontend:
	cd frontend && npm run dev

dev:
	@echo "Lancer dans deux terminaux séparés :"
	@echo "  make backend"
	@echo "  make frontend"

build:
	cd frontend && npm run build

prod: build
	cd backend && PYTHONPATH=. .venv/bin/uvicorn main:app --host 127.0.0.1 --port 4123
