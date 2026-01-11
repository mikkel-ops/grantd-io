from datetime import datetime
from typing import Generator
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

from src.config import get_settings

settings = get_settings()

# Create engine only if database URL is configured
# PlanetScale requires SSL, which is handled via sslmode=require in the URL
_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None and settings.database_url:
        _engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            # PlanetScale connection settings
            connect_args={
                "sslmode": "require",
            } if "psdb.cloud" in settings.database_url else {},
        )
    return _engine


def get_session_local():
    global _SessionLocal
    if _SessionLocal is None:
        engine = get_engine()
        if engine:
            _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return _SessionLocal


# For backwards compatibility
@property
def engine():
    return get_engine()


SessionLocal = None  # Will be set on first use

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    session_local = get_session_local()
    if session_local is None:
        raise RuntimeError("Database not configured. Set DATABASE_URL environment variable.")
    db = session_local()
    try:
        yield db
    finally:
        db.close()


# ============================================================================
# MULTI-TENANT LAYER
# ============================================================================


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(Text, nullable=False)
    slug = Column(Text, unique=True, nullable=False)
    settings = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    members = relationship("OrgMember", back_populates="organization")
    connections = relationship("Connection", back_populates="organization")


class OrgMember(Base):
    __tablename__ = "org_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    cognito_user_id = Column(Text, nullable=False)
    email = Column(Text, nullable=False)
    role = Column(Text, nullable=False, default="member")
    invited_by = Column(Text)
    invited_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    organization = relationship("Organization", back_populates="members")

    __table_args__ = (Index("idx_org_members_cognito", "cognito_user_id"),)


class OrgInvitation(Base):
    __tablename__ = "org_invitations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    email = Column(Text, nullable=False)
    role = Column(Text, nullable=False, default="member")
    invited_by = Column(Text, nullable=False)
    token = Column(Text, unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    accepted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ============================================================================
# PLATFORM CONNECTIONS
# ============================================================================


class Connection(Base):
    __tablename__ = "connections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name = Column(Text, nullable=False)
    platform = Column(Text, nullable=False)  # snowflake, databricks, bigquery, redshift
    connection_config = Column(JSONB, nullable=False)
    credential_param_path = Column(Text, nullable=False)
    sync_enabled = Column(Boolean, default=True)
    sync_interval_minutes = Column(Integer, default=60)
    last_sync_at = Column(DateTime(timezone=True))
    last_sync_status = Column(Text)
    last_sync_error = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    created_by = Column(Text)

    organization = relationship("Organization", back_populates="connections")
    platform_users = relationship("PlatformUser", back_populates="connection")
    platform_roles = relationship("PlatformRole", back_populates="connection")

    __table_args__ = (Index("idx_connections_org", "org_id"),)


# ============================================================================
# PLATFORM OBJECTS
# ============================================================================


class PlatformUser(Base):
    __tablename__ = "platform_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    connection_id = Column(
        UUID(as_uuid=True), ForeignKey("connections.id"), nullable=False
    )
    name = Column(Text, nullable=False)
    email = Column(Text)
    display_name = Column(Text)
    disabled = Column(Boolean, default=False)
    created_on = Column(DateTime(timezone=True))
    platform_data = Column(JSONB, default={})
    synced_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    connection = relationship("Connection", back_populates="platform_users")

    __table_args__ = (Index("idx_platform_users_connection", "connection_id"),)


class PlatformRole(Base):
    __tablename__ = "platform_roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    connection_id = Column(
        UUID(as_uuid=True), ForeignKey("connections.id"), nullable=False
    )
    name = Column(Text, nullable=False)
    description = Column(Text)
    is_system = Column(Boolean, default=False)
    created_on = Column(DateTime(timezone=True))
    member_count = Column(Integer, default=0)
    grant_count = Column(Integer, default=0)
    platform_data = Column(JSONB, default={})
    synced_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    connection = relationship("Connection", back_populates="platform_roles")

    __table_args__ = (Index("idx_platform_roles_connection", "connection_id"),)


class RoleAssignment(Base):
    __tablename__ = "role_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    connection_id = Column(
        UUID(as_uuid=True), ForeignKey("connections.id"), nullable=False
    )
    role_name = Column(Text, nullable=False)
    assignee_type = Column(Text, nullable=False)  # user or role
    assignee_name = Column(Text, nullable=False)
    assigned_by = Column(Text)
    created_on = Column(DateTime(timezone=True))
    platform_data = Column(JSONB, default={})
    synced_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class PlatformGrant(Base):
    __tablename__ = "platform_grants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    connection_id = Column(
        UUID(as_uuid=True), ForeignKey("connections.id"), nullable=False
    )
    privilege = Column(Text, nullable=False)
    object_type = Column(Text, nullable=False)
    object_name = Column(Text)
    object_database = Column(Text)
    object_schema = Column(Text)
    grantee_type = Column(Text, nullable=False)
    grantee_name = Column(Text, nullable=False)
    with_grant_option = Column(Boolean, default=False)
    granted_by = Column(Text)
    created_on = Column(DateTime(timezone=True))
    platform_data = Column(JSONB, default={})
    synced_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ============================================================================
# CHANGE MANAGEMENT
# ============================================================================


class Changeset(Base):
    __tablename__ = "changesets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    connection_id = Column(
        UUID(as_uuid=True), ForeignKey("connections.id"), nullable=False
    )
    title = Column(Text)
    description = Column(Text)
    created_by = Column(Text, nullable=False)
    status = Column(Text, nullable=False, default="draft")
    reviewed_by = Column(Text)
    reviewed_at = Column(DateTime(timezone=True))
    review_comment = Column(Text)
    applied_at = Column(DateTime(timezone=True))
    applied_by_username = Column(Text)
    applied_via = Column(Text)
    changes_count = Column(Integer, default=0)
    sql_statements_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    changes = relationship("Change", back_populates="changeset")


class Change(Base):
    __tablename__ = "changes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    changeset_id = Column(
        UUID(as_uuid=True), ForeignKey("changesets.id"), nullable=False
    )
    change_type = Column(Text, nullable=False)
    object_type = Column(Text, nullable=False)
    object_name = Column(Text, nullable=False)
    details = Column(JSONB, nullable=False)
    sql_statement = Column(Text, nullable=False)
    execution_order = Column(Integer, nullable=False)
    status = Column(Text, default="pending")
    error_message = Column(Text)
    executed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    changeset = relationship("Changeset", back_populates="changes")


# ============================================================================
# AUDIT & COMPLIANCE
# ============================================================================


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    connection_id = Column(UUID(as_uuid=True), ForeignKey("connections.id"))
    actor_user_id = Column(Text)
    actor_email = Column(Text)
    actor_ip_address = Column(INET)
    action = Column(Text, nullable=False)
    resource_type = Column(Text)
    resource_id = Column(UUID(as_uuid=True))
    resource_name = Column(Text)
    details = Column(JSONB)
    sql_executed = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class DriftEvent(Base):
    __tablename__ = "drift_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    connection_id = Column(
        UUID(as_uuid=True), ForeignKey("connections.id"), nullable=False
    )
    detected_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    drift_type = Column(Text, nullable=False)
    object_type = Column(Text, nullable=False)
    object_name = Column(Text, nullable=False)
    previous_state = Column(JSONB)
    current_state = Column(JSONB)
    acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(Text)
    acknowledged_at = Column(DateTime(timezone=True))
    resolution_note = Column(Text)


class SyncRun(Base):
    __tablename__ = "sync_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    connection_id = Column(
        UUID(as_uuid=True), ForeignKey("connections.id"), nullable=False
    )
    status = Column(Text, nullable=False, default="running")
    started_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at = Column(DateTime(timezone=True))
    triggered_by = Column(Text)
    users_synced = Column(Integer, default=0)
    roles_synced = Column(Integer, default=0)
    grants_synced = Column(Integer, default=0)
    databases_synced = Column(Integer, default=0)
    schemas_synced = Column(Integer, default=0)
    tables_synced = Column(Integer, default=0)
    drift_detected = Column(Integer, default=0)
    error_message = Column(Text)
    error_details = Column(JSONB)
