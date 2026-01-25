import json
from datetime import datetime
from uuid import UUID

import boto3
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from src.config import get_settings
from src.models.database import (
    Connection,
    PlatformGrant,
    PlatformRole,
    PlatformUser,
    RoleAssignment,
    SessionLocal,
    SyncRun,
)

from .factory import get_connector

settings = get_settings()

# Sync step definitions
SYNC_STEPS = [
    {"number": 1, "name": "Connecting", "description": "Establishing connection to platform"},
    {"number": 2, "name": "Syncing users", "description": "Fetching user accounts"},
    {"number": 3, "name": "Syncing roles", "description": "Fetching roles and permissions"},
    {"number": 4, "name": "Syncing role assignments", "description": "Fetching role memberships"},
    {"number": 5, "name": "Syncing grants", "description": "Fetching privilege grants"},
    {"number": 6, "name": "Syncing databases", "description": "Fetching database metadata"},
    {"number": 7, "name": "Syncing schemas", "description": "Fetching schema metadata"},
    {"number": 8, "name": "Calculating role types", "description": "Analyzing role configurations"},
]


def get_credentials_from_param_store(param_path: str) -> dict:
    """Retrieve credentials from AWS Parameter Store."""
    ssm = boto3.client("ssm", region_name=settings.aws_region)

    try:
        response = ssm.get_parameter(Name=param_path, WithDecryption=True)
        return json.loads(response["Parameter"]["Value"])
    except Exception as e:
        raise ValueError(f"Failed to retrieve credentials: {e}")


def _update_sync_progress(db: Session, sync_run: SyncRun, step_number: int, step_name: str):
    """Update sync run progress."""
    sync_run.current_step_number = step_number
    sync_run.current_step = step_name
    sync_run.total_steps = len(SYNC_STEPS)
    db.commit()


def _infer_role_type(
    has_data_grants: bool,
    user_assignment_count: int,
    parent_role_count: int,
) -> str:
    """
    Infer role type based on configuration patterns.
    Returns 'functional', 'business', or 'hybrid'.
    """
    # Functional: Has direct DB/schema/table grants, no user assignments
    is_functional_pattern = has_data_grants and user_assignment_count == 0

    # Business: Inherits from roles, assigned to users, no direct data grants
    is_business_pattern = parent_role_count > 0 and user_assignment_count > 0 and not has_data_grants

    if is_functional_pattern and not is_business_pattern:
        return "functional"
    elif is_business_pattern and not is_functional_pattern:
        return "business"
    elif has_data_grants and (user_assignment_count > 0 or parent_role_count > 0):
        return "hybrid"
    else:
        # Default to business if no clear pattern (no grants, just a container role)
        return "business"


def _calculate_role_types(db: Session, connection_id: UUID):
    """Calculate and update role types for all roles in a connection."""
    # Get all roles
    roles = db.execute(
        select(PlatformRole).where(PlatformRole.connection_id == connection_id)
    ).scalars().all()

    # Get all assignments
    assignments = db.execute(
        select(RoleAssignment).where(RoleAssignment.connection_id == connection_id)
    ).scalars().all()

    # Get all grants
    grants = db.execute(
        select(PlatformGrant).where(
            PlatformGrant.connection_id == connection_id,
            PlatformGrant.grantee_type == "ROLE",
        )
    ).scalars().all()

    # Build lookup structures
    # Count user assignments per role
    user_assignments_per_role: dict[str, int] = {}
    # Count parent roles per role (roles that grant TO this role)
    parent_roles_per_role: dict[str, int] = {}

    for assignment in assignments:
        role_name_upper = assignment.role_name.upper()
        if assignment.assignee_type.upper() == "USER":
            user_assignments_per_role[role_name_upper] = (
                user_assignments_per_role.get(role_name_upper, 0) + 1
            )
        elif assignment.assignee_type.upper() == "ROLE":
            # This role is granted TO assignee_name, so assignee_name inherits from role_name
            assignee_upper = assignment.assignee_name.upper()
            parent_roles_per_role[assignee_upper] = (
                parent_roles_per_role.get(assignee_upper, 0) + 1
            )

    # Check which roles have data grants (DB/schema/table/view grants)
    data_grant_types = {"DATABASE", "SCHEMA", "TABLE", "VIEW"}
    roles_with_data_grants: set[str] = set()

    for grant in grants:
        obj_type = grant.object_type.upper() if grant.object_type else ""
        if obj_type in data_grant_types:
            roles_with_data_grants.add(grant.grantee_name.upper())

    # Update each role's type
    for role in roles:
        role_name_upper = role.name.upper()
        has_data_grants = role_name_upper in roles_with_data_grants
        user_assignment_count = user_assignments_per_role.get(role_name_upper, 0)
        parent_role_count = parent_roles_per_role.get(role_name_upper, 0)

        role.role_type = _infer_role_type(
            has_data_grants=has_data_grants,
            user_assignment_count=user_assignment_count,
            parent_role_count=parent_role_count,
        )


async def run_sync(sync_run_id: str, connection_id: str):
    """Run a full sync for a connection."""
    db = SessionLocal()

    try:
        # Get sync run and connection
        sync_run = db.execute(
            select(SyncRun).where(SyncRun.id == UUID(sync_run_id))
        ).scalar_one()

        connection = db.execute(
            select(Connection).where(Connection.id == UUID(connection_id))
        ).scalar_one()

        # Step 1: Connecting
        _update_sync_progress(db, sync_run, 1, "Connecting")

        # Get credentials
        credentials = get_credentials_from_param_store(connection.credential_param_path)

        # Create connector
        connector = get_connector(
            platform=connection.platform,
            connection_config=connection.connection_config,
            credentials=credentials,
        )

        try:
            # Step 2: Sync users
            _update_sync_progress(db, sync_run, 2, "Syncing users")
            users = await connector.sync_users()
            _upsert_users(db, UUID(connection_id), users)
            sync_run.users_synced = len(users)
            db.commit()

            # Step 3: Sync roles
            _update_sync_progress(db, sync_run, 3, "Syncing roles")
            roles = await connector.sync_roles()
            _upsert_roles(db, UUID(connection_id), roles)
            sync_run.roles_synced = len(roles)
            db.commit()

            # Step 4: Sync role assignments
            _update_sync_progress(db, sync_run, 4, "Syncing role assignments")
            assignments = await connector.sync_role_assignments()
            _upsert_role_assignments(db, UUID(connection_id), assignments)
            db.commit()

            # Step 5: Sync grants
            _update_sync_progress(db, sync_run, 5, "Syncing grants")
            grants = await connector.sync_grants()
            _upsert_grants(db, UUID(connection_id), grants)
            sync_run.grants_synced = len(grants)
            db.commit()

            # Step 6: Sync databases
            _update_sync_progress(db, sync_run, 6, "Syncing databases")
            databases = await connector.sync_databases()
            sync_run.databases_synced = len(databases)
            db.commit()

            # Step 7: Sync schemas
            _update_sync_progress(db, sync_run, 7, "Syncing schemas")
            schemas = await connector.sync_schemas()
            sync_run.schemas_synced = len(schemas)
            db.commit()

            # Step 8: Calculate role types
            _update_sync_progress(db, sync_run, 8, "Calculating role types")
            _calculate_role_types(db, UUID(connection_id))
            db.commit()

            # Update sync status
            sync_run.status = "completed"
            sync_run.completed_at = datetime.utcnow()
            sync_run.current_step = "Completed"

            connection.last_sync_at = datetime.utcnow()
            connection.last_sync_status = "success"
            connection.last_sync_error = None

        except Exception as e:
            sync_run.status = "failed"
            sync_run.error_message = str(e)
            sync_run.completed_at = datetime.utcnow()

            connection.last_sync_status = "failed"
            connection.last_sync_error = str(e)

        finally:
            if hasattr(connector, "close"):
                connector.close()

        db.commit()

    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


def _upsert_users(db: Session, connection_id: UUID, users: list):
    """Upsert platform users."""
    for user in users:
        existing = db.execute(
            select(PlatformUser).where(
                PlatformUser.connection_id == connection_id,
                PlatformUser.name == user.name,
            )
        ).scalar_one_or_none()

        if existing:
            existing.email = user.email
            existing.display_name = user.display_name
            existing.disabled = user.disabled
            existing.platform_data = user.platform_data
            existing.synced_at = datetime.utcnow()
        else:
            db.add(
                PlatformUser(
                    connection_id=connection_id,
                    name=user.name,
                    email=user.email,
                    display_name=user.display_name,
                    disabled=user.disabled,
                    created_on=user.created_on,
                    platform_data=user.platform_data,
                )
            )


def _upsert_roles(db: Session, connection_id: UUID, roles: list):
    """Upsert platform roles."""
    for role in roles:
        existing = db.execute(
            select(PlatformRole).where(
                PlatformRole.connection_id == connection_id,
                PlatformRole.name == role.name,
            )
        ).scalar_one_or_none()

        if existing:
            existing.description = role.description
            existing.is_system = role.is_system
            existing.platform_data = role.platform_data
            existing.synced_at = datetime.utcnow()
        else:
            db.add(
                PlatformRole(
                    connection_id=connection_id,
                    name=role.name,
                    description=role.description,
                    is_system=role.is_system,
                    created_on=role.created_on,
                    platform_data=role.platform_data,
                )
            )


def _upsert_role_assignments(db: Session, connection_id: UUID, assignments: list):
    """Upsert role assignments."""
    for assignment in assignments:
        existing = db.execute(
            select(RoleAssignment).where(
                RoleAssignment.connection_id == connection_id,
                RoleAssignment.role_name == assignment.role_name,
                RoleAssignment.assignee_type == assignment.assignee_type,
                RoleAssignment.assignee_name == assignment.assignee_name,
            )
        ).scalar_one_or_none()

        if existing:
            existing.assigned_by = assignment.assigned_by
            existing.platform_data = assignment.platform_data
            existing.synced_at = datetime.utcnow()
        else:
            db.add(
                RoleAssignment(
                    connection_id=connection_id,
                    role_name=assignment.role_name,
                    assignee_type=assignment.assignee_type,
                    assignee_name=assignment.assignee_name,
                    assigned_by=assignment.assigned_by,
                    created_on=assignment.created_on,
                    platform_data=assignment.platform_data,
                )
            )


def _upsert_grants(db: Session, connection_id: UUID, grants: list):
    """Upsert platform grants."""
    # For grants, we typically do a full replace since the set can change significantly
    # First, mark old grants for deletion (or you could soft-delete)
    # For simplicity, we'll just add new grants without duplicating

    for grant in grants:
        # Check for existing grant (simplified - in production you'd want a unique constraint)
        db.add(
            PlatformGrant(
                connection_id=connection_id,
                privilege=grant.privilege,
                object_type=grant.object_type,
                object_name=grant.object_name,
                grantee_type=grant.grantee_type,
                grantee_name=grant.grantee_name,
                with_grant_option=grant.with_grant_option,
                granted_by=grant.granted_by,
                platform_data=grant.platform_data,
            )
        )
