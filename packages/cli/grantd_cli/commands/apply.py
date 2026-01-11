import typer
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, Prompt
from rich.syntax import Syntax

from grantd_cli.utils.api import get_api_client
from grantd_cli.utils.auth import require_auth

console = Console()


@require_auth
def apply(
    changeset_id: str = typer.Argument(
        ...,
        help="Changeset ID to apply",
    ),
    auto_approve: bool = typer.Option(
        False,
        "--yes",
        "-y",
        help="Skip confirmation prompt",
    ),
):
    """Apply a changeset."""
    console.print(f"\n[bold]Applying Changeset: {changeset_id}[/bold]\n")

    api = get_api_client()

    try:
        # Fetch changeset
        with console.status("Fetching changeset..."):
            changeset = api.get(f"/changesets/{changeset_id}")

        if not changeset:
            console.print("[red]Changeset not found[/red]")
            raise typer.Exit(1)

        changes = changeset.get("changes", [])
        if not changes:
            console.print("[yellow]No changes in this changeset[/yellow]")
            return

        # Show SQL preview
        console.print("[bold]SQL Preview:[/bold]")
        console.print("-" * 60)

        sql_statements = []
        for idx, change in enumerate(changes, 1):
            sql = change["sql_statement"]
            sql_statements.append(sql)
            console.print(f"[dim][{idx}/{len(changes)}][/dim] ", end="")
            syntax = Syntax(sql, "sql", theme="monokai", word_wrap=True)
            console.print(syntax)

        console.print("-" * 60)

        # Get confirmation
        if not auto_approve:
            if not Confirm.ask(f"\nExecute {len(changes)} statement(s)?", default=False):
                console.print("[yellow]Cancelled[/yellow]")
                raise typer.Exit(0)

        # Get credentials
        console.print("\n[bold]Snowflake credentials:[/bold]")
        account = Prompt.ask("  Account", default=changeset.get("connection_config", {}).get("account_identifier", ""))
        user = Prompt.ask("  User")

        auth_method = Prompt.ask(
            "  Auth method",
            choices=["password", "sso", "key"],
            default="sso",
        )

        role = Prompt.ask("  Role", default="SECURITYADMIN")

        # Execute
        console.print("\n[bold]Executing...[/bold]")

        from grantd_cli.utils.platforms.snowflake import execute_statements

        success_count = 0
        for idx, sql in enumerate(sql_statements, 1):
            try:
                with console.status(f"[{idx}/{len(sql_statements)}] Executing..."):
                    execute_statements(
                        account=account,
                        user=user,
                        auth_method=auth_method,
                        role=role,
                        statements=[sql],
                    )
                console.print(f"  [{idx}/{len(sql_statements)}] {sql[:40]}... [green]OK[/green]")
                success_count += 1
            except Exception as e:
                console.print(f"  [{idx}/{len(sql_statements)}] {sql[:40]}... [red]FAILED[/red]")
                console.print(f"    Error: {e}")

        # Mark as applied
        if success_count == len(sql_statements):
            api.post(f"/changesets/{changeset_id}/mark-applied")
            console.print(f"\n[green]All {success_count} statements executed successfully![/green]")
        else:
            console.print(f"\n[yellow]{success_count}/{len(sql_statements)} statements succeeded[/yellow]")

    except typer.Exit:
        raise
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1)
