.PHONY: backend frontend dev build prod set-password install-service uninstall-service

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
	cd backend && PYTHONPATH=. .venv/bin/uvicorn main:app --host $${CROOKERY_HOST:-0.0.0.0} --port $${CROOKERY_PORT:-4123}

set-password:
	cd backend && .venv/bin/python ../scripts/set_password.py

install-service:
	mkdir -p ~/.config/systemd/user
	sed \
		-e 's|CROOKERY_BACKEND_DIR|$(CURDIR)/backend|g' \
		-e 's|CROOKERY_UVICORN|$(CURDIR)/backend/.venv/bin/uvicorn|g' \
		crookery.service.template > ~/.config/systemd/user/crookery.service
	systemctl --user daemon-reload
	systemctl --user enable crookery
	@echo "Service installé. Démarrer : systemctl --user start crookery"

uninstall-service:
	systemctl --user disable --now crookery 2>/dev/null || true
	rm -f ~/.config/systemd/user/crookery.service
	systemctl --user daemon-reload
	@echo "Service supprimé."
