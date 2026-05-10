import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from routers import agents, messages, metrics, sessions
from services.metrics_service import get_metrics

app = FastAPI(title="Crookery", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(metrics.router)
app.include_router(agents.router)
app.include_router(messages.router)
app.include_router(sessions.router)


@app.websocket("/ws")
async def websocket_metrics(ws: WebSocket):
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
