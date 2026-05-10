"""Delivery service — reads messages_out from outbound.db + delivered from inbound.db."""
import json
from pathlib import Path

from config import settings
from db import session_db


def _inbound_path(ag_id: str, sess_id: str) -> Path:
    return settings.sessions_dir / ag_id / sess_id / "inbound.db"


def _outbound_path(ag_id: str, sess_id: str) -> Path:
    return settings.sessions_dir / ag_id / sess_id / "outbound.db"


def _preview(content_raw: str | None) -> str | None:
    if not content_raw:
        return None
    try:
        parsed = json.loads(content_raw)
        if isinstance(parsed, dict):
            return str(parsed.get("text") or parsed.get("body") or "")[:120] or None
    except Exception:
        pass
    return content_raw[:120]


def get_delivery(agent_group_id: str, session_id: str) -> dict:
    outbound = _outbound_path(agent_group_id, session_id)
    inbound = _inbound_path(agent_group_id, session_id)

    messages_out: list[dict] = []
    delivered_map: dict[str, dict] = {}

    if outbound.exists():
        try:
            with session_db(outbound) as conn:
                rows = conn.execute(
                    """
                    SELECT id, seq, in_reply_to, timestamp, deliver_after,
                           kind, platform_id, channel_type, thread_id, content
                    FROM messages_out
                    ORDER BY seq DESC
                    """
                ).fetchall()
                for row in rows:
                    try:
                        content_parsed = json.loads(row["content"]) if row["content"] else None
                    except Exception:
                        content_parsed = row["content"]
                    messages_out.append(
                        {
                            "id": row["id"],
                            "seq": row["seq"],
                            "in_reply_to": row["in_reply_to"],
                            "timestamp": row["timestamp"],
                            "deliver_after": row["deliver_after"],
                            "kind": row["kind"],
                            "platform_id": row["platform_id"],
                            "channel_type": row["channel_type"],
                            "thread_id": row["thread_id"],
                            "content_preview": _preview(row["content"]),
                            "content": content_parsed,
                            "delivery_status": "pending",
                            "platform_message_id": None,
                            "delivered_at": None,
                        }
                    )
        except Exception:
            pass

    if inbound.exists():
        try:
            with session_db(inbound) as conn:
                rows = conn.execute(
                    "SELECT message_out_id, platform_message_id, status, delivered_at FROM delivered"
                ).fetchall()
                for row in rows:
                    delivered_map[row["message_out_id"]] = {
                        "platform_message_id": row["platform_message_id"],
                        "status": row["status"],
                        "delivered_at": row["delivered_at"],
                    }
        except Exception:
            pass

    # Merge delivery info
    delivered_count = 0
    failed_count = 0
    pending_count = 0
    for msg in messages_out:
        d = delivered_map.get(msg["id"])
        if d:
            msg["delivery_status"] = d["status"] or "delivered"
            msg["platform_message_id"] = d["platform_message_id"]
            msg["delivered_at"] = d["delivered_at"]
            if d["status"] == "failed":
                failed_count += 1
            else:
                delivered_count += 1
        else:
            pending_count += 1

    return {
        "summary": {
            "delivered": delivered_count,
            "failed": failed_count,
            "pending": pending_count,
        },
        "messages": messages_out,
    }
