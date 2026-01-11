import typer
from rich.console import Console
from rich.prompt import Prompt

from grantd_cli.utils.auth import store_credentials

app = typer.Typer(help="Authenticate with Grantd")
console = Console()


@app.callback(invoke_without_command=True)
def login(
    ctx: typer.Context,
    email: str = typer.Option(None, "--email", "-e", help="Email address"),
    password: str = typer.Option(None, "--password", "-p", help="Password (not recommended, use prompt)"),
):
    """Authenticate with Grantd."""
    if ctx.invoked_subcommand is not None:
        return

    console.print("\n[bold]Grantd Login[/bold]\n")

    if not email:
        email = Prompt.ask("Email")

    if not password:
        password = Prompt.ask("Password", password=True)

    with console.status("Authenticating..."):
        try:
            from grantd_cli.utils.api import authenticate

            result = authenticate(email, password)
            store_credentials(result["access_token"], result["refresh_token"])
            console.print(f"\n[green]Successfully logged in as {email}[/green]")
        except Exception as e:
            console.print(f"\n[red]Login failed: {e}[/red]")
            raise typer.Exit(1)


@app.command()
def token():
    """Display the current access token (for debugging)."""
    from grantd_cli.utils.auth import get_access_token

    token = get_access_token()
    if token:
        # Only show first/last 10 chars
        masked = f"{token[:10]}...{token[-10:]}"
        console.print(f"Access token: {masked}")
    else:
        console.print("[yellow]No token stored. Run 'grantd login' first.[/yellow]")
