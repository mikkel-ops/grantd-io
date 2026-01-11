from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr


# ============================================================================
# Organizations
# ============================================================================


class OrganizationBase(BaseModel):
    name: str
    slug: str


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationResponse(OrganizationBase):
    id: UUID
    settings: dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OrgMemberResponse(BaseModel):
    id: UUID
    org_id: UUID
    email: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Connections
# ============================================================================


class ConnectionBase(BaseModel):
    name: str
    platform: str
    connection_config: dict[str, Any]


class ConnectionCreate(ConnectionBase):
    pass


class ConnectionUpdate(BaseModel):
    name: str | None = None
    connection_config: dict[str, Any] | None = None
    sync_enabled: bool | None = None
    sync_interval_minutes: int | None = None


class ConnectionResponse(ConnectionBase):
    id: UUID
    org_id: UUID
    sync_enabled: bool
    sync_interval_minutes: int
    last_sync_at: datetime | None
    last_sync_status: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Platform Objects
# ============================================================================


class PlatformUserResponse(BaseModel):
    id: UUID
    connection_id: UUID
    name: str
    email: str | None
    display_name: str | None
    disabled: bool
    created_on: datetime | None
    platform_data: dict[str, Any]
    synced_at: datetime

    class Config:
        from_attributes = True


class PlatformRoleResponse(BaseModel):
    id: UUID
    connection_id: UUID
    name: str
    description: str | None
    is_system: bool
    member_count: int
    grant_count: int
    platform_data: dict[str, Any]
    synced_at: datetime

    class Config:
        from_attributes = True


class RoleAssignmentResponse(BaseModel):
    id: UUID
    connection_id: UUID
    role_name: str
    assignee_type: str
    assignee_name: str
    assigned_by: str | None
    synced_at: datetime

    class Config:
        from_attributes = True


class PlatformGrantResponse(BaseModel):
    id: UUID
    connection_id: UUID
    privilege: str
    object_type: str
    object_name: str | None
    object_database: str | None
    object_schema: str | None
    grantee_type: str
    grantee_name: str
    with_grant_option: bool
    synced_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Changesets
# ============================================================================


class ChangeCreate(BaseModel):
    change_type: str
    object_type: str
    object_name: str
    details: dict[str, Any]


class ChangeResponse(BaseModel):
    id: UUID
    changeset_id: UUID
    change_type: str
    object_type: str
    object_name: str
    details: dict[str, Any]
    sql_statement: str
    execution_order: int
    status: str
    error_message: str | None
    executed_at: datetime | None

    class Config:
        from_attributes = True


class ChangesetCreate(BaseModel):
    connection_id: UUID
    title: str | None = None
    description: str | None = None
    changes: list[ChangeCreate]


class ChangesetResponse(BaseModel):
    id: UUID
    org_id: UUID
    connection_id: UUID
    title: str | None
    description: str | None
    created_by: str
    status: str
    reviewed_by: str | None
    reviewed_at: datetime | None
    applied_at: datetime | None
    changes_count: int
    sql_statements_count: int
    created_at: datetime
    changes: list[ChangeResponse] = []

    class Config:
        from_attributes = True


# ============================================================================
# Sync
# ============================================================================


class SyncTriggerRequest(BaseModel):
    connection_id: UUID


class SyncStatusResponse(BaseModel):
    id: UUID
    connection_id: UUID
    status: str
    started_at: datetime
    completed_at: datetime | None
    users_synced: int
    roles_synced: int
    grants_synced: int
    error_message: str | None

    class Config:
        from_attributes = True


# ============================================================================
# Audit
# ============================================================================


class AuditLogResponse(BaseModel):
    id: UUID
    org_id: UUID
    connection_id: UUID | None
    actor_email: str | None
    action: str
    resource_type: str | None
    resource_name: str | None
    details: dict[str, Any] | None
    created_at: datetime

    class Config:
        from_attributes = True


class DriftEventResponse(BaseModel):
    id: UUID
    connection_id: UUID
    detected_at: datetime
    drift_type: str
    object_type: str
    object_name: str
    previous_state: dict[str, Any] | None
    current_state: dict[str, Any] | None
    acknowledged: bool

    class Config:
        from_attributes = True
