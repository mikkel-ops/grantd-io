import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from grantd_cli.utils.api import get_api_client
from grantd_cli.utils.auth import require_auth

console = Console()


@require_auth
def sync(
    connection: str = typer.Argument(
        ...,
        help="Connection name or ID",
    ),
):
    """Sync platform metadata."""
    console.print(f"\n[bold]Syncing connection: {connection}[/bold]\n")

    api = get_api_client()

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Starting sync...", total=None)

        try:
            # Trigger sync
            result = api.post(
                "/sync/trigger",
                json={"connection_id": connection},
            )

            sync_id = result["id"]
            progress.update(task, description="Sync in progress...")

            # Poll for completion
            import time

            while True:
                status = api.get(f"/sync/status/{connection}")
                if status and len(status) > 0:
                    latest = status[0]
                    if latest["status"] in ["completed", "failed"]:
                        break
                time.sleep(2)

            progress.update(task, description="Sync completed!")

        except Exception as e:
            console.print(f"\n[red]Sync failed: {e}[/red]")
            raise typer.Exit(1)

    # Show results
    if latest["status"] == "completed":
        console.print("\n[green]Sync completed successfully![/green]")
        console.print(f"  Users synced: {latest.get('users_synced', 0)}")
        console.print(f"  Roles synced: {latest.get('roles_synced', 0)}")
        console.print(f"  Grants synced: {latest.get('grants_synced', 0)}")
    else:
        console.print(f"\n[red]Sync failed: {latest.get('error_message', 'Unknown error')}[/red]")
        raise typer.Exit(1)
