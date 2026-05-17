.PHONY: backend frontend dev build prod set-password install-service uninstall-service

backend:
	cd backend && PYTHONPATH=. .venv/bin/uvicorn main:app --reload --host 127.0.0.1 --port 8000

frontend:
	cd frontend && npm run dev

dev:
	@echo "Run in two separate terminals:"
	@echo "  make backend"
	@echo "  make frontend"

build:
	cd frontend && npm run build

prod:
	cd backend && PYTHONPATH=. .venv/bin/uvicorn main:app --host $${NANOSCOPE_HOST:-0.0.0.0} --port $${NANOSCOPE_PORT:-4123}

set-password:
	cd backend && .venv/bin/python ../scripts/set_password.py

install-service:
	mkdir -p ~/.config/systemd/user
	sed \
		-e 's|NANOSCOPE_BACKEND_DIR|$(CURDIR)/backend|g' \
		-e 's|NANOSCOPE_UVICORN|$(CURDIR)/backend/.venv/bin/uvicorn|g' \
		nanoscope.service.template > ~/.config/systemd/user/nanoscope.service
	systemctl --user daemon-reload
	systemctl --user enable nanoscope
	@echo "Service installed. Start: systemctl --user start nanoscope"

uninstall-service:
	systemctl --user disable --now nanoscope 2>/dev/null || true
	rm -f ~/.config/systemd/user/nanoscope.service
	systemctl --user daemon-reload
	@echo "Service removed."
