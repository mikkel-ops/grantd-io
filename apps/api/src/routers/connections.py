from typing import Any
from uuid import UUID, uuid4

import boto3
from botocore.exceptions import ClientError
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from src.config import get_settings
from src.dependencies import CurrentOrgId, CurrentUser, DbSession
from src.models.database import Connection
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


def store_credentials(param_path: str, private_key_pem: str) -> None:
    """Store credentials in AWS Parameter Store."""
    if settings.environment == "development":
        # In development, we'll skip actual Parameter Store storage
        # In production, this would store the encrypted key
        return

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


def get_credentials(param_path: str) -> str | None:
    """Retrieve credentials from AWS Parameter Store."""
    if settings.environment == "development":
        # In development, credentials are not persisted
        return None

    try:
        ssm = boto3.client('ssm', region_name=settings.aws_region)
        response = ssm.get_parameter(Name=param_path, WithDecryption=True)
        return response['Parameter']['Value']
    except ClientError:
        return None


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

        # Create connector
        connector = SnowflakeConnector(
            account=request.connection_config.get("account", ""),
            user=request.connection_config.get("username", ""),
            private_key=private_key_bytes,
            warehouse=request.connection_config.get("warehouse"),
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
    store_credentials(param_path, connection.private_key)

    db_connection = Connection(
        id=connection_id,
        org_id=UUID(org_id),
        name=connection.name,
        platform=connection.platform,
        connection_config=connection.connection_config,
        credential_param_path=param_path,
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
    private_key_pem = get_credentials(connection.credential_param_path)

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
