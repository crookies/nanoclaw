from fastapi import APIRouter
from services.agent_service import get_agents

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("")
def agents():
    return get_agents()
