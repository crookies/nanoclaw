from fastapi import APIRouter
from services.metrics_service import get_metrics

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("")
def metrics():
    return get_metrics()
