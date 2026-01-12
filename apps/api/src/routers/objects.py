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


class RoleWithPath(BaseModel):
    """A role with its full inheritance path."""
    name: str
    granted_via: str  # Full path like "ANALYST → DATA_VIEWER"
    is_inherited: bool
    is_system: bool | None = False


class PrivilegeGrant(BaseModel):
    """A privilege with the role path that grants it."""
    privilege: str
    granted_via: str  # Full path like "ANALYST → DATA_VIEWER"


class TableAccess(BaseModel):
    """Access to a table or view."""
    name: str
    privilege: str
    granted_via: str


class SchemaAccess(BaseModel):
    """Access within a schema."""
    name: str
    privileges: list[PrivilegeGrant]
    tables: list[TableAccess]
    views: list[TableAccess]


class DatabaseAccess(BaseModel):
    """Access within a database."""
    name: str
    privileges: list[PrivilegeGrant]
    schemas: dict[str, SchemaAccess]


class AccessSummary(BaseModel):
    """Summary counts for user access."""
    total_databases: int
    total_schemas: int
    total_tables: int
    total_views: int


class UserAccessResponse(BaseModel):
    """Complete access picture for a user."""
    user: str
    email: str | None
    display_name: str | None
    disabled: bool | None = False
    roles: list[RoleWithPath]
    role_count: int
    databases: list[DatabaseAccess]
    summary: AccessSummary

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


@router.get("/users/{user_name}/access", response_model=UserAccessResponse)
async def get_user_access(
    user_name: str,
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Get the complete access picture for a user including inherited roles and all grants."""
    verify_connection_access(db, connection_id, org_id)

    # Get the user
    user = db.execute(
        select(PlatformUser).where(
            PlatformUser.connection_id == connection_id,
            PlatformUser.name == user_name,
        )
    ).scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Get all role assignments for this connection
    all_assignments = db.execute(
        select(RoleAssignment).where(RoleAssignment.connection_id == connection_id)
    ).scalars().all()

    # Get all roles for this connection (to check is_system)
    all_roles = db.execute(
        select(PlatformRole).where(PlatformRole.connection_id == connection_id)
    ).scalars().all()
    role_info = {r.name: r for r in all_roles}

    # Get direct roles for the user
    user_direct_roles = [
        a.role_name for a in all_assignments
        if a.assignee_type == "USER" and a.assignee_name == user_name
    ]

    # Build role inheritance graph: role -> list of child roles it grants access to
    role_children: dict[str, list[str]] = {}
    for assignment in all_assignments:
        if assignment.assignee_type == "ROLE":
            if assignment.role_name not in role_children:
                role_children[assignment.role_name] = []
            role_children[assignment.role_name].append(assignment.assignee_name)

    # Traverse role inheritance to get all roles with their full paths
    roles_with_paths: list[RoleWithPath] = []
    # Map from role name to the path that grants it (for use in grant attribution)
    role_to_path: dict[str, str] = {}
    visited_roles: set[str] = set()

    def traverse_roles(role_name: str, path: list[str]):
        if role_name in visited_roles:
            return
        visited_roles.add(role_name)

        current_path = path + [role_name]
        path_str = " → ".join(current_path)
        role_to_path[role_name] = path_str

        role_data = role_info.get(role_name)
        roles_with_paths.append(RoleWithPath(
            name=role_name,
            granted_via=path_str,
            is_inherited=len(path) > 0,
            is_system=role_data.is_system if role_data else False,
        ))

        # Traverse child roles
        for child_role in role_children.get(role_name, []):
            traverse_roles(child_role, current_path)

    # Start traversal from user's direct roles
    for role_name in user_direct_roles:
        traverse_roles(role_name, [])

    # Get all role names the user has access to
    all_user_roles = list(role_to_path.keys())

    # Get all grants for these roles
    if all_user_roles:
        grants = db.execute(
            select(PlatformGrant).where(
                PlatformGrant.connection_id == connection_id,
                PlatformGrant.grantee_name.in_(all_user_roles),
                PlatformGrant.grantee_type == "ROLE",
            )
        ).scalars().all()
    else:
        grants = []

    # Organize grants by database -> schema -> objects
    # Structure: {db_name: {privileges: [], schemas: {schema_name: {privileges: [], tables: [], views: []}}}}
    db_data: dict[str, dict] = {}
    total_tables = 0
    total_views = 0

    for grant in grants:
        db_name = grant.object_database or "ACCOUNT"
        schema_name = grant.object_schema
        obj_type = grant.object_type.upper() if grant.object_type else ""
        obj_name = grant.object_name
        privilege = grant.privilege
        granted_via = role_to_path.get(grant.grantee_name, grant.grantee_name)

        # Initialize database entry
        if db_name not in db_data:
            db_data[db_name] = {"privileges": [], "schemas": {}}

        # Handle database-level privileges
        if obj_type == "DATABASE":
            db_data[db_name]["privileges"].append(
                PrivilegeGrant(privilege=privilege, granted_via=granted_via)
            )
        # Handle account-level objects (WAREHOUSE, ROLE, USER, INTEGRATION, etc.)
        elif obj_type in ("WAREHOUSE", "ROLE", "USER", "INTEGRATION", "NOTIFICATION_INTEGRATION",
                          "SECURITY_INTEGRATION", "STORAGE_INTEGRATION", "RESOURCE_MONITOR",
                          "ACCOUNT", "NETWORK_POLICY", "SHARE"):
            # Show as account-level privilege with object info
            priv_display = f"{privilege} on {obj_type} {obj_name}" if obj_name else f"{privilege} on {obj_type}"
            db_data["ACCOUNT"]["privileges"].append(
                PrivilegeGrant(privilege=priv_display, granted_via=granted_via)
            )
        # Handle schema-level privileges
        elif obj_type == "SCHEMA" and schema_name:
            if schema_name not in db_data[db_name]["schemas"]:
                db_data[db_name]["schemas"][schema_name] = {
                    "privileges": [], "tables": [], "views": []
                }
            db_data[db_name]["schemas"][schema_name]["privileges"].append(
                PrivilegeGrant(privilege=privilege, granted_via=granted_via)
            )
        # Handle table/view objects
        elif obj_type in ("TABLE", "VIEW") and schema_name and obj_name:
            if schema_name not in db_data[db_name]["schemas"]:
                db_data[db_name]["schemas"][schema_name] = {
                    "privileges": [], "tables": [], "views": []
                }
            target_list = "tables" if obj_type == "TABLE" else "views"
            db_data[db_name]["schemas"][schema_name][target_list].append(
                TableAccess(name=obj_name, privilege=privilege, granted_via=granted_via)
            )
        # Handle other object types (put in schema if available)
        elif schema_name:
            if schema_name not in db_data[db_name]["schemas"]:
                db_data[db_name]["schemas"][schema_name] = {
                    "privileges": [], "tables": [], "views": []
                }
            # Treat other objects as tables for display
            db_data[db_name]["schemas"][schema_name]["tables"].append(
                TableAccess(
                    name=f"{obj_name or 'ALL'} ({obj_type})",
                    privilege=privilege,
                    granted_via=granted_via
                )
            )
        # Handle grants without database/schema (put under ACCOUNT)
        elif not schema_name and obj_name:
            priv_display = f"{privilege} on {obj_type} {obj_name}" if obj_type else f"{privilege} on {obj_name}"
            db_data["ACCOUNT"]["privileges"].append(
                PrivilegeGrant(privilege=priv_display, granted_via=granted_via)
            )

    # Convert to response format
    databases: list[DatabaseAccess] = []
    total_schemas = 0

    for db_name in sorted(db_data.keys()):
        data = db_data[db_name]
        schemas_dict: dict[str, SchemaAccess] = {}

        for schema_name in sorted(data["schemas"].keys()):
            schema_data = data["schemas"][schema_name]
            schemas_dict[schema_name] = SchemaAccess(
                name=schema_name,
                privileges=schema_data["privileges"],
                tables=schema_data["tables"],
                views=schema_data["views"],
            )
            total_tables += len(schema_data["tables"])
            total_views += len(schema_data["views"])

        databases.append(DatabaseAccess(
            name=db_name,
            privileges=data["privileges"],
            schemas=schemas_dict,
        ))
        total_schemas += len(schemas_dict)

    return UserAccessResponse(
        user=user.name,
        email=user.email,
        display_name=user.display_name,
        disabled=user.disabled,
        roles=roles_with_paths,
        role_count=len(roles_with_paths),
        databases=databases,
        summary=AccessSummary(
            total_databases=len(databases),
            total_schemas=total_schemas,
            total_tables=total_tables,
            total_views=total_views,
        ),
    )
