"""Read-only SQLite access helpers for NanoClaw databases."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

from config import settings


@contextmanager
def central_db() -> Generator[sqlite3.Connection, None, None]:
    path = settings.central_db_path
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 2000")
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def session_db(path: Path) -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 2000")
    try:
        yield conn
    finally:
        conn.close()


def iter_session_db_paths() -> Generator[tuple[str, str, Path, Path], None, None]:
    """Yield (agent_group_id, session_id, inbound_path, outbound_path) for each session folder."""
    sessions_dir = settings.sessions_dir
    if not sessions_dir.exists():
        return
    for ag_dir in sorted(sessions_dir.iterdir()):
        if not ag_dir.is_dir() or not ag_dir.name.startswith("ag-"):
            continue
        for sess_dir in sorted(ag_dir.iterdir()):
            if not sess_dir.is_dir() or not sess_dir.name.startswith("sess-"):
                continue
            inbound = sess_dir / "inbound.db"
            outbound = sess_dir / "outbound.db"
            if inbound.exists() or outbound.exists():
                yield ag_dir.name, sess_dir.name, inbound, outbound
