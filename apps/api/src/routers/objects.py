from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from src.dependencies import CurrentOrgId, DbSession
from src.models.database import (
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

router = APIRouter(prefix="/objects")


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
