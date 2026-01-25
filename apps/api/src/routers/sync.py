from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from sqlalchemy import select

from src.dependencies import CurrentOrgId, CurrentUser, DbSession
from src.models.database import Connection, SyncRun
from src.models.schemas import SyncStatusResponse, SyncTriggerRequest
from src.services.sync.service import run_sync

router = APIRouter(prefix="/sync")


@router.post("/trigger", response_model=SyncStatusResponse)
async def trigger_sync(
    request: SyncTriggerRequest,
    org_id: CurrentOrgId,
    user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """Trigger a sync for a connection."""
    # Verify connection belongs to org
    connection = db.execute(
        select(Connection).where(
            Connection.id == request.connection_id,
            Connection.org_id == UUID(org_id),
        )
    ).scalar_one_or_none()

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found",
        )

    # Create sync run record
    sync_run = SyncRun(
        connection_id=request.connection_id,
        triggered_by=user.get("email"),
    )
    db.add(sync_run)
    db.commit()
    db.refresh(sync_run)

    # Trigger background sync
    background_tasks.add_task(run_sync, str(sync_run.id), str(connection.id))

    return sync_run


@router.get("/status/{connection_id}", response_model=list[SyncStatusResponse])
async def get_sync_status(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
    limit: int = 10,
):
    """Get recent sync runs for a connection."""
    # Verify connection belongs to org
    connection = db.execute(
        select(Connection).where(
            Connection.id == connection_id,
            Connection.org_id == UUID(org_id),
        )
    ).scalar_one_or_none()

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found",
        )

    sync_runs = db.execute(
        select(SyncRun)
        .where(SyncRun.connection_id == connection_id)
        .order_by(SyncRun.started_at.desc())
        .limit(limit)
    ).scalars().all()

    return sync_runs


@router.get("/progress/{connection_id}", response_model=SyncStatusResponse | None)
async def get_sync_progress(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Get the current/latest sync progress for a connection.

    This endpoint is optimized for polling during an active sync.
    Returns the most recent sync run (running or completed).
    """
    # Verify connection belongs to org
    connection = db.execute(
        select(Connection).where(
            Connection.id == connection_id,
            Connection.org_id == UUID(org_id),
        )
    ).scalar_one_or_none()

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found",
        )

    # Get the most recent sync run
    sync_run = db.execute(
        select(SyncRun)
        .where(SyncRun.connection_id == connection_id)
        .order_by(SyncRun.started_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    return sync_run
