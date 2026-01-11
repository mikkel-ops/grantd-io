from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select

from src.dependencies import CurrentOrgId, DbSession
from src.models.database import (
    Changeset,
    Connection,
    PlatformGrant,
    PlatformRole,
    PlatformUser,
    RoleAssignment,
)
from src.models.schemas import (
    PlatformGrantResponse,
    PlatformRoleResponse,
    PlatformUserResponse,
    RoleAssignmentResponse,
)


class StatsResponse(BaseModel):
    """Response schema for dashboard stats."""
    connections: int
    users: int
    roles: int
    grants: int
    pending_changesets: int

router = APIRouter(prefix="/objects")


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Get dashboard stats for the organization."""
    # Get connection IDs for this org
    connection_ids = db.execute(
        select(Connection.id).where(Connection.org_id == UUID(org_id))
    ).scalars().all()

    connections_count = len(connection_ids)

    if not connection_ids:
        return StatsResponse(
            connections=0,
            users=0,
            roles=0,
            grants=0,
            pending_changesets=0,
        )

    # Count users across all connections
    users_count = db.execute(
        select(func.count(PlatformUser.id)).where(
            PlatformUser.connection_id.in_(connection_ids)
        )
    ).scalar() or 0

    # Count roles across all connections
    roles_count = db.execute(
        select(func.count(PlatformRole.id)).where(
            PlatformRole.connection_id.in_(connection_ids)
        )
    ).scalar() or 0

    # Count grants across all connections
    grants_count = db.execute(
        select(func.count(PlatformGrant.id)).where(
            PlatformGrant.connection_id.in_(connection_ids)
        )
    ).scalar() or 0

    # Count pending changesets
    pending_changesets = db.execute(
        select(func.count(Changeset.id)).where(
            Changeset.org_id == UUID(org_id),
            Changeset.status.in_(["draft", "pending_review"]),
        )
    ).scalar() or 0

    return StatsResponse(
        connections=connections_count,
        users=users_count,
        roles=roles_count,
        grants=grants_count,
        pending_changesets=pending_changesets,
    )


def verify_connection_access(db, connection_id: UUID, org_id: str) -> Connection:
    """Verify the connection exists and belongs to the org."""
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

    return connection


@router.get("/users", response_model=list[PlatformUserResponse])
async def list_users(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
    search: str = Query(None, description="Search by name or email"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    """List all users for a connection."""
    verify_connection_access(db, connection_id, org_id)

    query = select(PlatformUser).where(PlatformUser.connection_id == connection_id)

    if search:
        query = query.where(
            PlatformUser.name.ilike(f"%{search}%")
            | PlatformUser.email.ilike(f"%{search}%")
        )

    users = db.execute(
        query.order_by(PlatformUser.name).limit(limit).offset(offset)
    ).scalars().all()

    return users


@router.get("/roles", response_model=list[PlatformRoleResponse])
async def list_roles(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
    search: str = Query(None, description="Search by name"),
    include_system: bool = Query(True, description="Include system roles"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    """List all roles for a connection."""
    verify_connection_access(db, connection_id, org_id)

    query = select(PlatformRole).where(PlatformRole.connection_id == connection_id)

    if search:
        query = query.where(PlatformRole.name.ilike(f"%{search}%"))

    if not include_system:
        query = query.where(PlatformRole.is_system == False)

    roles = db.execute(
        query.order_by(PlatformRole.name).limit(limit).offset(offset)
    ).scalars().all()

    return roles


@router.get("/roles/{role_name}/assignments", response_model=list[RoleAssignmentResponse])
async def get_role_assignments(
    role_name: str,
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Get all assignments for a specific role."""
    verify_connection_access(db, connection_id, org_id)

    assignments = db.execute(
        select(RoleAssignment).where(
            RoleAssignment.connection_id == connection_id,
            RoleAssignment.role_name == role_name,
        )
    ).scalars().all()

    return assignments


@router.get("/grants", response_model=list[PlatformGrantResponse])
async def list_grants(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
    grantee_name: str = Query(None, description="Filter by grantee"),
    object_type: str = Query(None, description="Filter by object type"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    """List all grants for a connection."""
    verify_connection_access(db, connection_id, org_id)

    query = select(PlatformGrant).where(PlatformGrant.connection_id == connection_id)

    if grantee_name:
        query = query.where(PlatformGrant.grantee_name == grantee_name)

    if object_type:
        query = query.where(PlatformGrant.object_type == object_type)

    grants = db.execute(query.limit(limit).offset(offset)).scalars().all()

    return grants
