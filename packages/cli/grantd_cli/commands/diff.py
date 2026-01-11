import typer
from rich.console import Console
from rich.table import Table

from grantd_cli.utils.api import get_api_client
from grantd_cli.utils.auth import require_auth

console = Console()


@require_auth
def diff(
    connection: str = typer.Option(
        None,
        "--connection",
        "-c",
        help="Filter by connection name or ID",
    ),
):
    """Show pending changes."""
    console.print("\n[bold]Pending Changes[/bold]\n")

    api = get_api_client()

    try:
        params = {"status": "draft"}
        if connection:
            params["connection_id"] = connection

        changesets = api.get("/changesets", params=params)

        if not changesets:
            console.print("[dim]No pending changes[/dim]")
            return

        for changeset in changesets:
            console.print(f"[bold]Changeset: {changeset['id'][:8]}[/bold] ({changeset['status']})")
            console.print(f"Created by: {changeset['created_by']}")

            if changeset.get("title"):
                console.print(f"Title: {changeset['title']}")

            console.print()

            # Get changeset details with changes
            details = api.get(f"/changesets/{changeset['id']}")

            if details.get("changes"):
                table = Table(show_header=True, header_style="bold")
                table.add_column("#", style="dim")
                table.add_column("Type")
                table.add_column("Object")
                table.add_column("SQL")

                for idx, change in enumerate(details["changes"], 1):
                    sql = change["sql_statement"]
                    if len(sql) > 50:
                        sql = sql[:47] + "..."

                    # Color based on type
                    if "CREATE" in change["change_type"].upper() or "GRANT" in change["change_type"].upper():
                        prefix = "[green]+[/green]"
                    elif "DROP" in change["change_type"].upper() or "REVOKE" in change["change_type"].upper():
                        prefix = "[red]-[/red]"
                    else:
                        prefix = "[yellow]~[/yellow]"

                    table.add_row(
                        str(idx),
                        f"{prefix} {change['change_type']}",
                        f"{change['object_type']}.{change['object_name']}",
                        sql,
                    )

                console.print(table)

            console.print(f"\nTo apply: [bold]grantd apply {changeset['id'][:8]}[/bold]")
            console.print()

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1)
