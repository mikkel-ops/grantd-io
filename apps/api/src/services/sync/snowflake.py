import snowflake.connector
from snowflake.connector import DictCursor

from .base import (
    PlatformConnector,
    PlatformDatabase,
    PlatformGrant,
    PlatformRole,
    PlatformSchema,
    PlatformUser,
    RoleAssignment,
)


class SnowflakeConnector(PlatformConnector):
    """Snowflake-specific implementation."""

    SYSTEM_ROLES = {
        "ACCOUNTADMIN",
        "SECURITYADMIN",
        "SYSADMIN",
        "USERADMIN",
        "PUBLIC",
        "ORGADMIN",
    }

    def __init__(
        self,
        account: str,
        user: str,
        private_key: str,
        warehouse: str | None = None,
        role: str = "GRANTD_READONLY",
    ):
        self.account = account
        self.user = user
        self.private_key = private_key
        self.warehouse = warehouse
        self.role = role
        self._conn = None

    def _get_connection(self):
        if self._conn is None:
            self._conn = snowflake.connector.connect(
                account=self.account,
                user=self.user,
                private_key=self.private_key,
                warehouse=self.warehouse,
                role=self.role,
            )
        return self._conn

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None

    async def test_connection(self) -> dict:
        """Test the connection and return details about the connected session."""
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Get current session info
            cursor.execute("""
                SELECT
                    CURRENT_USER() as current_user,
                    CURRENT_ROLE() as current_role,
                    CURRENT_WAREHOUSE() as current_warehouse,
                    CURRENT_VERSION() as version
            """)
            row = cursor.fetchone()
            cursor.close()

            return {
                "success": True,
                "message": "Successfully connected to Snowflake",
                "details": {
                    "user": row[0] if row else None,
                    "role": row[1] if row else None,
                    "warehouse": row[2] if row else None,
                    "version": row[3] if row else None,
                }
            }
        except Exception as e:
            error_msg = str(e)
            # Parse common Snowflake errors for better messages
            if "Incorrect username or password" in error_msg:
                return {
                    "success": False,
                    "message": "Authentication failed. Please check your username and private key.",
                }
            elif "Account must be specified" in error_msg or "account" in error_msg.lower():
                return {
                    "success": False,
                    "message": "Invalid account identifier. Please check the format (e.g., xy12345.eu-west-1).",
                }
            elif "JWT token is invalid" in error_msg or "private key" in error_msg.lower():
                return {
                    "success": False,
                    "message": "Invalid private key. Please ensure you're using the correct key format.",
                }
            elif "warehouse" in error_msg.lower():
                return {
                    "success": False,
                    "message": f"Warehouse issue: {error_msg}",
                }
            else:
                return {
                    "success": False,
                    "message": f"Connection failed: {error_msg}",
                }

    async def sync_users(self) -> list[PlatformUser]:
        conn = self._get_connection()
        cursor = conn.cursor(DictCursor)
        cursor.execute("SHOW USERS")

        users = []
        for row in cursor.fetchall():
            users.append(
                PlatformUser(
                    name=row["name"],
                    email=row.get("email"),
                    display_name=row.get("display_name"),
                    disabled=row.get("disabled", False),
                    created_on=str(row.get("created_on")) if row.get("created_on") else None,
                    platform_data={
                        "login_name": row.get("login_name"),
                        "default_warehouse": row.get("default_warehouse"),
                        "default_role": row.get("default_role"),
                        "has_password": row.get("has_password"),
                        "has_rsa_public_key": row.get("has_rsa_public_key"),
                    },
                )
            )
        cursor.close()
        return users

    async def sync_roles(self) -> list[PlatformRole]:
        conn = self._get_connection()
        cursor = conn.cursor(DictCursor)
        cursor.execute("SHOW ROLES")

        roles = []
        for row in cursor.fetchall():
            name = row["name"]
            roles.append(
                PlatformRole(
                    name=name,
                    is_system=name in self.SYSTEM_ROLES,
                    created_on=str(row.get("created_on")) if row.get("created_on") else None,
                    platform_data={
                        "owner": row.get("owner"),
                        "comment": row.get("comment"),
                        "granted_to_roles": row.get("granted_to_roles", 0),
                        "granted_roles": row.get("granted_roles", 0),
                    },
                )
            )
        cursor.close()
        return roles

    async def sync_role_assignments(self) -> list[RoleAssignment]:
        conn = self._get_connection()
        cursor = conn.cursor(DictCursor)

        assignments = []

        # Get all roles first
        cursor.execute("SHOW ROLES")
        roles = [row["name"] for row in cursor.fetchall()]

        # For each role, get grants
        for role in roles:
            try:
                cursor.execute(f"SHOW GRANTS OF ROLE {role}")
                for row in cursor.fetchall():
                    assignments.append(
                        RoleAssignment(
                            role_name=role,
                            assignee_type=row.get("granted_to", "").upper(),
                            assignee_name=row.get("grantee_name", ""),
                            assigned_by=row.get("granted_by"),
                            created_on=str(row.get("created_on")) if row.get("created_on") else None,
                        )
                    )
            except Exception:
                # Skip roles we can't query
                pass

        cursor.close()
        return assignments

    def _parse_object_name(self, full_name: str | None, object_type: str) -> tuple[str | None, str | None, str | None]:
        """Parse a fully qualified object name into (database, schema, object_name).

        Snowflake object names can be:
        - DATABASE: just the db name
        - SCHEMA: DB.SCHEMA
        - TABLE/VIEW: DB.SCHEMA.TABLE
        - WAREHOUSE/ROLE etc: just the name
        """
        if not full_name:
            return None, None, None

        parts = full_name.split(".")
        obj_type_upper = object_type.upper()

        if obj_type_upper == "DATABASE":
            return parts[0] if parts else None, None, parts[0] if parts else None
        elif obj_type_upper == "SCHEMA":
            if len(parts) >= 2:
                return parts[0], parts[1], parts[1]
            return None, parts[0] if parts else None, parts[0] if parts else None
        elif obj_type_upper in ("TABLE", "VIEW", "STAGE", "FILE_FORMAT", "SEQUENCE", "STREAM", "TASK", "PROCEDURE", "FUNCTION"):
            if len(parts) >= 3:
                return parts[0], parts[1], parts[2]
            elif len(parts) == 2:
                return None, parts[0], parts[1]
            return None, None, parts[0] if parts else None
        else:
            # For account-level objects like WAREHOUSE, ROLE, USER, etc.
            return None, None, full_name

    async def sync_grants(self) -> list[PlatformGrant]:
        conn = self._get_connection()
        cursor = conn.cursor(DictCursor)

        grants = []

        # Get all roles
        cursor.execute("SHOW ROLES")
        roles = [row["name"] for row in cursor.fetchall()]

        # For each role, get privileges
        for role in roles:
            try:
                cursor.execute(f"SHOW GRANTS TO ROLE {role}")
                for row in cursor.fetchall():
                    full_name = row.get("name")
                    object_type = row.get("granted_on", "")
                    db_name, schema_name, obj_name = self._parse_object_name(full_name, object_type)

                    grants.append(
                        PlatformGrant(
                            privilege=row.get("privilege", ""),
                            object_type=object_type,
                            object_name=obj_name,
                            object_database=db_name,
                            object_schema=schema_name,
                            grantee_type="ROLE",
                            grantee_name=role,
                            with_grant_option=row.get("grant_option", "false") == "true",
                            granted_by=row.get("granted_by"),
                        )
                    )
            except Exception:
                pass

        cursor.close()
        return grants

    async def sync_databases(self) -> list[PlatformDatabase]:
        conn = self._get_connection()
        cursor = conn.cursor(DictCursor)
        cursor.execute("SHOW DATABASES")

        databases = []
        for row in cursor.fetchall():
            databases.append(
                PlatformDatabase(
                    name=row["name"],
                    owner=row.get("owner"),
                    description=row.get("comment"),
                    created_on=str(row.get("created_on")) if row.get("created_on") else None,
                    platform_data={
                        "retention_time": row.get("retention_time"),
                        "is_transient": row.get("is_transient", False),
                        "is_default": row.get("is_default", False),
                    },
                )
            )
        cursor.close()
        return databases

    async def sync_schemas(self) -> list[PlatformSchema]:
        conn = self._get_connection()
        cursor = conn.cursor(DictCursor)

        schemas = []

        # Get all databases first
        cursor.execute("SHOW DATABASES")
        databases = [row["name"] for row in cursor.fetchall()]

        for db in databases:
            try:
                cursor.execute(f"SHOW SCHEMAS IN DATABASE {db}")
                for row in cursor.fetchall():
                    schemas.append(
                        PlatformSchema(
                            name=row["name"],
                            database_name=db,
                            owner=row.get("owner"),
                            description=row.get("comment"),
                            created_on=str(row.get("created_on")) if row.get("created_on") else None,
                        )
                    )
            except Exception:
                # Skip databases we don't have access to
                pass

        cursor.close()
        return schemas

    # SQL Generation

    def generate_create_role_sql(self, role_name: str, **kwargs) -> str:
        comment = kwargs.get("comment", "")
        sql = f"CREATE ROLE IF NOT EXISTS {role_name}"
        if comment:
            sql += f" COMMENT = '{comment}'"
        return sql + ";"

    def generate_grant_role_sql(
        self,
        role_name: str,
        grantee: str,
        grantee_type: str,
    ) -> str:
        grantee_type = grantee_type.upper()
        return f"GRANT ROLE {role_name} TO {grantee_type} {grantee};"

    def generate_revoke_role_sql(
        self,
        role_name: str,
        grantee: str,
        grantee_type: str,
    ) -> str:
        grantee_type = grantee_type.upper()
        return f"REVOKE ROLE {role_name} FROM {grantee_type} {grantee};"

    def generate_grant_privilege_sql(
        self,
        privilege: str,
        object_type: str,
        object_name: str,
        grantee: str,
        **kwargs,
    ) -> str:
        sql = f"GRANT {privilege} ON {object_type} {object_name} TO ROLE {grantee}"
        if kwargs.get("with_grant_option"):
            sql += " WITH GRANT OPTION"
        return sql + ";"

    def generate_revoke_privilege_sql(
        self,
        privilege: str,
        object_type: str,
        object_name: str,
        grantee: str,
    ) -> str:
        return f"REVOKE {privilege} ON {object_type} {object_name} FROM ROLE {grantee};"
