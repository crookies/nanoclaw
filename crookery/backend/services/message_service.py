import json
from pathlib import Path

from db import central_db, iter_session_db_paths, session_db


def _agent_name_map() -> dict[str, str]:
    try:
        with central_db() as conn:
            rows = conn.execute("SELECT id, name FROM agent_groups").fetchall()
            return {r["id"]: r["name"] for r in rows}
    except Exception:
        return {}


def get_messages(
    agent_id: str | None = None,
    direction: str = "all",
    search: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> dict:
    """Return paginated merged list of inbound + outbound messages."""
    name_map = _agent_name_map()
    messages: list[dict] = []

    for ag_id, sess_id, inbound_path, outbound_path in iter_session_db_paths():
        if agent_id and ag_id != agent_id:
            continue
        agent_name = name_map.get(ag_id, ag_id)

        if direction in ("all", "in") and inbound_path.exists():
            messages.extend(_read_inbound(inbound_path, ag_id, agent_name, sess_id, search))

        if direction in ("all", "out") and outbound_path.exists():
            messages.extend(_read_outbound(outbound_path, ag_id, agent_name, sess_id, search))

    messages.sort(key=lambda m: (m.get("timestamp") or "").replace(" ", "T"), reverse=True)

    total = len(messages)
    offset = (page - 1) * limit
    page_items = messages[offset: offset + limit]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, (total + limit - 1) // limit),
        "items": page_items,
    }


def get_message_by_id(message_id: str) -> dict | None:
    """Find a message by id across all session DBs."""
    for ag_id, sess_id, inbound_path, outbound_path in iter_session_db_paths():
        for path, direction in [(inbound_path, "in"), (outbound_path, "out")]:
            if not path.exists():
                continue
            try:
                with session_db(path) as conn:
                    table = "messages_in" if direction == "in" else "messages_out"
                    row = conn.execute(
                        f"SELECT * FROM {table} WHERE id = ?", (message_id,)
                    ).fetchone()
                    if row:
                        return _row_to_dict(dict(row), direction, ag_id, sess_id)
            except Exception:
                pass
    return None


def _read_inbound(
    path: Path, ag_id: str, agent_name: str, sess_id: str, search: str | None
) -> list[dict]:
    results = []
    try:
        with session_db(path) as conn:
            sql = "SELECT * FROM messages_in ORDER BY seq DESC LIMIT 500"
            rows = conn.execute(sql).fetchall()
            for row in rows:
                d = _row_to_dict(dict(row), "in", ag_id, sess_id)
                d["agent_name"] = agent_name
                if search and not _matches(d, search):
                    continue
                results.append(d)
    except Exception:
        pass
    return results


def _read_outbound(
    path: Path, ag_id: str, agent_name: str, sess_id: str, search: str | None
) -> list[dict]:
    results = []
    try:
        with session_db(path) as conn:
            sql = "SELECT * FROM messages_out ORDER BY seq DESC LIMIT 500"
            rows = conn.execute(sql).fetchall()
            for row in rows:
                d = _row_to_dict(dict(row), "out", ag_id, sess_id)
                d["agent_name"] = agent_name
                if search and not _matches(d, search):
                    continue
                results.append(d)
    except Exception:
        pass
    return results


def _row_to_dict(row: dict, direction: str, ag_id: str, sess_id: str) -> dict:
    content_raw = row.get("content")
    content_parsed = None
    content_preview = None
    if content_raw:
        try:
            content_parsed = json.loads(content_raw)
            # Extract a short preview text
            if isinstance(content_parsed, dict):
                content_preview = (
                    content_parsed.get("text")
                    or content_parsed.get("message")
                    or content_parsed.get("action")
                    or str(content_parsed)[:120]
                )
            else:
                content_preview = str(content_parsed)[:120]
        except Exception:
            content_preview = str(content_raw)[:120]

    return {
        "id": row.get("id"),
        "seq": row.get("seq"),
        "direction": direction,
        "agent_group_id": ag_id,
        "session_id": sess_id,
        "kind": row.get("kind"),
        "timestamp": row.get("timestamp"),
        "status": row.get("status"),
        "platform_id": row.get("platform_id"),
        "channel_type": row.get("channel_type"),
        "thread_id": row.get("thread_id"),
        "tries": row.get("tries"),
        "series_id": row.get("series_id"),
        "in_reply_to": row.get("in_reply_to"),
        "content_preview": content_preview,
        "content": content_parsed or content_raw,
    }


def _matches(msg: dict, search: str) -> bool:
    search_lower = search.lower()
    for field in ("kind", "platform_id", "channel_type", "content_preview", "agent_name"):
        val = msg.get(field)
        if val and search_lower in str(val).lower():
            return True
    return False
