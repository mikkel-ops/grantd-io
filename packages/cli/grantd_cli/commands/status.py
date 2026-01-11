import typer
from rich.console import Console
from rich.table import Table

from grantd_cli.utils.api import get_api_client
from grantd_cli.utils.auth import require_auth

console = Console()


@require_auth
def status():
    """Show connection status."""
    console.print("\n[bold]Grantd Status[/bold]\n")

    api = get_api_client()

    try:
        # Get connections
        connections = api.get("/connections")

        if not connections:
            console.print("[dim]No connections configured[/dim]")
            console.print("\nRun 'grantd setup' to create a new connection.")
            return

        table = Table(show_header=True, header_style="bold")
        table.add_column("Name")
        table.add_column("Platform")
        table.add_column("Last Sync")
        table.add_column("Status")

        for conn in connections:
            last_sync = conn.get("last_sync_at", "Never")
            if last_sync and last_sync != "Never":
                from datetime import datetime

                dt = datetime.fromisoformat(last_sync.replace("Z", "+00:00"))
                last_sync = dt.strftime("%Y-%m-%d %H:%M")

            status_text = conn.get("last_sync_status", "Unknown")
            if status_text == "success":
                status_text = "[green]OK[/green]"
            elif status_text == "failed":
                status_text = "[red]Failed[/red]"
            else:
                status_text = f"[dim]{status_text}[/dim]"

            table.add_row(
                conn["name"],
                conn["platform"].title(),
                last_sync,
                status_text,
            )

        console.print(table)

        # Get pending changesets
        changesets = api.get("/changesets", params={"status": "draft"})
        if changesets:
            console.print(f"\n[yellow]{len(changesets)} pending changeset(s)[/yellow]")
            console.print("Run 'grantd diff' to see details.")

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise typer.Exit(1)
