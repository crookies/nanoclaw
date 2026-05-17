from db import central_db, iter_session_db_paths, session_db


def get_agents() -> list[dict]:
    """Return agent groups with session stats and message counts."""
    try:
        with central_db() as conn:
            rows = conn.execute(
                """
                SELECT
                    ag.id,
                    ag.name,
                    ag.agent_provider,
                    ag.created_at,
                    COUNT(s.id) AS session_count,
                    SUM(CASE WHEN s.container_status IN ('running', 'idle') THEN 1 ELSE 0 END) AS active_sessions,
                    MAX(s.last_active) AS last_active,
                    -- Aggregate container statuses to derive a single agent status
                    GROUP_CONCAT(s.container_status) AS container_statuses
                FROM agent_groups ag
                LEFT JOIN sessions s ON s.agent_group_id = ag.id
                GROUP BY ag.id
                ORDER BY ag.name
                """
            ).fetchall()
    except Exception:
        return []

    agents: dict[str, dict] = {}
    for row in rows:
        agent_id = row["id"]
        statuses = (row["container_statuses"] or "").split(",")
        status = _derive_status(statuses, row["active_sessions"] or 0)
        agents[agent_id] = {
            "id": agent_id,
            "name": row["name"],
            "agent_provider": row["agent_provider"],
            "created_at": row["created_at"],
            "session_count": row["session_count"] or 0,
            "active_sessions": row["active_sessions"] or 0,
            "last_active": row["last_active"],
            "status": status,
            "messages_in": 0,
            "messages_out": 0,
        }

    # Count messages per agent group across all session DBs
    for ag_id, _sess_id, inbound_path, outbound_path in iter_session_db_paths():
        if ag_id not in agents:
            continue
        if inbound_path.exists():
            try:
                with session_db(inbound_path) as conn:
                    row = conn.execute("SELECT COUNT(*) FROM messages_in").fetchone()
                    if row:
                        agents[ag_id]["messages_in"] += row[0]
            except Exception:
                pass
        if outbound_path.exists():
            try:
                with session_db(outbound_path) as conn:
                    row = conn.execute("SELECT COUNT(*) FROM messages_out").fetchone()
                    if row:
                        agents[ag_id]["messages_out"] += row[0]
            except Exception:
                pass

    return list(agents.values())


def _derive_status(statuses: list[str], active: int) -> str:
    if active > 0:
        if "running" in statuses:
            return "running"
        return "idle"
    if any(s in ("stopped", "idle") for s in statuses if s):
        return "inactive"
    return "inactive"
