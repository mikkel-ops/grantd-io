from enum import Enum
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, distinct

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


class PlatformWarehouseResponse(BaseModel):
    """Response for platform warehouse data."""
    name: str
    connection_id: str
    grant_count: int
    roles_with_access: list[str]
    privileges: list[str]


# ============================================================================
# Role Details Models (for enhanced Roles page)
# ============================================================================

class RoleType(str, Enum):
    """Inferred role type based on configuration patterns."""
    FUNCTIONAL = "functional"
    BUSINESS = "business"
    HYBRID = "hybrid"


class RoleHierarchyNode(BaseModel):
    """A role in the hierarchy tree."""
    name: str
    is_system: bool = False


class RoleAccessSummaryCompact(BaseModel):
    """Compact access summary for role cards."""
    databases: list[str]  # First 3 database names for chips
    total_databases: int
    total_schemas: int
    total_privileges: int


class RoleDetailResponse(BaseModel):
    """Detailed information for a single role - loaded on expand."""
    role_name: str
    role_type: RoleType
    role_type_reason: str  # Human-readable explanation

    # Hierarchy
    parent_roles: list[RoleHierarchyNode]  # Roles this role inherits FROM
    child_roles: list[RoleHierarchyNode]   # Roles that inherit FROM this role

    # Access summary
    access_summary: RoleAccessSummaryCompact

    # Full access map (forward reference to DatabaseAccessDetail defined later)
    access_map: list["DatabaseAccessDetail"]

    # Counts for display
    user_assignment_count: int
    role_assignment_count: int  # Roles assigned to this role (as child)


def infer_role_type(
    has_data_grants: bool,
    user_assignment_count: int,
    parent_role_count: int,
) -> tuple[RoleType, str]:
    """
    Infer role type based on configuration patterns.

    Returns (role_type, reason_string)
    """
    # Functional: Has direct DB/schema/table grants, no user assignments
    is_functional_pattern = has_data_grants and user_assignment_count == 0

    # Business: Inherits from roles, assigned to users, no direct data grants
    is_business_pattern = parent_role_count > 0 and user_assignment_count > 0 and not has_data_grants

    if is_functional_pattern and not is_business_pattern:
        return (
            RoleType.FUNCTIONAL,
            "Direct data grants, no user assignments"
        )
    elif is_business_pattern and not is_functional_pattern:
        return (
            RoleType.BUSINESS,
            f"Inherits from {parent_role_count} role(s), assigned to {user_assignment_count} user(s)"
        )
    elif has_data_grants and (user_assignment_count > 0 or parent_role_count > 0):
        return (
            RoleType.HYBRID,
            "Mix of direct grants and role inheritance/user assignments"
        )
    else:
        # Default to business if no clear pattern (no grants, just a container role)
        return (RoleType.BUSINESS, "No direct data grants")


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


@router.get("/role-assignments", response_model=list[RoleAssignmentResponse])
async def list_all_role_assignments(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
    limit: int = Query(1000, le=5000),
):
    """Get all role assignments for a connection."""
    verify_connection_access(db, connection_id, org_id)

    assignments = db.execute(
        select(RoleAssignment)
        .where(RoleAssignment.connection_id == connection_id)
        .limit(limit)
    ).scalars().all()

    return assignments


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


@router.get("/roles/{role_name}/details", response_model=RoleDetailResponse)
async def get_role_details(
    role_name: str,
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """
    Get detailed information for a specific role including:
    - Inferred role type (functional/business/hybrid)
    - Role hierarchy (parents and children)
    - Access summary and full access map

    This is designed to be called on-demand when a user expands a role card.
    """
    verify_connection_access(db, connection_id, org_id)

    # 1. Get the role to verify it exists
    role = db.execute(
        select(PlatformRole).where(
            PlatformRole.connection_id == connection_id,
            PlatformRole.name == role_name,
        )
    ).scalar_one_or_none()

    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    # 2. Get all role assignments to build hierarchy
    all_assignments = db.execute(
        select(RoleAssignment).where(RoleAssignment.connection_id == connection_id)
    ).scalars().all()

    # 3. Get all roles for is_system lookup
    all_roles = db.execute(
        select(PlatformRole).where(PlatformRole.connection_id == connection_id)
    ).scalars().all()
    role_info = {r.name: r for r in all_roles}

    # 4. Build parent roles (roles this role inherits FROM)
    # When assignee_type="ROLE" and assignee_name=our_role, role_name is what we inherit from
    parent_roles = []
    for assignment in all_assignments:
        if (assignment.assignee_type.upper() == "ROLE" and
            assignment.assignee_name.upper() == role_name.upper()):
            parent_info = role_info.get(assignment.role_name)
            parent_roles.append(RoleHierarchyNode(
                name=assignment.role_name,
                is_system=parent_info.is_system if parent_info else False,
            ))

    # 5. Build child roles (roles that inherit FROM this role)
    # When role_name=our_role and assignee_type="ROLE", assignee_name is a child
    child_roles = []
    for assignment in all_assignments:
        if (assignment.role_name.upper() == role_name.upper() and
            assignment.assignee_type.upper() == "ROLE"):
            child_info = role_info.get(assignment.assignee_name)
            child_roles.append(RoleHierarchyNode(
                name=assignment.assignee_name,
                is_system=child_info.is_system if child_info else False,
            ))

    # 6. Count user assignments
    user_assignment_count = sum(
        1 for a in all_assignments
        if a.role_name.upper() == role_name.upper() and a.assignee_type.upper() == "USER"
    )

    # 7. Get grants and build access map
    grants = db.execute(
        select(PlatformGrant).where(
            PlatformGrant.connection_id == connection_id,
            PlatformGrant.grantee_name == role_name,
            PlatformGrant.grantee_type == "ROLE",
        )
    ).scalars().all()

    # Build access map structure
    unique_dbs: set[str] = set()
    unique_schemas: set[str] = set()
    has_data_grants = False
    access_data: dict[str, dict] = {}

    for grant in grants:
        obj_type = grant.object_type.upper() if grant.object_type else ""
        db_name = grant.object_database
        schema_name = grant.object_schema
        privilege = grant.privilege

        # Skip warehouse grants for access map (they don't represent data access)
        if obj_type == "WAREHOUSE":
            continue

        if db_name:
            unique_dbs.add(db_name)
            has_data_grants = True

            if db_name not in access_data:
                access_data[db_name] = {"privileges": set(), "schemas": {}}

            if obj_type == "DATABASE":
                access_data[db_name]["privileges"].add(privilege)

            if schema_name:
                unique_schemas.add(f"{db_name}.{schema_name}")
                if schema_name not in access_data[db_name]["schemas"]:
                    access_data[db_name]["schemas"][schema_name] = {
                        "privileges": set(),
                        "tables": 0,
                        "views": 0,
                    }
                if obj_type == "SCHEMA":
                    access_data[db_name]["schemas"][schema_name]["privileges"].add(privilege)
                elif obj_type == "TABLE":
                    access_data[db_name]["schemas"][schema_name]["tables"] += 1
                elif obj_type == "VIEW":
                    access_data[db_name]["schemas"][schema_name]["views"] += 1

    # Convert to response format (using forward-referenced models)
    # Import here to avoid circular reference issues
    from src.routers.objects import SchemaAccessDetail, DatabaseAccessDetail

    access_map = []
    for db_name in sorted(access_data.keys()):
        db_info = access_data[db_name]
        schemas_list = []
        for schema_name in sorted(db_info["schemas"].keys()):
            schema_info = db_info["schemas"][schema_name]
            schemas_list.append(SchemaAccessDetail(
                name=schema_name,
                table_count=schema_info["tables"],
                view_count=schema_info["views"],
                privileges=sorted(list(schema_info["privileges"])),
            ))
        access_map.append(DatabaseAccessDetail(
            name=db_name,
            privileges=sorted(list(db_info["privileges"])),
            schemas=schemas_list,
        ))

    # 8. Infer role type
    role_type, reason = infer_role_type(
        has_data_grants=has_data_grants,
        user_assignment_count=user_assignment_count,
        parent_role_count=len(parent_roles),
    )

    # 9. Build compact access summary (first 3 DBs)
    sorted_dbs = sorted(list(unique_dbs))
    access_summary = RoleAccessSummaryCompact(
        databases=sorted_dbs[:3],
        total_databases=len(unique_dbs),
        total_schemas=len(unique_schemas),
        total_privileges=len(grants),
    )

    return RoleDetailResponse(
        role_name=role_name,
        role_type=role_type,
        role_type_reason=reason,
        parent_roles=parent_roles,
        child_roles=child_roles,
        access_summary=access_summary,
        access_map=access_map,
        user_assignment_count=user_assignment_count,
        role_assignment_count=len(child_roles),
    )


class PlatformDatabaseResponse(BaseModel):
    """Response for a database object."""
    name: str
    schema_count: int
    is_imported: bool = False


@router.get("/databases", response_model=list[PlatformDatabaseResponse])
async def list_databases(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """List all unique databases for a connection with schema counts."""
    verify_connection_access(db, connection_id, org_id)

    # Get unique databases from grants
    db_query = db.execute(
        select(distinct(PlatformGrant.object_database))
        .where(
            PlatformGrant.connection_id == connection_id,
            PlatformGrant.object_database.isnot(None),
        )
    ).scalars().all()

    # Get schema counts per database
    databases = []
    for db_name in sorted(db_query):
        if not db_name:
            continue

        # Count unique schemas
        schema_count = db.execute(
            select(func.count(distinct(PlatformGrant.object_schema)))
            .where(
                PlatformGrant.connection_id == connection_id,
                PlatformGrant.object_database == db_name,
                PlatformGrant.object_schema.isnot(None),
            )
        ).scalar() or 0

        # Check if imported
        is_imported = db_name.upper() in ("SNOWFLAKE_SAMPLE_DATA", "SNOWFLAKE")

        databases.append(PlatformDatabaseResponse(
            name=db_name,
            schema_count=schema_count,
            is_imported=is_imported,
        ))

    return databases


class SchemaResponse(BaseModel):
    name: str
    full_name: str


@router.get("/databases/{database_name}/schemas", response_model=list[SchemaResponse])
async def list_database_schemas(
    database_name: str,
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """List all schemas for a specific database."""
    verify_connection_access(db, connection_id, org_id)

    # Get unique schemas for this database from grants
    schema_query = db.execute(
        select(distinct(PlatformGrant.object_schema))
        .where(
            PlatformGrant.connection_id == connection_id,
            PlatformGrant.object_database.ilike(database_name),
            PlatformGrant.object_schema.isnot(None),
        )
    ).scalars().all()

    schemas = []
    for schema_name in sorted(schema_query):
        if schema_name:
            schemas.append(SchemaResponse(
                name=schema_name,
                full_name=f"{database_name}.{schema_name}",
            ))

    return schemas


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


@router.get("/warehouses", response_model=list[PlatformWarehouseResponse])
async def list_warehouses(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
    search: str = Query(None, description="Search by name"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    """List all warehouses for a connection with their grant information."""
    verify_connection_access(db, connection_id, org_id)

    # Get all warehouse grants
    query = select(PlatformGrant).where(
        PlatformGrant.connection_id == connection_id,
        PlatformGrant.object_type == "WAREHOUSE",
    )

    if search:
        query = query.where(PlatformGrant.object_name.ilike(f"%{search}%"))

    grants = db.execute(query).scalars().all()

    # Group grants by warehouse name
    warehouses_data: dict[str, dict] = {}
    for grant in grants:
        wh_name = grant.object_name
        if not wh_name:
            continue

        if wh_name not in warehouses_data:
            warehouses_data[wh_name] = {
                "name": wh_name,
                "connection_id": str(connection_id),
                "roles_with_access": set(),
                "privileges": set(),
            }

        warehouses_data[wh_name]["roles_with_access"].add(grant.grantee_name)
        warehouses_data[wh_name]["privileges"].add(grant.privilege)

    # Convert to response format
    warehouses = []
    for wh_name in sorted(warehouses_data.keys()):
        data = warehouses_data[wh_name]
        warehouses.append(PlatformWarehouseResponse(
            name=data["name"],
            connection_id=data["connection_id"],
            grant_count=len(data["roles_with_access"]) * len(data["privileges"]),
            roles_with_access=sorted(list(data["roles_with_access"])),
            privileges=sorted(list(data["privileges"])),
        ))

    # Apply pagination
    start = offset
    end = offset + limit
    return warehouses[start:end]


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


# ============================================================================
# ROLE DESIGNER ENDPOINTS
# ============================================================================


class DatabaseInfo(BaseModel):
    """Database info for privilege selection."""
    name: str
    schemas: list[str]
    is_imported: bool = False  # True for shared/imported databases


class SchemaAccessDetail(BaseModel):
    """Detailed access within a schema for access map visualization."""
    name: str
    table_count: int
    view_count: int
    privileges: list[str]  # e.g., ["SELECT", "USAGE"]


class DatabaseAccessDetail(BaseModel):
    """Detailed access within a database for access map visualization."""
    name: str
    privileges: list[str]  # Database-level privileges
    schemas: list[SchemaAccessDetail]


class RoleAccessSummary(BaseModel):
    """Summary of what a role can access - for inheritance preview."""
    role_name: str
    description: str | None = None
    is_system: bool = False  # True for system roles like ACCOUNTADMIN, SYSADMIN, etc.
    database_count: int
    schema_count: int
    table_count: int
    view_count: int
    privilege_count: int
    # Detailed breakdown for expanded view
    databases: list[str]  # List of database names
    sample_privileges: list[str]  # First few privileges as examples
    # Detailed access map data
    access_map: list[DatabaseAccessDetail] = []


class RoleDesignerData(BaseModel):
    """Data for the role designer UI."""
    databases: list[DatabaseInfo]
    warehouses: list[str] = []  # List of warehouse names
    roles: list[str]
    users: list[str]
    role_summaries: dict[str, RoleAccessSummary] = {}  # role_name -> summary
    # Service account info - these should be filtered out from role inheritance/assignment
    service_user: str | None = None  # The Snowflake user Grantd connects as
    service_role: str | None = None  # The role Grantd uses (default: GRANTD_READONLY)


class PrivilegeSpec(BaseModel):
    """A privilege specification for role design."""
    privilege: str
    object_type: str
    object_name: str
    is_imported_database: bool = False


class RoleDesignRequest(BaseModel):
    """Request to create a new role design."""
    role_name: str
    description: str | None = None
    inherit_from_roles: list[str] = []
    privileges: list[PrivilegeSpec] = []
    assign_to_users: list[str] = []
    assign_to_roles: list[str] = []
    # Edit mode fields - original state for diff calculation
    is_edit_mode: bool = False
    original_inherited_roles: list[str] = []
    original_privileges: list[PrivilegeSpec] = []
    original_assigned_users: list[str] = []
    original_assigned_roles: list[str] = []


class SqlPreviewResponse(BaseModel):
    """SQL preview for role design."""
    statements: list[str]
    summary: str


@router.get("/role-designer/data", response_model=RoleDesignerData)
async def get_role_designer_data(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Get data needed for the role designer (databases, schemas, existing roles, users)."""
    connection = verify_connection_access(db, connection_id, org_id)

    # Extract service account info from connection config
    conn_config = connection.connection_config or {}
    service_user = conn_config.get("username")
    # Default role is GRANTD_READONLY if not specified
    service_role = conn_config.get("role", "GRANTD_READONLY")

    # Get unique databases from grants
    db_query = db.execute(
        select(distinct(PlatformGrant.object_database))
        .where(
            PlatformGrant.connection_id == connection_id,
            PlatformGrant.object_database.isnot(None),
        )
    ).scalars().all()

    # Check for imported databases by looking for IMPORTED PRIVILEGES grants
    imported_dbs_query = db.execute(
        select(distinct(PlatformGrant.object_database))
        .where(
            PlatformGrant.connection_id == connection_id,
            PlatformGrant.privilege == "IMPORTED PRIVILEGES",
        )
    ).scalars().all()
    imported_db_names = set(imported_dbs_query)

    # Get schemas for each database
    databases = []
    for db_name in sorted(db_query):
        if db_name:
            schema_query = db.execute(
                select(distinct(PlatformGrant.object_schema))
                .where(
                    PlatformGrant.connection_id == connection_id,
                    PlatformGrant.object_database == db_name,
                    PlatformGrant.object_schema.isnot(None),
                )
            ).scalars().all()

            # Check if this is an imported/shared database
            # Detection: has IMPORTED PRIVILEGES grant, or known Snowflake sample data
            is_imported = (
                db_name in imported_db_names
                or db_name.upper() in ("SNOWFLAKE_SAMPLE_DATA", "SNOWFLAKE")
            )

            databases.append(DatabaseInfo(
                name=db_name,
                schemas=sorted([s for s in schema_query if s]),
                is_imported=is_imported,
            ))

    # Get existing roles
    roles = db.execute(
        select(PlatformRole.name)
        .where(PlatformRole.connection_id == connection_id)
        .order_by(PlatformRole.name)
    ).scalars().all()

    # Get existing users
    users = db.execute(
        select(PlatformUser.name)
        .where(PlatformUser.connection_id == connection_id)
        .order_by(PlatformUser.name)
    ).scalars().all()

    # Get warehouses from grants (warehouses appear as grantable objects)
    warehouse_names = db.execute(
        select(PlatformGrant.object_name)
        .where(
            PlatformGrant.connection_id == connection_id,
            PlatformGrant.object_type == "WAREHOUSE",
        )
        .distinct()
        .order_by(PlatformGrant.object_name)
    ).scalars().all()
    warehouses = sorted([w for w in warehouse_names if w])

    # Build role summaries for inheritance preview
    role_summaries: dict[str, RoleAccessSummary] = {}

    # Get all roles with their metadata
    all_roles = db.execute(
        select(PlatformRole)
        .where(PlatformRole.connection_id == connection_id)
    ).scalars().all()
    role_info = {r.name: r for r in all_roles}

    # Get all grants grouped by role
    all_grants = db.execute(
        select(PlatformGrant)
        .where(
            PlatformGrant.connection_id == connection_id,
            PlatformGrant.grantee_type == "ROLE",
        )
    ).scalars().all()

    # Group grants by grantee (role name)
    grants_by_role: dict[str, list] = {}
    for grant in all_grants:
        if grant.grantee_name not in grants_by_role:
            grants_by_role[grant.grantee_name] = []
        grants_by_role[grant.grantee_name].append(grant)

    # Build summary for each role
    for role_name in roles:
        role_grants = grants_by_role.get(role_name, [])

        # Count unique databases, schemas, tables, views
        unique_dbs = set()
        unique_schemas = set()
        table_count = 0
        view_count = 0
        sample_privs = []

        # Build access map structure: {db_name: {privileges: set, schemas: {schema_name: {privileges: set, tables: int, views: int}}}}
        access_data: dict[str, dict] = {}

        for grant in role_grants:
            db_name = grant.object_database
            schema_name = grant.object_schema
            obj_type = grant.object_type.upper() if grant.object_type else ""
            privilege = grant.privilege

            if db_name:
                unique_dbs.add(db_name)

                # Initialize db entry
                if db_name not in access_data:
                    access_data[db_name] = {"privileges": set(), "schemas": {}}

                # Database-level privilege
                if obj_type == "DATABASE":
                    access_data[db_name]["privileges"].add(privilege)

                # Schema-level access
                if schema_name:
                    unique_schemas.add(f"{db_name}.{schema_name}")

                    # Initialize schema entry
                    if schema_name not in access_data[db_name]["schemas"]:
                        access_data[db_name]["schemas"][schema_name] = {
                            "privileges": set(),
                            "tables": 0,
                            "views": 0,
                        }

                    if obj_type == "SCHEMA":
                        access_data[db_name]["schemas"][schema_name]["privileges"].add(privilege)
                    elif obj_type == "TABLE":
                        access_data[db_name]["schemas"][schema_name]["tables"] += 1
                        table_count += 1
                    elif obj_type == "VIEW":
                        access_data[db_name]["schemas"][schema_name]["views"] += 1
                        view_count += 1

            # Build sample privilege strings (first 5)
            if len(sample_privs) < 5:
                priv_str = privilege
                if obj_type:
                    obj_name = grant.object_name or schema_name or db_name or ""
                    priv_str = f"{privilege} on {obj_type} {obj_name}"
                sample_privs.append(priv_str)

        # Convert access_data to access_map format
        access_map = []
        for db_name in sorted(access_data.keys()):
            db_info = access_data[db_name]
            schemas_list = []
            for schema_name in sorted(db_info["schemas"].keys()):
                schema_info = db_info["schemas"][schema_name]
                schemas_list.append(SchemaAccessDetail(
                    name=schema_name,
                    table_count=schema_info["tables"],
                    view_count=schema_info["views"],
                    privileges=sorted(list(schema_info["privileges"])),
                ))
            access_map.append(DatabaseAccessDetail(
                name=db_name,
                privileges=sorted(list(db_info["privileges"])),
                schemas=schemas_list,
            ))

        # Get role description and is_system flag
        role_data = role_info.get(role_name)
        description = None
        is_system = False
        if role_data:
            is_system = role_data.is_system or False
            if role_data.platform_data and isinstance(role_data.platform_data, dict):
                description = role_data.platform_data.get("comment") or role_data.platform_data.get("description")

        role_summaries[role_name] = RoleAccessSummary(
            role_name=role_name,
            description=description,
            is_system=is_system,
            database_count=len(unique_dbs),
            schema_count=len(unique_schemas),
            table_count=table_count,
            view_count=view_count,
            privilege_count=len(role_grants),
            databases=sorted(list(unique_dbs)),
            sample_privileges=sample_privs,
            access_map=access_map,
        )

    return RoleDesignerData(
        databases=databases,
        warehouses=warehouses,
        roles=list(roles),
        users=list(users),
        role_summaries=role_summaries,
        service_user=service_user,
        service_role=service_role,
    )


class RolePrivilegesResponse(BaseModel):
    """Response with a role's current privileges and assignments."""
    role_name: str
    description: str | None = None
    inherited_roles: list[str]  # Roles this role inherits from (has been granted)
    privileges: list[PrivilegeSpec]
    assigned_to_users: list[str]  # Users who have this role
    assigned_to_roles: list[str]  # Roles this role is granted to (parent roles)


@router.get("/roles/{role_name}/privileges", response_model=RolePrivilegesResponse)
async def get_role_privileges(
    role_name: str,
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Get a role's current privileges, inherited roles, and assignments for editing."""
    verify_connection_access(db, connection_id, org_id)

    # Get the role details
    role = db.execute(
        select(PlatformRole).where(
            PlatformRole.connection_id == connection_id,
            PlatformRole.name == role_name,
        )
    ).scalar_one_or_none()

    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    # Get roles that this role inherits from (roles granted TO this role)
    inherited_roles_query = db.execute(
        select(RoleAssignment.role_name).where(
            RoleAssignment.connection_id == connection_id,
            RoleAssignment.assignee_type == "ROLE",
            RoleAssignment.assignee_name == role_name,
        )
    ).scalars().all()

    # Get users who have this role
    assigned_users_query = db.execute(
        select(RoleAssignment.assignee_name).where(
            RoleAssignment.connection_id == connection_id,
            RoleAssignment.role_name == role_name,
            RoleAssignment.assignee_type == "USER",
        )
    ).scalars().all()

    # Get roles this role is granted to (parent roles in hierarchy)
    assigned_roles_query = db.execute(
        select(RoleAssignment.assignee_name).where(
            RoleAssignment.connection_id == connection_id,
            RoleAssignment.role_name == role_name,
            RoleAssignment.assignee_type == "ROLE",
        )
    ).scalars().all()

    # Get direct grants for this role
    grants = db.execute(
        select(PlatformGrant).where(
            PlatformGrant.connection_id == connection_id,
            PlatformGrant.grantee_name == role_name,
            PlatformGrant.grantee_type == "ROLE",
        )
    ).scalars().all()

    # Check for imported databases
    imported_dbs_query = db.execute(
        select(distinct(PlatformGrant.object_database))
        .where(
            PlatformGrant.connection_id == connection_id,
            PlatformGrant.privilege == "IMPORTED PRIVILEGES",
        )
    ).scalars().all()
    imported_db_names = set(imported_dbs_query)

    # Convert grants to PrivilegeSpec format
    privileges = []
    for grant in grants:
        # Determine object type and name
        obj_type = grant.object_type.upper() if grant.object_type else ""

        # Build object name based on type
        if obj_type == "DATABASE":
            obj_name = grant.object_database or grant.object_name or ""
        elif obj_type == "SCHEMA":
            obj_name = f"{grant.object_database}.{grant.object_schema}" if grant.object_database and grant.object_schema else grant.object_name or ""
        elif obj_type in ("TABLE", "VIEW"):
            if grant.object_database and grant.object_schema and grant.object_name:
                obj_name = f"{grant.object_database}.{grant.object_schema}.{grant.object_name}"
            else:
                obj_name = grant.object_name or ""
        else:
            obj_name = grant.object_name or ""

        # Check if this is an imported database privilege
        is_imported = bool(
            (obj_type == "DATABASE" and grant.privilege == "IMPORTED PRIVILEGES")
            or grant.object_database in imported_db_names
            or (grant.object_database and grant.object_database.upper() in ("SNOWFLAKE_SAMPLE_DATA", "SNOWFLAKE"))
        )

        privileges.append(PrivilegeSpec(
            privilege=grant.privilege,
            object_type=obj_type,
            object_name=obj_name,
            is_imported_database=is_imported,
        ))

    # Get description from platform_data if available
    description = None
    if role.platform_data and isinstance(role.platform_data, dict):
        description = role.platform_data.get("comment") or role.platform_data.get("description")

    return RolePrivilegesResponse(
        role_name=role_name,
        description=description,
        inherited_roles=list(inherited_roles_query),
        privileges=privileges,
        assigned_to_users=list(assigned_users_query),
        assigned_to_roles=list(assigned_roles_query),
    )


@router.post("/role-designer/preview", response_model=SqlPreviewResponse)
async def preview_role_sql(
    design: RoleDesignRequest,
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Generate SQL preview for a role design."""
    verify_connection_access(db, connection_id, org_id)

    statements = []

    if design.is_edit_mode:
        # EDIT MODE: Generate diff-based SQL (grants and revokes)

        # Helper to create privilege key for comparison
        def priv_key(p: PrivilegeSpec) -> str:
            return f"{p.privilege}|{p.object_type}|{p.object_name}"

        original_inherited_set = set(design.original_inherited_roles)
        new_inherited_set = set(design.inherit_from_roles)
        original_priv_set = {priv_key(p) for p in design.original_privileges}
        new_priv_set = {priv_key(p) for p in design.privileges}
        original_user_set = set(design.original_assigned_users)
        new_user_set = set(design.assign_to_users)
        original_role_set = set(design.original_assigned_roles)
        new_role_set = set(design.assign_to_roles)

        grants_count = 0
        revokes_count = 0

        # Inherited roles to grant
        for parent_role in design.inherit_from_roles:
            if parent_role not in original_inherited_set:
                statements.append(f"GRANT ROLE {parent_role} TO ROLE {design.role_name};")
                grants_count += 1

        # Inherited roles to revoke
        for parent_role in design.original_inherited_roles:
            if parent_role not in new_inherited_set:
                statements.append(f"REVOKE ROLE {parent_role} FROM ROLE {design.role_name};")
                revokes_count += 1

        # Privileges to grant
        for priv in design.privileges:
            if priv_key(priv) not in original_priv_set:
                if priv.is_imported_database and priv.object_type.upper() == "DATABASE":
                    statements.append(
                        f"GRANT IMPORTED PRIVILEGES ON DATABASE {priv.object_name} TO ROLE {design.role_name};"
                    )
                else:
                    statements.append(
                        f"GRANT {priv.privilege} ON {priv.object_type} {priv.object_name} TO ROLE {design.role_name};"
                    )
                grants_count += 1

        # Privileges to revoke
        for priv in design.original_privileges:
            if priv_key(priv) not in new_priv_set:
                if priv.is_imported_database and priv.object_type.upper() == "DATABASE":
                    statements.append(
                        f"REVOKE IMPORTED PRIVILEGES ON DATABASE {priv.object_name} FROM ROLE {design.role_name};"
                    )
                else:
                    statements.append(
                        f"REVOKE {priv.privilege} ON {priv.object_type} {priv.object_name} FROM ROLE {design.role_name};"
                    )
                revokes_count += 1

        # User assignments to grant
        for user in design.assign_to_users:
            if user not in original_user_set:
                statements.append(f"GRANT ROLE {design.role_name} TO USER {user};")
                grants_count += 1

        # User assignments to revoke
        for user in design.original_assigned_users:
            if user not in new_user_set:
                statements.append(f"REVOKE ROLE {design.role_name} FROM USER {user};")
                revokes_count += 1

        # Role assignments to grant
        for role in design.assign_to_roles:
            if role not in original_role_set:
                statements.append(f"GRANT ROLE {design.role_name} TO ROLE {role};")
                grants_count += 1

        # Role assignments to revoke
        for role in design.original_assigned_roles:
            if role not in new_role_set:
                statements.append(f"REVOKE ROLE {design.role_name} FROM ROLE {role};")
                revokes_count += 1

        if not statements:
            statements.append(f"-- No changes to role {design.role_name}")

        summary = f"Modifies role {design.role_name}"
        parts = []
        if grants_count > 0:
            parts.append(f"{grants_count} grant(s)")
        if revokes_count > 0:
            parts.append(f"{revokes_count} revoke(s)")
        if parts:
            summary += f" with {' and '.join(parts)}"
        else:
            summary = f"No changes to role {design.role_name}"

    else:
        # CREATE MODE: Generate all grants

        # 1. Create the role
        comment = design.description or ""
        create_sql = f"CREATE ROLE IF NOT EXISTS {design.role_name}"
        if comment:
            create_sql += f" COMMENT = '{comment}'"
        create_sql += ";"
        statements.append(create_sql)

        # 2. Grant inherited roles to the new role
        for parent_role in design.inherit_from_roles:
            statements.append(f"GRANT ROLE {parent_role} TO ROLE {design.role_name};")

        # 3. Grant privileges
        for priv in design.privileges:
            # For imported databases, use IMPORTED PRIVILEGES syntax
            if priv.is_imported_database and priv.object_type.upper() == "DATABASE":
                statements.append(
                    f"GRANT IMPORTED PRIVILEGES ON DATABASE {priv.object_name} TO ROLE {design.role_name};"
                )
            else:
                statements.append(
                    f"GRANT {priv.privilege} ON {priv.object_type} {priv.object_name} TO ROLE {design.role_name};"
                )

        # 4. Assign role to users
        for user in design.assign_to_users:
            statements.append(f"GRANT ROLE {design.role_name} TO USER {user};")

        # 5. Assign role to other roles
        for role in design.assign_to_roles:
            statements.append(f"GRANT ROLE {design.role_name} TO ROLE {role};")

        summary = f"Creates role {design.role_name}"
        if design.inherit_from_roles:
            summary += f" inheriting from {len(design.inherit_from_roles)} role(s)"
        if design.privileges:
            summary += f" with {len(design.privileges)} privilege(s)"
        if design.assign_to_users:
            summary += f", assigned to {len(design.assign_to_users)} user(s)"

    return SqlPreviewResponse(statements=statements, summary=summary)


# ============================================================================
# Warehouse Designer
# ============================================================================

class WarehouseDesignRequest(BaseModel):
    """Request for warehouse design (create or alter)."""
    warehouse_name: str
    warehouse_size: str = "XSMALL"  # XSMALL, SMALL, MEDIUM, LARGE, etc.
    auto_suspend: int = 300  # seconds
    auto_resume: bool = True
    initially_suspended: bool = True
    comment: str = ""
    # For edit mode
    is_edit_mode: bool = False
    original_size: str | None = None
    original_auto_suspend: int | None = None
    original_auto_resume: bool | None = None


@router.post("/warehouse-designer/preview", response_model=SqlPreviewResponse)
async def preview_warehouse_sql(
    design: WarehouseDesignRequest,
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Generate SQL preview for a warehouse design."""
    verify_connection_access(db, connection_id, org_id)

    statements = []

    if design.is_edit_mode:
        # ALTER WAREHOUSE mode
        changes = []

        if design.original_size and design.warehouse_size != design.original_size:
            changes.append(f"WAREHOUSE_SIZE = {design.warehouse_size}")

        if design.original_auto_suspend is not None and design.auto_suspend != design.original_auto_suspend:
            changes.append(f"AUTO_SUSPEND = {design.auto_suspend}")

        if design.original_auto_resume is not None and design.auto_resume != design.original_auto_resume:
            changes.append(f"AUTO_RESUME = {str(design.auto_resume).upper()}")

        if changes:
            statements.append(
                f"ALTER WAREHOUSE {design.warehouse_name} SET {', '.join(changes)};"
            )
            summary = f"Alters warehouse {design.warehouse_name} with {len(changes)} change(s)"
        else:
            statements.append(f"-- No changes to warehouse {design.warehouse_name}")
            summary = f"No changes to warehouse {design.warehouse_name}"
    else:
        # CREATE WAREHOUSE mode
        create_sql = f"""CREATE WAREHOUSE IF NOT EXISTS {design.warehouse_name}
    WITH WAREHOUSE_SIZE = {design.warehouse_size}
    AUTO_SUSPEND = {design.auto_suspend}
    AUTO_RESUME = {str(design.auto_resume).upper()}
    INITIALLY_SUSPENDED = {str(design.initially_suspended).upper()}"""

        if design.comment:
            create_sql += f"\n    COMMENT = '{design.comment}'"

        create_sql += ";"
        statements.append(create_sql)
        summary = f"Creates warehouse {design.warehouse_name} (size: {design.warehouse_size})"

    return SqlPreviewResponse(statements=statements, summary=summary)


# ============================================================================
# User Designer
# ============================================================================

class UserDesignRequest(BaseModel):
    """Request for user design (create or alter)."""
    user_name: str
    login_name: str | None = None
    display_name: str | None = None
    email: str | None = None
    default_role: str | None = None
    default_warehouse: str | None = None
    must_change_password: bool = True
    disabled: bool = False
    comment: str = ""
    # Roles to assign to the user
    roles: list[str] = []
    # For edit mode
    is_edit_mode: bool = False
    original_display_name: str | None = None
    original_email: str | None = None
    original_default_role: str | None = None
    original_default_warehouse: str | None = None
    original_disabled: bool | None = None
    original_roles: list[str] = []


@router.post("/user-designer/preview", response_model=SqlPreviewResponse)
async def preview_user_sql(
    design: UserDesignRequest,
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Generate SQL preview for a user design."""
    verify_connection_access(db, connection_id, org_id)

    statements = []

    if design.is_edit_mode:
        # ALTER USER mode
        changes = []

        if design.original_display_name is not None and design.display_name != design.original_display_name:
            if design.display_name:
                changes.append(f"DISPLAY_NAME = '{design.display_name}'")

        if design.original_email is not None and design.email != design.original_email:
            if design.email:
                changes.append(f"EMAIL = '{design.email}'")

        if design.original_default_role is not None and design.default_role != design.original_default_role:
            if design.default_role:
                changes.append(f"DEFAULT_ROLE = {design.default_role}")

        if design.original_default_warehouse is not None and design.default_warehouse != design.original_default_warehouse:
            if design.default_warehouse:
                changes.append(f"DEFAULT_WAREHOUSE = {design.default_warehouse}")

        if design.original_disabled is not None and design.disabled != design.original_disabled:
            changes.append(f"DISABLED = {str(design.disabled).upper()}")

        if changes:
            statements.append(
                f"ALTER USER {design.user_name} SET {', '.join(changes)};"
            )

        # Handle role changes
        original_role_set = set(design.original_roles)
        new_role_set = set(design.roles)

        grants_count = 0
        revokes_count = 0

        # Roles to grant
        for role in design.roles:
            if role not in original_role_set:
                statements.append(f"GRANT ROLE {role} TO USER {design.user_name};")
                grants_count += 1

        # Roles to revoke
        for role in design.original_roles:
            if role not in new_role_set:
                statements.append(f"REVOKE ROLE {role} FROM USER {design.user_name};")
                revokes_count += 1

        if not statements:
            statements.append(f"-- No changes to user {design.user_name}")
            summary = f"No changes to user {design.user_name}"
        else:
            summary = f"Modifies user {design.user_name}"
            parts = []
            if changes:
                parts.append(f"{len(changes)} property change(s)")
            if grants_count > 0:
                parts.append(f"{grants_count} role grant(s)")
            if revokes_count > 0:
                parts.append(f"{revokes_count} role revoke(s)")
            if parts:
                summary += f" with {', '.join(parts)}"

    else:
        # CREATE USER mode
        create_parts = [f"CREATE USER IF NOT EXISTS {design.user_name}"]

        if design.login_name:
            create_parts.append(f"LOGIN_NAME = '{design.login_name}'")
        if design.display_name:
            create_parts.append(f"DISPLAY_NAME = '{design.display_name}'")
        if design.email:
            create_parts.append(f"EMAIL = '{design.email}'")
        if design.default_role:
            create_parts.append(f"DEFAULT_ROLE = {design.default_role}")
        if design.default_warehouse:
            create_parts.append(f"DEFAULT_WAREHOUSE = {design.default_warehouse}")

        create_parts.append(f"MUST_CHANGE_PASSWORD = {str(design.must_change_password).upper()}")
        create_parts.append(f"DISABLED = {str(design.disabled).upper()}")

        if design.comment:
            create_parts.append(f"COMMENT = '{design.comment}'")

        statements.append("\n    ".join(create_parts) + ";")

        # Grant roles to the new user
        for role in design.roles:
            statements.append(f"GRANT ROLE {role} TO USER {design.user_name};")

        summary = f"Creates user {design.user_name}"
        if design.roles:
            summary += f" with {len(design.roles)} role(s)"

    return SqlPreviewResponse(statements=statements, summary=summary)


@router.get("/user-designer/data")
async def get_user_designer_data(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
    user_name: str | None = Query(None, description="User name to edit"),
):
    """Get data needed for the user designer (roles, warehouses, and optionally user details)."""
    connection = verify_connection_access(db, connection_id, org_id)

    # Get available roles
    roles_query = db.execute(
        select(PlatformRole.name).where(
            PlatformRole.connection_id == connection_id,
        )
    ).scalars().all()
    roles = sorted(set(roles_query))

    # Get warehouses
    wh_query = db.execute(
        select(distinct(PlatformGrant.object_name)).where(
            PlatformGrant.connection_id == connection_id,
            PlatformGrant.object_type == "WAREHOUSE",
        )
    ).scalars().all()
    warehouses = sorted([w for w in wh_query if w])

    # Get service account info
    conn_config = connection.connection_config or {}
    service_user = conn_config.get("username")
    service_role = conn_config.get("role", "GRANTD_READONLY")

    result = {
        "roles": roles,
        "warehouses": warehouses,
        "service_user": service_user,
        "service_role": service_role,
    }

    # If editing a user, get their current data
    if user_name:
        user = db.execute(
            select(PlatformUser).where(
                PlatformUser.connection_id == connection_id,
                PlatformUser.name == user_name,
            )
        ).scalar_one_or_none()

        if user:
            # Get user's current roles
            user_roles = db.execute(
                select(RoleAssignment.role_name).where(
                    RoleAssignment.connection_id == connection_id,
                    RoleAssignment.assignee_name == user_name,
                    RoleAssignment.assignee_type == "USER",
                )
            ).scalars().all()

            platform_data = user.platform_data or {}
            result["user"] = {
                "name": user.name,
                "email": user.email,
                "display_name": user.display_name,
                "disabled": user.disabled,
                "default_role": platform_data.get("default_role"),
                "default_warehouse": platform_data.get("default_warehouse"),
                "roles": list(user_roles),
            }

    return result


@router.get("/warehouse-designer/data")
async def get_warehouse_designer_data(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
    warehouse_name: str | None = Query(None, description="Warehouse name to edit"),
):
    """Get data needed for the warehouse designer."""
    verify_connection_access(db, connection_id, org_id)

    result: dict = {}

    # If editing a warehouse, get its current data from grants
    if warehouse_name:
        grants = db.execute(
            select(PlatformGrant).where(
                PlatformGrant.connection_id == connection_id,
                PlatformGrant.object_type == "WAREHOUSE",
                PlatformGrant.object_name == warehouse_name,
            )
        ).scalars().all()

        if grants:
            result["warehouse"] = {
                "name": warehouse_name,
                "roles_with_access": list(set(g.grantee_name for g in grants)),
                "privileges": list(set(g.privilege for g in grants)),
            }

    return result
