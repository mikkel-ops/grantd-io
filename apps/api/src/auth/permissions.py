from enum import Enum


class OrgRole(str, Enum):
    """Organization roles."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


# Permission matrix
ROLE_PERMISSIONS = {
    OrgRole.OWNER: {
        "connections.create",
        "connections.read",
        "connections.update",
        "connections.delete",
        "changesets.create",
        "changesets.read",
        "changesets.approve",
        "changesets.apply",
        "members.invite",
        "members.remove",
        "members.update_role",
        "org.update",
        "org.delete",
    },
    OrgRole.ADMIN: {
        "connections.create",
        "connections.read",
        "connections.update",
        "connections.delete",
        "changesets.create",
        "changesets.read",
        "changesets.approve",
        "changesets.apply",
        "members.invite",
        "members.remove",
    },
    OrgRole.MEMBER: {
        "connections.read",
        "changesets.create",
        "changesets.read",
    },
    OrgRole.VIEWER: {
        "connections.read",
        "changesets.read",
    },
}


def has_permission(role: str, permission: str) -> bool:
    """Check if a role has a specific permission."""
    try:
        org_role = OrgRole(role)
        return permission in ROLE_PERMISSIONS.get(org_role, set())
    except ValueError:
        return False


def require_permission(user: dict, permission: str) -> bool:
    """Check if user has required permission, raise if not."""
    role = user.get("custom:role", "viewer")
    return has_permission(role, permission)
