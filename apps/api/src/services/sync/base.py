from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SyncResult:
    users: int = 0
    roles: int = 0
    grants: int = 0
    databases: int = 0
    schemas: int = 0
    tables: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class PlatformUser:
    name: str
    email: str | None = None
    display_name: str | None = None
    disabled: bool = False
    created_on: str | None = None
    platform_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class PlatformRole:
    name: str
    description: str | None = None
    is_system: bool = False
    created_on: str | None = None
    platform_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class RoleAssignment:
    role_name: str
    assignee_type: str  # 'user' or 'role'
    assignee_name: str
    assigned_by: str | None = None
    created_on: str | None = None
    platform_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class PlatformGrant:
    privilege: str
    object_type: str
    object_name: str | None
    grantee_type: str
    grantee_name: str
    with_grant_option: bool = False
    granted_by: str | None = None
    platform_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class PlatformDatabase:
    name: str
    owner: str | None = None
    description: str | None = None
    created_on: str | None = None
    platform_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class PlatformSchema:
    name: str
    database_name: str
    owner: str | None = None
    description: str | None = None
    created_on: str | None = None
    platform_data: dict[str, Any] = field(default_factory=dict)


class PlatformConnector(ABC):
    """Abstract base class for platform connectors."""

    @abstractmethod
    async def test_connection(self) -> bool:
        """Test if connection is valid."""
        pass

    @abstractmethod
    async def sync_users(self) -> list[PlatformUser]:
        """Fetch all users from platform."""
        pass

    @abstractmethod
    async def sync_roles(self) -> list[PlatformRole]:
        """Fetch all roles/groups from platform."""
        pass

    @abstractmethod
    async def sync_role_assignments(self) -> list[RoleAssignment]:
        """Fetch role-to-user and role-to-role assignments."""
        pass

    @abstractmethod
    async def sync_grants(self) -> list[PlatformGrant]:
        """Fetch all grants/permissions."""
        pass

    @abstractmethod
    async def sync_databases(self) -> list[PlatformDatabase]:
        """Fetch databases/projects/catalogs."""
        pass

    @abstractmethod
    async def sync_schemas(self) -> list[PlatformSchema]:
        """Fetch schemas/datasets."""
        pass

    @abstractmethod
    def generate_create_role_sql(self, role_name: str, **kwargs) -> str:
        """Generate SQL to create a role."""
        pass

    @abstractmethod
    def generate_grant_role_sql(
        self,
        role_name: str,
        grantee: str,
        grantee_type: str,
    ) -> str:
        """Generate SQL to grant a role."""
        pass

    @abstractmethod
    def generate_grant_privilege_sql(
        self,
        privilege: str,
        object_type: str,
        object_name: str,
        grantee: str,
        **kwargs,
    ) -> str:
        """Generate SQL to grant a privilege."""
        pass
