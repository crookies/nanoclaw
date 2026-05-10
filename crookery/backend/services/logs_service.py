"""Logs service — reads nanoclaw.log, filters by sessionId, strips ANSI."""
import re
from pathlib import Path

from config import settings

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
_LINE_RE = re.compile(r"^\[(\d{2}:\d{2}:\d{2}\.\d{3})\]\s+(\w+)\s+(.*)")
_LEVEL_ORDER = {"DEBUG": 0, "INFO": 1, "WARN": 2, "WARNING": 2, "ERROR": 3}
_CONTAINER_PATTERNS = re.compile(r"\[poll-loop\]|\[claude-provider\]|\[container\]")

TAIL_LINES = 50_000


def _tail_file(path: Path, n: int) -> list[str]:
    """Read last n lines of a large file efficiently."""
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            if size == 0:
                return []
            block_size = min(1024 * 256, size)
            buf = b""
            lines_found = 0
            pos = size
            while pos > 0 and lines_found <= n:
                read = min(block_size, pos)
                pos -= read
                f.seek(pos)
                chunk = f.read(read)
                buf = chunk + buf
                lines_found = buf.count(b"\n")
            all_lines = buf.decode("utf-8", errors="replace").splitlines()
            return all_lines[-n:]
    except (OSError, IOError):
        return []


def get_logs(
    session_id: str,
    level: str = "all",
    search: str = "",
    limit: int = 200,
) -> dict:
    log_path = settings.logs_dir / "nanoclaw.log"
    min_level = _LEVEL_ORDER.get(level.upper(), -1)

    raw_lines = _tail_file(log_path, TAIL_LINES)
    results: list[dict] = []

    for raw in raw_lines:
        clean = _ANSI_RE.sub("", raw)
        if session_id not in clean:
            continue

        m = _LINE_RE.match(clean.strip())
        if not m:
            # Include unmatched lines that mention the sessionId
            results.append(
                {
                    "timestamp": None,
                    "level": "DEBUG",
                    "message": clean.strip(),
                    "is_container": bool(_CONTAINER_PATTERNS.search(clean)),
                }
            )
            continue

        ts, lvl, msg = m.group(1), m.group(2).upper(), m.group(3).strip()

        # Normalize WARN/WARNING
        if lvl == "WARNING":
            lvl = "WARN"

        # Level filter
        if min_level >= 0 and _LEVEL_ORDER.get(lvl, 0) < min_level:
            continue

        # Search filter
        if search and search.lower() not in msg.lower():
            continue

        results.append(
            {
                "timestamp": ts,
                "level": lvl,
                "message": msg,
                "is_container": bool(_CONTAINER_PATTERNS.search(msg)),
            }
        )

    # Return most recent `limit` entries (already in order)
    return {
        "session_id": session_id,
        "total_matched": len(results),
        "entries": results[-limit:],
    }
