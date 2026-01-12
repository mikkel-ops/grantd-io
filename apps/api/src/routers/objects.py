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


# ============================================================================
# ROLE DESIGNER ENDPOINTS
# ============================================================================


class DatabaseInfo(BaseModel):
    """Database info for privilege selection."""
    name: str
    schemas: list[str]
    is_imported: bool = False  # True for shared/imported databases


class RoleDesignerData(BaseModel):
    """Data for the role designer UI."""
    databases: list[DatabaseInfo]
    roles: list[str]
    users: list[str]


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
    verify_connection_access(db, connection_id, org_id)

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

    return RoleDesignerData(
        databases=databases,
        roles=list(roles),
        users=list(users),
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
        is_imported = (
            obj_type == "DATABASE"
            and grant.privilege == "IMPORTED PRIVILEGES"
        ) or (
            grant.object_database in imported_db_names
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
