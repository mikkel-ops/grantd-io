import functools
from typing import Callable

import keyring
import typer
from rich.console import Console

SERVICE_NAME = "grantd-cli"
ACCESS_TOKEN_KEY = "access_token"
REFRESH_TOKEN_KEY = "refresh_token"

console = Console()


def store_credentials(access_token: str, refresh_token: str):
    """Store tokens in system keyring."""
    keyring.set_password(SERVICE_NAME, ACCESS_TOKEN_KEY, access_token)
    keyring.set_password(SERVICE_NAME, REFRESH_TOKEN_KEY, refresh_token)


def get_access_token() -> str | None:
    """Get access token from keyring."""
    return keyring.get_password(SERVICE_NAME, ACCESS_TOKEN_KEY)


def get_refresh_token() -> str | None:
    """Get refresh token from keyring."""
    return keyring.get_password(SERVICE_NAME, REFRESH_TOKEN_KEY)


def clear_credentials():
    """Clear stored credentials."""
    try:
        keyring.delete_password(SERVICE_NAME, ACCESS_TOKEN_KEY)
    except keyring.errors.PasswordDeleteError:
        pass
    try:
        keyring.delete_password(SERVICE_NAME, REFRESH_TOKEN_KEY)
    except keyring.errors.PasswordDeleteError:
        pass


def require_auth(func: Callable) -> Callable:
    """Decorator to require authentication."""

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        token = get_access_token()
        if not token:
            console.print("[red]Not authenticated. Run 'grantd login' first.[/red]")
            raise typer.Exit(1)
        return func(*args, **kwargs)

    return wrapper
