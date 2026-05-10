"""Queue service — reads messages_in from inbound.db + blockages from v2.db."""
import json
from pathlib import Path

from config import settings
from db import central_db, session_db


def _inbound_path(ag_id: str, sess_id: str) -> Path:
    return settings.sessions_dir / ag_id / sess_id / "inbound.db"


def _parse_content(raw: str | None) -> dict | str | None:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return raw


def get_queue(agent_group_id: str, session_id: str) -> dict:
    inbound = _inbound_path(agent_group_id, session_id)
    messages: list[dict] = []
    summary = {"pending": 0, "processing": 0, "completed": 0, "failed": 0}

    if inbound.exists():
        try:
            with session_db(inbound) as conn:
                rows = conn.execute(
                    """
                    SELECT id, seq, kind, timestamp, status, process_after,
                           recurrence, series_id, tries, trigger,
                           platform_id, channel_type, thread_id, content
                    FROM messages_in
                    ORDER BY seq DESC
                    """
                ).fetchall()
                for row in rows:
                    s = row["status"] or "pending"
                    if s in summary:
                        summary[s] += 1
                    parsed = _parse_content(row["content"])
                    preview: str | None = None
                    if isinstance(parsed, dict):
                        preview = str(parsed.get("text") or parsed.get("body") or "")[:120] or None
                    elif isinstance(parsed, str):
                        preview = parsed[:120]
                    messages.append(
                        {
                            "id": row["id"],
                            "seq": row["seq"],
                            "kind": row["kind"],
                            "timestamp": row["timestamp"],
                            "status": s,
                            "process_after": row["process_after"],
                            "recurrence": row["recurrence"],
                            "series_id": row["series_id"],
                            "tries": row["tries"],
                            "trigger": row["trigger"],
                            "platform_id": row["platform_id"],
                            "channel_type": row["channel_type"],
                            "thread_id": row["thread_id"],
                            "content_preview": preview,
                            "content": parsed,
                        }
                    )
        except Exception:
            pass

    # Blockages from central DB
    blockages: dict = {"approvals": [], "questions": []}
    try:
        with central_db() as conn:
            approvals = conn.execute(
                """
                SELECT approval_id, title, created_at, expires_at, status, action
                FROM pending_approvals
                WHERE session_id=? AND status='pending'
                ORDER BY created_at ASC
                """,
                (session_id,),
            ).fetchall()
            blockages["approvals"] = [dict(r) for r in approvals]

            questions = conn.execute(
                """
                SELECT question_id, title, created_at, options_json
                FROM pending_questions
                WHERE session_id=?
                ORDER BY created_at ASC
                """,
                (session_id,),
            ).fetchall()
            blockages["questions"] = [dict(r) for r in questions]
    except Exception:
        pass

    return {
        "summary": summary,
        "messages": messages,
        "blockages": blockages,
    }
