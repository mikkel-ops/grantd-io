import typer
from rich.console import Console

from grantd_cli import __version__
from grantd_cli.commands import apply, diff, login, setup, status, sync

app = typer.Typer(
    name="grantd",
    help="Grantd CLI - Visual RBAC for data platforms",
    no_args_is_help=True,
)
console = Console()

# Register commands
app.add_typer(login.app, name="login")
app.command()(setup.setup)
app.command()(sync.sync)
app.command()(diff.diff)
app.command()(apply.apply)
app.command()(status.status)


@app.command()
def logout():
    """Clear stored credentials."""
    from grantd_cli.utils.auth import clear_credentials

    clear_credentials()
    console.print("[green]Logged out successfully[/green]")


def version_callback(value: bool):
    if value:
        console.print(f"grantd version {__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: bool = typer.Option(
        None,
        "--version",
        "-v",
        callback=version_callback,
        is_eager=True,
        help="Show version",
    ),
):
    """Grantd CLI - Visual RBAC for data platforms."""
    pass


if __name__ == "__main__":
    app()
