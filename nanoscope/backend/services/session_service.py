"""Session list and detail service — reads v2.db + per-session DBs."""
import os
import time
from pathlib import Path

from config import settings
from db import central_db, session_db


def _inbound_path(ag_id: str, sess_id: str) -> Path:
    return settings.sessions_dir / ag_id / sess_id / "inbound.db"


def _outbound_path(ag_id: str, sess_id: str) -> Path:
    return settings.sessions_dir / ag_id / sess_id / "outbound.db"


def _heartbeat_path(ag_id: str, sess_id: str) -> Path:
    return settings.sessions_dir / ag_id / sess_id / ".heartbeat"


def _queue_counts(ag_id: str, sess_id: str) -> dict:
    inbound = _inbound_path(ag_id, sess_id)
    counts = {"pending": 0, "processing": 0, "completed": 0, "failed": 0}
    if not inbound.exists():
        return counts
    try:
        with session_db(inbound) as conn:
            rows = conn.execute(
                "SELECT status, COUNT(*) as n FROM messages_in GROUP BY status"
            ).fetchall()
            for row in rows:
                s = row["status"] or "pending"
                if s in counts:
                    counts[s] = row["n"]
    except Exception:
        pass
    return counts


def _blockage_counts(sess_id: str) -> dict:
    counts = {"approvals_pending": 0, "questions_pending": 0}
    try:
        with central_db() as conn:
            r = conn.execute(
                "SELECT COUNT(*) as n FROM pending_approvals WHERE session_id=? AND status='pending'",
                (sess_id,),
            ).fetchone()
            counts["approvals_pending"] = r["n"] if r else 0
            r = conn.execute(
                "SELECT COUNT(*) as n FROM pending_questions WHERE session_id=?",
                (sess_id,),
            ).fetchone()
            counts["questions_pending"] = r["n"] if r else 0
    except Exception:
        pass
    return counts


def _format_channel_label(channel_type: str | None, platform_id: str | None, mg_name: str | None) -> str:
    if not channel_type:
        return "—"
    parts = [channel_type.capitalize()]
    if mg_name:
        parts.append(mg_name)
    elif platform_id:
        # platform_id is e.g. "telegram:8060390945" or "discord:guild:channel"
        parts.append(platform_id.split(":")[-1])
    return " · ".join(parts)


def get_sessions(agent_group_id: str) -> list[dict]:
    try:
        with central_db() as conn:
            rows = conn.execute(
                """
                SELECT s.id, s.status, s.container_status, s.last_active, s.created_at,
                       mg.channel_type, mg.platform_id, mg.name as mg_name,
                       mga.session_mode
                FROM sessions s
                LEFT JOIN messaging_groups mg ON mg.id = s.messaging_group_id
                LEFT JOIN messaging_group_agents mga
                       ON mga.messaging_group_id = s.messaging_group_id
                      AND mga.agent_group_id = s.agent_group_id
                WHERE s.agent_group_id = ?
                ORDER BY
                    CASE s.container_status WHEN 'running' THEN 0 WHEN 'idle' THEN 1 ELSE 2 END,
                    s.last_active DESC
                """,
                (agent_group_id,),
            ).fetchall()
    except Exception:
        return []

    sessions = []
    for row in rows:
        sess_id = row["id"]
        queue = _queue_counts(agent_group_id, sess_id)
        blockages = _blockage_counts(sess_id)
        sessions.append(
            {
                "id": sess_id,
                "status": row["status"],
                "container_status": row["container_status"] or "stopped",
                "last_active": row["last_active"],
                "created_at": row["created_at"],
                "channel_type": row["channel_type"],
                "platform_id": row["platform_id"],
                "channel_label": _format_channel_label(
                    row["channel_type"], row["platform_id"], row["mg_name"]
                ),
                "session_mode": row["session_mode"],
                "queue": queue,
                "blockages": blockages,
            }
        )
    return sessions


def get_session_detail(agent_group_id: str, session_id: str) -> dict | None:
    try:
        with central_db() as conn:
            row = conn.execute(
                """
                SELECT s.id, s.agent_group_id, s.status, s.container_status,
                       s.last_active, s.created_at,
                       mg.channel_type, mg.platform_id, mg.name as mg_name,
                       mga.session_mode,
                       ag.name as agent_name, ag.folder as agent_folder
                FROM sessions s
                LEFT JOIN messaging_groups mg ON mg.id = s.messaging_group_id
                LEFT JOIN messaging_group_agents mga
                       ON mga.messaging_group_id = s.messaging_group_id
                      AND mga.agent_group_id = s.agent_group_id
                LEFT JOIN agent_groups ag ON ag.id = s.agent_group_id
                WHERE s.id = ? AND s.agent_group_id = ?
                """,
                (session_id, agent_group_id),
            ).fetchone()
    except Exception:
        return None

    if not row:
        return None

    container_status = row["container_status"] or "stopped"
    is_running = container_status in ("running", "idle")

    # Heartbeat
    hb_path = _heartbeat_path(agent_group_id, session_id)
    heartbeat_mtime: str | None = None
    heartbeat_age_s: float | None = None
    try:
        mtime = os.stat(hb_path).st_mtime
        heartbeat_mtime = _mtime_to_iso(mtime)
        heartbeat_age_s = time.time() - mtime
    except FileNotFoundError:
        pass

    # Container state (tool in flight)
    container_state: dict | None = None
    if is_running:
        outbound = _outbound_path(agent_group_id, session_id)
        if outbound.exists():
            try:
                with session_db(outbound) as conn:
                    cs = conn.execute(
                        "SELECT current_tool, tool_declared_timeout_ms, tool_started_at, updated_at FROM container_state WHERE id=1"
                    ).fetchone()
                    if cs:
                        elapsed_s: float | None = None
                        if cs["tool_started_at"] and cs["current_tool"]:
                            try:
                                import datetime
                                started = datetime.datetime.fromisoformat(
                                    cs["tool_started_at"].replace("Z", "+00:00")
                                )
                                elapsed_s = (
                                    datetime.datetime.now(datetime.timezone.utc) - started
                                ).total_seconds()
                            except Exception:
                                pass
                        container_state = {
                            "current_tool": cs["current_tool"],
                            "tool_declared_timeout_ms": cs["tool_declared_timeout_ms"],
                            "tool_started_at": cs["tool_started_at"],
                            "elapsed_s": elapsed_s,
                        }
            except Exception:
                pass

    # Processing claims
    processing_claims: dict | None = None
    if is_running:
        outbound = _outbound_path(agent_group_id, session_id)
        if outbound.exists():
            try:
                with session_db(outbound) as conn:
                    pa = conn.execute(
                        """
                        SELECT COUNT(*) as n, MIN(status_changed) as oldest
                        FROM processing_ack WHERE status='processing'
                        """
                    ).fetchone()
                    if pa:
                        oldest_age_s: float | None = None
                        if pa["oldest"]:
                            try:
                                import datetime
                                t = datetime.datetime.fromisoformat(
                                    pa["oldest"].replace("Z", "+00:00")
                                )
                                oldest_age_s = (
                                    datetime.datetime.now(datetime.timezone.utc) - t
                                ).total_seconds()
                            except Exception:
                                pass
                        processing_claims = {
                            "count": pa["n"],
                            "oldest_age_s": oldest_age_s,
                        }
            except Exception:
                pass

    return {
        "id": row["id"],
        "agent_group_id": row["agent_group_id"],
        "agent_name": row["agent_name"],
        "agent_folder": row["agent_folder"],
        "status": row["status"],
        "container_status": container_status,
        "last_active": row["last_active"],
        "created_at": row["created_at"],
        "channel_type": row["channel_type"],
        "platform_id": row["platform_id"],
        "channel_label": _format_channel_label(
            row["channel_type"], row["platform_id"], row["mg_name"]
        ),
        "session_mode": row["session_mode"],
        "heartbeat_mtime": heartbeat_mtime,
        "heartbeat_age_s": heartbeat_age_s,
        "container_state": container_state,
        "processing_claims": processing_claims,
    }


def _mtime_to_iso(mtime: float) -> str:
    import datetime
    return datetime.datetime.fromtimestamp(mtime, tz=datetime.timezone.utc).isoformat()
