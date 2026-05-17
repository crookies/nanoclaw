from fastapi import APIRouter, HTTPException, Query
from services.message_service import get_message_by_id, get_messages

router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.get("")
def messages(
    agent: str | None = Query(None),
    direction: str = Query("all", pattern="^(all|in|out)$"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    return get_messages(agent_id=agent, direction=direction, search=search, page=page, limit=limit)


@router.get("/{message_id}")
def message_detail(message_id: str):
    msg = get_message_by_id(message_id)
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return msg
