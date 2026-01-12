from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import boto3
from botocore.exceptions import ClientError
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select

from src.config import get_settings
from src.dependencies import CurrentOrgId, CurrentUser, DbSession
from src.models.database import (
    Connection,
    PlatformGrant,
    PlatformRole,
    PlatformUser,
    RoleAssignment,
    SyncRun,
)
from src.models.schemas import ConnectionCreate, ConnectionResponse, ConnectionUpdate
from src.services.sync.snowflake import SnowflakeConnector

router = APIRouter(prefix="/connections")
settings = get_settings()


class ConnectionTestRequest(BaseModel):
    """Request schema for testing a connection."""
    platform: str
    connection_config: dict[str, Any]
    private_key: str


class ConnectionTestResponse(BaseModel):
    """Response schema for connection test."""
    success: bool
    message: str
    details: dict[str, Any] | None = None


class ConnectionCreateWithKey(ConnectionCreate):
    """Extended connection create with private key."""
    private_key: str


def parse_private_key(private_key_pem: str) -> bytes:
    """Parse a PEM-encoded private key and return the key bytes for Snowflake."""
    try:
        # Clean up the key - normalize line endings
        key_text = private_key_pem.strip()

        # Load the private key
        private_key = serialization.load_pem_private_key(
            key_text.encode('utf-8'),
            password=None,
            backend=default_backend()
        )

        # Return the private key bytes in DER format (what Snowflake expects)
        return private_key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
    except Exception as e:
        raise ValueError(f"Invalid private key format: {str(e)}")


def store_credentials_param_store(param_path: str, private_key_pem: str) -> None:
    """Store credentials in AWS Parameter Store (production only)."""
    try:
        ssm = boto3.client('ssm', region_name=settings.aws_region)
        ssm.put_parameter(
            Name=param_path,
            Value=private_key_pem,
            Type='SecureString',
            Overwrite=True,
            Description='Snowflake connection private key for Grantd',
        )
    except ClientError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store credentials: {str(e)}",
        )


def get_credentials_from_param_store(param_path: str) -> str | None:
    """Retrieve credentials from AWS Parameter Store (production only)."""
    try:
        ssm = boto3.client('ssm', region_name=settings.aws_region)
        response = ssm.get_parameter(Name=param_path, WithDecryption=True)
        return response['Parameter']['Value']
    except ClientError:
        return None


def get_connection_credentials(connection: Connection) -> str | None:
    """Get credentials for a connection (from DB in dev, Parameter Store in prod)."""
    if settings.environment == "development":
        return connection.encrypted_credentials
    return get_credentials_from_param_store(connection.credential_param_path)


@router.get("", response_model=list[ConnectionResponse])
async def list_connections(
    org_id: CurrentOrgId,
    db: DbSession,
):
    """List all connections for the current organization."""
    connections = db.execute(
        select(Connection).where(Connection.org_id == UUID(org_id))
    ).scalars().all()

    return connections


@router.post("/test", response_model=ConnectionTestResponse)
async def test_connection(
    request: ConnectionTestRequest,
    org_id: CurrentOrgId,
):
    """Test a connection without saving it."""
    if request.platform != "snowflake":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Platform '{request.platform}' is not supported yet.",
        )

    try:
        # Parse the private key
        private_key_bytes = parse_private_key(request.private_key)

        # Create connector (strip whitespace from account identifier)
        connector = SnowflakeConnector(
            account=request.connection_config.get("account", "").strip(),
            user=request.connection_config.get("username", "").strip(),
            private_key=private_key_bytes,
            warehouse=(request.connection_config.get("warehouse") or "").strip() or None,
        )

        # Test the connection
        result = await connector.test_connection()

        # Clean up
        connector.close()

        return ConnectionTestResponse(**result)

    except ValueError as e:
        return ConnectionTestResponse(
            success=False,
            message=str(e),
        )
    except Exception as e:
        return ConnectionTestResponse(
            success=False,
            message=f"Connection test failed: {str(e)}",
        )


@router.post("", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_connection(
    connection: ConnectionCreateWithKey,
    org_id: CurrentOrgId,
    user: CurrentUser,
    db: DbSession,
):
    """Create a new platform connection."""
    # Validate the private key format
    try:
        parse_private_key(connection.private_key)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Generate a unique parameter store path for credentials
    connection_id = uuid4()
    param_path = f"/grantd/{org_id}/connections/{connection_id}"

    # Store the private key securely
    if settings.environment != "development":
        store_credentials_param_store(param_path, connection.private_key)

    db_connection = Connection(
        id=connection_id,
        org_id=UUID(org_id),
        name=connection.name,
        platform=connection.platform,
        connection_config=connection.connection_config,
        credential_param_path=param_path,
        # In development, store credentials directly in DB
        encrypted_credentials=connection.private_key if settings.environment == "development" else None,
        created_by=user.get("email"),
    )

    db.add(db_connection)
    db.commit()
    db.refresh(db_connection)

    return db_connection


@router.get("/{connection_id}", response_model=ConnectionResponse)
async def get_connection(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Get a specific connection."""
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


@router.patch("/{connection_id}", response_model=ConnectionResponse)
async def update_connection(
    connection_id: UUID,
    updates: ConnectionUpdate,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Update a connection."""
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

    update_data = updates.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(connection, key, value)

    db.commit()
    db.refresh(connection)

    return connection


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Delete a connection."""
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

    db.delete(connection)
    db.commit()


@router.post("/{connection_id}/test", response_model=ConnectionTestResponse)
async def test_existing_connection(
    connection_id: UUID,
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Test an existing saved connection."""
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

    # Get stored credentials
    private_key_pem = get_connection_credentials(connection)

    if not private_key_pem:
        return ConnectionTestResponse(
            success=False,
            message="No stored credentials found for this connection.",
        )

    try:
        private_key_bytes = parse_private_key(private_key_pem)

        connector = SnowflakeConnector(
            account=connection.connection_config.get("account", ""),
            user=connection.connection_config.get("username", ""),
            private_key=private_key_bytes,
            warehouse=connection.connection_config.get("warehouse"),
        )

        result = await connector.test_connection()
        connector.close()

        return ConnectionTestResponse(**result)

    except Exception as e:
        return ConnectionTestResponse(
            success=False,
            message=f"Connection test failed: {str(e)}",
        )


class SyncResponse(BaseModel):
    """Response schema for sync operation."""
    success: bool
    message: str
    sync_run_id: str | None = None
    users_synced: int = 0
    roles_synced: int = 0
    grants_synced: int = 0
    role_assignments_synced: int = 0


@router.post("/{connection_id}/sync", response_model=SyncResponse)
async def sync_connection(
    connection_id: UUID,
    org_id: CurrentOrgId,
    user: CurrentUser,
    db: DbSession,
):
    """Trigger a sync for a connection - fetches users, roles, and grants from Snowflake."""
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

    # Get stored credentials
    private_key_pem = get_connection_credentials(connection)

    if not private_key_pem:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No stored credentials found for this connection.",
        )

    # Create a sync run record
    sync_run = SyncRun(
        connection_id=connection_id,
        status="running",
        triggered_by=user.get("email"),
    )
    db.add(sync_run)
    db.commit()
    db.refresh(sync_run)

    try:
        # Parse private key and create connector (strip whitespace)
        private_key_bytes = parse_private_key(private_key_pem)
        connector = SnowflakeConnector(
            account=connection.connection_config.get("account", "").strip(),
            user=connection.connection_config.get("username", "").strip(),
            private_key=private_key_bytes,
            warehouse=(connection.connection_config.get("warehouse") or "").strip() or None,
        )

        # Sync users
        users = await connector.sync_users()
        _upsert_users(db, connection_id, users)
        sync_run.users_synced = len(users)

        # Sync roles
        roles = await connector.sync_roles()
        _upsert_roles(db, connection_id, roles)
        sync_run.roles_synced = len(roles)

        # Sync role assignments
        assignments = await connector.sync_role_assignments()
        _upsert_role_assignments(db, connection_id, assignments)

        # Sync grants (clear and replace)
        grants = await connector.sync_grants()
        _replace_grants(db, connection_id, grants)
        sync_run.grants_synced = len(grants)

        # Update role member and grant counts
        _update_role_counts(db, connection_id)

        # Update sync run and connection status
        sync_run.status = "completed"
        sync_run.completed_at = datetime.utcnow()

        connection.last_sync_at = datetime.utcnow()
        connection.last_sync_status = "success"
        connection.last_sync_error = None

        db.commit()
        connector.close()

        return SyncResponse(
            success=True,
            message=f"Successfully synced {len(users)} users, {len(roles)} roles, {len(grants)} grants",
            sync_run_id=str(sync_run.id),
            users_synced=len(users),
            roles_synced=len(roles),
            grants_synced=len(grants),
            role_assignments_synced=len(assignments),
        )

    except Exception as e:
        sync_run.status = "failed"
        sync_run.error_message = str(e)
        sync_run.completed_at = datetime.utcnow()

        connection.last_sync_status = "failed"
        connection.last_sync_error = str(e)

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sync failed: {str(e)}",
        )


def _upsert_users(db, connection_id: UUID, users: list):
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
                    platform_data=user.platform_data,
                )
            )


def _upsert_roles(db, connection_id: UUID, roles: list):
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
                    platform_data=role.platform_data,
                )
            )


def _upsert_role_assignments(db, connection_id: UUID, assignments: list):
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
                    platform_data=assignment.platform_data,
                )
            )


def _replace_grants(db, connection_id: UUID, grants: list):
    """Replace all grants for a connection (delete old, insert new)."""
    # Delete existing grants
    db.execute(
        delete(PlatformGrant).where(PlatformGrant.connection_id == connection_id)
    )

    # Insert new grants
    for grant in grants:
        db.add(
            PlatformGrant(
                connection_id=connection_id,
                privilege=grant.privilege,
                object_type=grant.object_type,
                object_name=grant.object_name,
                object_database=grant.object_database,
                object_schema=grant.object_schema,
                grantee_type=grant.grantee_type,
                grantee_name=grant.grantee_name,
                with_grant_option=grant.with_grant_option,
                granted_by=grant.granted_by,
                platform_data=grant.platform_data,
            )
        )


def _update_role_counts(db, connection_id: UUID):
    """Update member_count and grant_count for all roles in a connection."""
    # Get all roles for this connection
    roles = db.execute(
        select(PlatformRole).where(PlatformRole.connection_id == connection_id)
    ).scalars().all()

    for role in roles:
        # Count members (users and roles assigned to this role)
        member_count = db.execute(
            select(func.count(RoleAssignment.id)).where(
                RoleAssignment.connection_id == connection_id,
                RoleAssignment.role_name == role.name,
            )
        ).scalar() or 0

        # Count grants to this role
        grant_count = db.execute(
            select(func.count(PlatformGrant.id)).where(
                PlatformGrant.connection_id == connection_id,
                PlatformGrant.grantee_name == role.name,
                PlatformGrant.grantee_type == "ROLE",
            )
        ).scalar() or 0

        role.member_count = member_count
        role.grant_count = grant_count
