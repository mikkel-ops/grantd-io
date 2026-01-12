from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from src.dependencies import CurrentOrgId, CurrentUser, DbSession
from src.models.database import Change, Changeset, Connection
from src.models.schemas import ChangesetCreate, ChangesetResponse
from src.services.sql_generator import generate_sql_for_change

router = APIRouter(prefix="/changesets")


@router.get("", response_model=list[ChangesetResponse])
async def list_changesets(
    org_id: CurrentOrgId,
    db: DbSession,
    connection_id: UUID = Query(None),
    status_filter: str = Query(None, alias="status"),
    limit: int = Query(50, le=100),
    offset: int = Query(0),
):
    """List changesets for the organization."""
    query = select(Changeset).where(Changeset.org_id == UUID(org_id))

    if connection_id:
        query = query.where(Changeset.connection_id == connection_id)

    if status_filter:
        query = query.where(Changeset.status == status_filter)

    changesets = db.execute(
        query.order_by(Changeset.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all()

    return changesets


@router.post("", response_model=ChangesetResponse, status_code=status.HTTP_201_CREATED)
async def create_changeset(
    changeset: ChangesetCreate,
    org_id: CurrentOrgId,
    user: CurrentUser,
    db: DbSession,
):
    """Create a new changeset."""
    # Verify connection belongs to org
    connection = db.execute(
        select(Connection).where(
            Connection.id == changeset.connection_id,
            Connection.org_id == UUID(org_id),
        )
    ).scalar_one_or_none()

    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connection not found",
        )

    # Create changeset
    db_changeset = Changeset(
        org_id=UUID(org_id),
        connection_id=changeset.connection_id,
        title=changeset.title,
        description=changeset.description,
        created_by=user.get("email"),
        changes_count=len(changeset.changes),
        sql_statements_count=len(changeset.changes),
    )
    db.add(db_changeset)
    db.flush()

    # Create changes with generated SQL
    for idx, change in enumerate(changeset.changes):
        sql = generate_sql_for_change(
            platform=connection.platform,
            change_type=change.change_type,
            object_type=change.object_type,
            object_name=change.object_name,
            details=change.details,
        )

        db_change = Change(
            changeset_id=db_changeset.id,
            change_type=change.change_type,
            object_type=change.object_type,
            object_name=change.object_name,
            details=change.details,
            sql_statement=sql,
            execution_order=idx + 1,
        )
        db.add(db_change)

    db.commit()
    db.refresh(db_changeset)

    return db_changeset


@router.get("/{changeset_id}", response_model=ChangesetResponse)
async def get_changeset(
    changeset_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Get a specific changeset with its changes."""
    changeset = db.execute(
        select(Changeset).where(
            Changeset.id == changeset_id,
            Changeset.org_id == UUID(org_id),
        )
    ).scalar_one_or_none()

    if not changeset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Changeset not found",
        )

    # Load changes
    changes = db.execute(
        select(Change)
        .where(Change.changeset_id == changeset_id)
        .order_by(Change.execution_order)
    ).scalars().all()

    changeset.changes = changes

    return changeset


@router.post("/{changeset_id}/approve")
async def approve_changeset(
    changeset_id: UUID,
    org_id: CurrentOrgId,
    user: CurrentUser,
    db: DbSession,
):
    """Approve a changeset for application."""
    changeset = db.execute(
        select(Changeset).where(
            Changeset.id == changeset_id,
            Changeset.org_id == UUID(org_id),
        )
    ).scalar_one_or_none()

    if not changeset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Changeset not found",
        )

    if changeset.status != "draft" and changeset.status != "pending_review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve changeset in status: {changeset.status}",
        )

    from datetime import datetime

    changeset.status = "approved"
    changeset.reviewed_by = user.get("email")
    changeset.reviewed_at = datetime.utcnow()

    db.commit()

    return {"status": "approved"}


@router.post("/{changeset_id}/mark-applied")
async def mark_changeset_applied(
    changeset_id: UUID,
    org_id: CurrentOrgId,
    user: CurrentUser,
    db: DbSession,
    applied_via: str = Query("cli"),
):
    """Mark a changeset as applied (called after CLI execution)."""
    changeset = db.execute(
        select(Changeset).where(
            Changeset.id == changeset_id,
            Changeset.org_id == UUID(org_id),
        )
    ).scalar_one_or_none()

    if not changeset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Changeset not found",
        )

    from datetime import datetime

    changeset.status = "applied"
    changeset.applied_at = datetime.utcnow()
    changeset.applied_by_username = user.get("email")
    changeset.applied_via = applied_via

    db.commit()

    return {"status": "applied"}


@router.post("/{changeset_id}/request-review")
async def request_changeset_review(
    changeset_id: UUID,
    org_id: CurrentOrgId,
    user: CurrentUser,
    db: DbSession,
):
    """Request review for a changeset."""
    changeset = db.execute(
        select(Changeset).where(
            Changeset.id == changeset_id,
            Changeset.org_id == UUID(org_id),
        )
    ).scalar_one_or_none()

    if not changeset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Changeset not found",
        )

    if changeset.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot request review for changeset in status: {changeset.status}",
        )

    changeset.status = "pending_review"
    db.commit()

    return {"status": "pending_review"}


@router.delete("/{changeset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_changeset(
    changeset_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Delete a changeset."""
    changeset = db.execute(
        select(Changeset).where(
            Changeset.id == changeset_id,
            Changeset.org_id == UUID(org_id),
        )
    ).scalar_one_or_none()

    if not changeset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Changeset not found",
        )

    if changeset.status not in ["draft", "pending_review"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete changeset in status: {changeset.status}",
        )

    # Delete associated changes first
    db.execute(
        select(Change).where(Change.changeset_id == changeset_id)
    )
    from sqlalchemy import delete
    db.execute(delete(Change).where(Change.changeset_id == changeset_id))
    db.delete(changeset)
    db.commit()

    return None
