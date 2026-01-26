from typing import Any


def generate_sql_for_change(
    platform: str,
    change_type: str,
    object_type: str,
    object_name: str,
    details: dict[str, Any],
) -> str:
    """Generate platform-specific SQL for a change."""
    if platform == "snowflake":
        return _generate_snowflake_sql(change_type, object_type, object_name, details)
    elif platform == "databricks":
        return _generate_databricks_sql(change_type, object_type, object_name, details)
    else:
        raise ValueError(f"Unsupported platform: {platform}")


def _generate_snowflake_sql(
    change_type: str,
    object_type: str,
    object_name: str,
    details: dict[str, Any],
) -> str:
    """Generate Snowflake-specific SQL."""
    match change_type:
        case "create_role":
            comment = details.get("comment", "")
            sql = f"CREATE ROLE IF NOT EXISTS {object_name}"
            if comment:
                sql += f" COMMENT = '{comment}'"
            return sql + ";"

        case "drop_role":
            return f"DROP ROLE IF EXISTS {object_name};"

        case "grant_role":
            grantee = details.get("grantee")
            grantee_type = details.get("grantee_type", "USER").upper()
            return f"GRANT ROLE {object_name} TO {grantee_type} {grantee};"

        case "revoke_role":
            grantee = details.get("grantee")
            grantee_type = details.get("grantee_type", "USER").upper()
            return f"REVOKE ROLE {object_name} FROM {grantee_type} {grantee};"

        case "grant" if object_type == "role_assignment":
            # Canvas-style role assignment: grant role to user
            user_name = details.get("user_name")
            role_name = details.get("role_name")
            return f"GRANT ROLE {role_name} TO USER {user_name};"

        case "revoke" if object_type == "role_assignment":
            # Canvas-style role revocation: revoke role from user
            user_name = details.get("user_name")
            role_name = details.get("role_name")
            return f"REVOKE ROLE {role_name} FROM USER {user_name};"

        case "grant_privilege":
            privilege = details.get("privilege")
            on_type = details.get("on_type")
            on_name = details.get("on_name")
            with_grant = details.get("with_grant_option", False)
            is_imported = details.get("is_imported_database", False)

            # For imported/shared databases, use IMPORTED PRIVILEGES
            if is_imported and on_type.upper() == "DATABASE":
                return f"GRANT IMPORTED PRIVILEGES ON DATABASE {on_name} TO ROLE {object_name};"

            sql = f"GRANT {privilege} ON {on_type} {on_name} TO ROLE {object_name}"
            if with_grant:
                sql += " WITH GRANT OPTION"
            return sql + ";"

        case "revoke_privilege":
            privilege = details.get("privilege")
            on_type = details.get("on_type")
            on_name = details.get("on_name")
            return f"REVOKE {privilege} ON {on_type} {on_name} FROM ROLE {object_name};"

        case "create_user":
            login_name = details.get("login_name", object_name)
            email = details.get("email", "")
            password = details.get("password", "")
            first_name = details.get("first_name", "")
            last_name = details.get("last_name", "")
            display_name = details.get("display_name", "")
            comment = details.get("comment", "")
            default_namespace = details.get("default_namespace", "")
            must_change_password = details.get("must_change_password", True)

            sql = f"CREATE USER IF NOT EXISTS {object_name}"
            sql += f" LOGIN_NAME = '{login_name}'"
            if password:
                sql += f" PASSWORD = '{password}'"
                if must_change_password:
                    sql += " MUST_CHANGE_PASSWORD = TRUE"
            if email:
                sql += f" EMAIL = '{email}'"
            if first_name:
                sql += f" FIRST_NAME = '{first_name}'"
            if last_name:
                sql += f" LAST_NAME = '{last_name}'"
            if display_name:
                sql += f" DISPLAY_NAME = '{display_name}'"
            if comment:
                sql += f" COMMENT = '{comment}'"
            if default_namespace:
                sql += f" DEFAULT_NAMESPACE = '{default_namespace}'"
            return sql + ";"

        case "drop_user":
            return f"DROP USER IF EXISTS {object_name};"

        case "alter_user":
            alterations = []
            if "disabled" in details:
                alterations.append(
                    "DISABLED = TRUE" if details["disabled"] else "DISABLED = FALSE"
                )
            if "default_role" in details:
                alterations.append(f"DEFAULT_ROLE = {details['default_role']}")
            if alterations:
                return f"ALTER USER {object_name} SET {' '.join(alterations)};"
            return f"-- No changes for user {object_name}"

        case _:
            return f"-- Unsupported change type: {change_type}"


def _generate_databricks_sql(
    change_type: str,
    object_type: str,
    object_name: str,
    details: dict[str, Any],
) -> str:
    """Generate Databricks-specific SQL (Unity Catalog)."""
    match change_type:
        case "create_group":
            return f"-- CREATE GROUP not available via SQL in Databricks (use SCIM API)"

        case "grant_privilege":
            privilege = details.get("privilege")
            on_type = details.get("on_type")
            on_name = details.get("on_name")
            return f"GRANT {privilege} ON {on_type} {on_name} TO `{object_name}`;"

        case "revoke_privilege":
            privilege = details.get("privilege")
            on_type = details.get("on_type")
            on_name = details.get("on_name")
            return f"REVOKE {privilege} ON {on_type} {on_name} FROM `{object_name}`;"

        case _:
            return f"-- Unsupported change type for Databricks: {change_type}"
