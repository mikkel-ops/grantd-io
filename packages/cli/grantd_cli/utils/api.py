from typing import Any

import httpx

from grantd_cli.config import settings
from grantd_cli.utils.auth import get_access_token


class ApiClient:
    """HTTP client for Grantd API."""

    def __init__(self, base_url: str, token: str | None = None):
        self.base_url = base_url
        self.token = token

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def get(self, endpoint: str, params: dict | None = None) -> Any:
        """GET request."""
        with httpx.Client() as client:
            response = client.get(
                f"{self.base_url}{endpoint}",
                params=params,
                headers=self._headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    def post(self, endpoint: str, json: dict | None = None) -> Any:
        """POST request."""
        with httpx.Client() as client:
            response = client.post(
                f"{self.base_url}{endpoint}",
                json=json,
                headers=self._headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    def patch(self, endpoint: str, json: dict | None = None) -> Any:
        """PATCH request."""
        with httpx.Client() as client:
            response = client.patch(
                f"{self.base_url}{endpoint}",
                json=json,
                headers=self._headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    def delete(self, endpoint: str) -> Any:
        """DELETE request."""
        with httpx.Client() as client:
            response = client.delete(
                f"{self.base_url}{endpoint}",
                headers=self._headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            if response.status_code == 204:
                return None
            return response.json()


def get_api_client() -> ApiClient:
    """Get an authenticated API client."""
    token = get_access_token()
    return ApiClient(settings.api_url, token)


def authenticate(email: str, password: str) -> dict[str, str]:
    """Authenticate with Cognito and return tokens."""
    # In production, this would call Cognito directly
    # For now, we'll use a simple API endpoint
    client = ApiClient(settings.api_url)

    # This is a placeholder - actual implementation would use
    # amazon-cognito-identity-js or boto3 to authenticate
    raise NotImplementedError(
        "Direct authentication not yet implemented. "
        "Use the web interface to log in and export your token."
    )
