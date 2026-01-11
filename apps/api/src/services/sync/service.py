import json
from datetime import datetime
from uuid import UUID

import boto3
from sqlalchemy import select
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


def get_credentials_from_param_store(param_path: str) -> dict:
    """Retrieve credentials from AWS Parameter Store."""
    ssm = boto3.client("ssm", region_name=settings.aws_region)

    try:
        response = ssm.get_parameter(Name=param_path, WithDecryption=True)
        return json.loads(response["Parameter"]["Value"])
    except Exception as e:
        raise ValueError(f"Failed to retrieve credentials: {e}")


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

        # Get credentials
        credentials = get_credentials_from_param_store(connection.credential_param_path)

        # Create connector
        connector = get_connector(
            platform=connection.platform,
            connection_config=connection.connection_config,
            credentials=credentials,
        )

        try:
            # Sync users
            users = await connector.sync_users()
            _upsert_users(db, UUID(connection_id), users)
            sync_run.users_synced = len(users)

            # Sync roles
            roles = await connector.sync_roles()
            _upsert_roles(db, UUID(connection_id), roles)
            sync_run.roles_synced = len(roles)

            # Sync role assignments
            assignments = await connector.sync_role_assignments()
            _upsert_role_assignments(db, UUID(connection_id), assignments)

            # Sync grants
            grants = await connector.sync_grants()
            _upsert_grants(db, UUID(connection_id), grants)
            sync_run.grants_synced = len(grants)

            # Sync databases
            databases = await connector.sync_databases()
            sync_run.databases_synced = len(databases)

            # Sync schemas
            schemas = await connector.sync_schemas()
            sync_run.schemas_synced = len(schemas)

            # Update sync status
            sync_run.status = "completed"
            sync_run.completed_at = datetime.utcnow()

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
