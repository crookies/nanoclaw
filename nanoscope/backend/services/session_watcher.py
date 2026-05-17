from config import settings


def get_session_file_mtimes() -> dict[tuple[str, str], float]:
    """Return {(ag_id, sess_id): max_mtime} for all session directories."""
    result: dict[tuple[str, str], float] = {}
    sessions_dir = settings.sessions_dir
    if not sessions_dir.exists():
        return result
    for ag_dir in sessions_dir.iterdir():
        if not ag_dir.is_dir() or not ag_dir.name.startswith("ag-"):
            continue
        for sess_dir in ag_dir.iterdir():
            if not sess_dir.is_dir() or not sess_dir.name.startswith("sess-"):
                continue
            mtimes = []
            for fname in ("inbound.db", "outbound.db", ".heartbeat"):
                p = sess_dir / fname
                if p.exists():
                    try:
                        mtimes.append(p.stat().st_mtime)
                    except OSError:
                        pass
            if mtimes:
                result[(ag_dir.name, sess_dir.name)] = max(mtimes)
    return result


def get_jsonl_mtimes() -> dict[str, float]:
    """Return {ag_id: max_jsonl_mtime} by scanning .claude-shared/**/*.jsonl per agent group."""
    result: dict[str, float] = {}
    sessions_dir = settings.sessions_dir
    if not sessions_dir.exists():
        return result
    for ag_dir in sessions_dir.iterdir():
        if not ag_dir.is_dir() or not ag_dir.name.startswith("ag-"):
            continue
        shared = ag_dir / ".claude-shared"
        if not shared.is_dir():
            continue
        for jsonl in shared.rglob("*.jsonl"):
            try:
                mtime = jsonl.stat().st_mtime
                if mtime > result.get(ag_dir.name, 0.0):
                    result[ag_dir.name] = mtime
            except OSError:
                pass
    return result
