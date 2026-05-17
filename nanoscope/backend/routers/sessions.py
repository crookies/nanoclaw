from fastapi import APIRouter, HTTPException, Query

from services.session_service import get_sessions, get_session_detail
from services.queue_service import get_queue
from services.delivery_service import get_delivery
from services.conversation_service import get_conversation
from services.logs_service import get_logs

router = APIRouter(prefix="/api/agents", tags=["sessions"])


@router.get("/{agent_group_id}/sessions")
def list_sessions(agent_group_id: str):
    return get_sessions(agent_group_id)


@router.get("/{agent_group_id}/sessions/{session_id}")
def session_detail(agent_group_id: str, session_id: str):
    detail = get_session_detail(agent_group_id, session_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return detail


@router.get("/{agent_group_id}/sessions/{session_id}/queue")
def session_queue(agent_group_id: str, session_id: str):
    return get_queue(agent_group_id, session_id)


@router.get("/{agent_group_id}/sessions/{session_id}/delivery")
def session_delivery(agent_group_id: str, session_id: str):
    return get_delivery(agent_group_id, session_id)


@router.get("/{agent_group_id}/sessions/{session_id}/conversation")
def session_conversation(agent_group_id: str, session_id: str):
    return get_conversation(agent_group_id, session_id)


@router.get("/{agent_group_id}/sessions/{session_id}/logs")
def session_logs(
    agent_group_id: str,
    session_id: str,
    level: str = Query(default="all"),
    search: str = Query(default=""),
    limit: int = Query(default=200, ge=10, le=1000),
):
    return get_logs(session_id, level=level, search=search, limit=limit)
