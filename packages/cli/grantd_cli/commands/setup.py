from pathlib import Path

import typer
from rich.console import Console
from rich.prompt import Confirm, Prompt

console = Console()


def setup(
    platform: str = typer.Option(
        "snowflake",
        "--platform",
        "-p",
        help="Platform to set up (snowflake, databricks, bigquery, redshift)",
    ),
    output: Path = typer.Option(
        Path("./grantd-setup.sql"),
        "--output",
        "-o",
        help="Output path for setup SQL",
    ),
):
    """Generate setup SQL for a new connection."""
    console.print("\n[bold]Grantd Connection Setup[/bold]")
    console.print(f"Platform: {platform.title()}\n")

    if platform != "snowflake":
        console.print(f"[yellow]{platform.title()} support coming soon![/yellow]")
        raise typer.Exit(1)

    # Gather information
    account = Prompt.ask("Account identifier", default="your-account.region")
    service_account = Prompt.ask("Service account name", default="GRANTD_READONLY")
    databases = Prompt.ask(
        "Databases to include (comma-separated)",
        default="*",
    )

    # Generate RSA key pair
    console.print("\nGenerating RSA key pair...")
    from grantd_cli.utils.crypto import generate_key_pair

    from grantd_cli.config import settings

    key_name = account.replace(".", "-").lower()
    private_key_path = settings.keys_dir / f"{key_name}.pem"
    public_key_path = settings.keys_dir / f"{key_name}.pub"

    private_key, public_key = generate_key_pair()

    private_key_path.write_text(private_key)
    private_key_path.chmod(0o600)
    public_key_path.write_text(public_key)

    console.print(f"  Private key: {private_key_path}")
    console.print(f"  Public key:  {public_key_path}")

    # Generate setup SQL
    setup_sql = _generate_snowflake_setup_sql(
        service_account=service_account,
        public_key=public_key.replace("-----BEGIN PUBLIC KEY-----", "")
        .replace("-----END PUBLIC KEY-----", "")
        .replace("\n", ""),
        databases=databases,
    )

    output.write_text(setup_sql)
    console.print(f"\n[green]Setup SQL saved to: {output}[/green]")

    console.print("\n[bold]Next steps:[/bold]")
    console.print(f"  1. Run {output} in Snowflake as ACCOUNTADMIN")
    console.print(
        f"  2. Run: grantd connect --platform snowflake --account {account}"
    )


def _generate_snowflake_setup_sql(
    service_account: str,
    public_key: str,
    databases: str,
) -> str:
    """Generate Snowflake setup SQL."""
    db_grants = ""
    if databases != "*":
        for db in databases.split(","):
            db = db.strip()
            db_grants += f"""
-- Grant access to {db}
GRANT USAGE ON DATABASE {db} TO ROLE {service_account};
GRANT USAGE ON ALL SCHEMAS IN DATABASE {db} TO ROLE {service_account};
GRANT USAGE ON FUTURE SCHEMAS IN DATABASE {db} TO ROLE {service_account};
"""
    else:
        db_grants = """
-- Grant access to all databases (run for each database you want to include)
-- GRANT USAGE ON DATABASE <DATABASE_NAME> TO ROLE GRANTD_READONLY;
-- GRANT USAGE ON ALL SCHEMAS IN DATABASE <DATABASE_NAME> TO ROLE GRANTD_READONLY;
-- GRANT USAGE ON FUTURE SCHEMAS IN DATABASE <DATABASE_NAME> TO ROLE GRANTD_READONLY;
"""

    return f"""-- ==============================================
-- Grantd Setup Script for Snowflake
-- ==============================================
-- This creates a READ-ONLY service account.
-- It CANNOT modify anything in your account.
-- ==============================================

-- 1. Create read-only role
CREATE ROLE IF NOT EXISTS {service_account};

-- 2. Grant access to account metadata
GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO ROLE {service_account};

-- 3. Grant access to see objects (not data!)
{db_grants}

-- 4. Create service account with key-pair auth
CREATE USER IF NOT EXISTS GRANTD_SVC
    LOGIN_NAME = 'GRANTD_SVC'
    DISPLAY_NAME = 'Grantd Service Account'
    DEFAULT_ROLE = {service_account}
    MUST_CHANGE_PASSWORD = FALSE
    RSA_PUBLIC_KEY = '{public_key}';

-- 5. Assign role
GRANT ROLE {service_account} TO USER GRANTD_SVC;

-- ==============================================
-- VERIFY: This user CANNOT:
-- ==============================================
-- X CREATE USER
-- X CREATE ROLE
-- X GRANT privileges
-- X SELECT from tables (only metadata)
-- X ALTER or DROP anything
-- ==============================================
"""
