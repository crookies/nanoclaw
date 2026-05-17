import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from config import settings
from db import central_db, iter_session_db_paths, session_db


def get_nanoclaw_status() -> str:
    """Return 'online', 'warning', or 'offline'."""
    try:
        result = subprocess.run(
            ["systemctl", "--user", "list-units", "--no-legend", "--state=active", "nanoclaw-v2-*"],
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode == 0 and result.stdout.strip():
            return "online"
        # Try any nanoclaw service
        result2 = subprocess.run(
            ["systemctl", "--user", "list-units", "--no-legend", "nanoclaw-v2-*"],
            capture_output=True, text=True, timeout=3,
        )
        if result2.returncode == 0 and result2.stdout.strip():
            return "warning"
        return "offline"
    except Exception:
        return _status_from_db()


def _status_from_db() -> str:
    try:
        db_path = settings.central_db_path
        if not db_path.exists():
            return "offline"
        age_s = time.time() - db_path.stat().st_mtime
        # DB modified within last 5 minutes → likely running
        if age_s < 300:
            return "online"
        if age_s < 3600:
            return "warning"
        return "offline"
    except Exception:
        return "offline"


def get_uptime_seconds() -> int | None:
    """Return NanoClaw uptime in seconds based on log file mtime, or None."""
    try:
        log_path = settings.logs_dir / "nanoclaw.log"
        if not log_path.exists():
            log_path = settings.central_db_path
        if not log_path.exists():
            return None
        # mtime of the log = last write; not a reliable uptime proxy.
        # Use systemd to get the real start time.
        result = subprocess.run(
            ["systemctl", "--user", "show", "--property=ActiveEnterTimestamp",
             "--value", "nanoclaw-v2-*"],
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().splitlines():
                line = line.strip()
                if not line or line == "n/a":
                    continue
                try:
                    # "Wed 2026-05-06 10:23:45 UTC" → datetime
                    dt = datetime.strptime(line, "%a %Y-%m-%d %H:%M:%S %Z")
                    dt = dt.replace(tzinfo=timezone.utc)
                    return int((datetime.now(timezone.utc) - dt).total_seconds())
                except ValueError:
                    continue
    except Exception:
        pass
    return None


def get_total_messages() -> int:
    """Sum message counts across all session inbound DBs."""
    total = 0
    for _, _, inbound_path, _ in iter_session_db_paths():
        if not inbound_path.exists():
            continue
        try:
            with session_db(inbound_path) as conn:
                row = conn.execute("SELECT COUNT(*) FROM messages_in").fetchone()
                if row:
                    total += row[0]
        except Exception:
            pass
    return total


def get_active_session_count() -> int:
    try:
        with central_db() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM sessions WHERE container_status IN ('running', 'idle')"
            ).fetchone()
            return row[0] if row else 0
    except Exception:
        return 0


def get_metrics() -> dict:
    status = get_nanoclaw_status()
    uptime = get_uptime_seconds()
    total_messages = get_total_messages()
    active_sessions = get_active_session_count()

    return {
        "status": status,
        "uptime_seconds": uptime,
        "total_messages": total_messages,
        "active_sessions": active_sessions,
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
