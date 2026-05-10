import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from auth import is_valid_session
from config import settings
from routers import agents, messages, metrics, sessions
from routers.auth import router as auth_router
from services.metrics_service import get_metrics

app = FastAPI(title="Crookery", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    allow_credentials=True,
)


class _AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.crookery_password_hash:
            return await call_next(request)
        path = request.url.path
        if path.startswith("/auth/"):
            return await call_next(request)
        if path.startswith("/api/"):
            token = request.cookies.get("crookery_session", "")
            if not is_valid_session(token):
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)


app.add_middleware(_AuthMiddleware)

app.include_router(auth_router)
app.include_router(metrics.router)
app.include_router(agents.router)
app.include_router(messages.router)
app.include_router(sessions.router)


@app.websocket("/ws")
async def websocket_metrics(ws: WebSocket):
    if settings.crookery_password_hash:
        token = ws.cookies.get("crookery_session", "")
        if not is_valid_session(token):
            await ws.close(code=4401)
            return
    await ws.accept()
    try:
        while True:
            data = get_metrics()
            await ws.send_text(json.dumps({"type": "metrics", "data": data}))
            await asyncio.sleep(10)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass


# Serve the Vite build in production (when frontend/dist/ exists)
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        candidate = _frontend_dist / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(_frontend_dist / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.crookery_host, port=settings.crookery_port, reload=False)
