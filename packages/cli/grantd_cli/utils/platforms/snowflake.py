import webbrowser
from typing import Literal

import snowflake.connector


def execute_statements(
    account: str,
    user: str,
    auth_method: Literal["password", "sso", "key"],
    role: str,
    statements: list[str],
    password: str | None = None,
    private_key_path: str | None = None,
    warehouse: str | None = None,
):
    """Execute SQL statements against Snowflake.

    Args:
        account: Snowflake account identifier
        user: Snowflake username
        auth_method: Authentication method
        role: Role to use for execution
        statements: List of SQL statements to execute
        password: Password (for password auth)
        private_key_path: Path to private key file (for key auth)
        warehouse: Warehouse to use (optional)
    """
    conn_params = {
        "account": account,
        "user": user,
        "role": role,
    }

    if warehouse:
        conn_params["warehouse"] = warehouse

    if auth_method == "password":
        if not password:
            from rich.prompt import Prompt

            password = Prompt.ask("Password", password=True)
        conn_params["password"] = password

    elif auth_method == "sso":
        conn_params["authenticator"] = "externalbrowser"

    elif auth_method == "key":
        if not private_key_path:
            from rich.prompt import Prompt

            private_key_path = Prompt.ask("Private key path")

        from grantd_cli.utils.crypto import load_private_key

        conn_params["private_key"] = load_private_key(private_key_path)

    # Connect and execute
    conn = snowflake.connector.connect(**conn_params)

    try:
        cursor = conn.cursor()
        for statement in statements:
            cursor.execute(statement)
        cursor.close()
    finally:
        conn.close()
