import httpx
from jose import JWTError, jwk, jwt
from jose.utils import base64url_decode

from src.config import get_settings

settings = get_settings()

# Cache for JWKS
_jwks_cache: dict | None = None


async def get_jwks() -> dict:
    """Fetch and cache JWKS from Cognito."""
    global _jwks_cache

    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            response = await client.get(settings.cognito_jwks_url)
            response.raise_for_status()
            _jwks_cache = response.json()

    return _jwks_cache


async def verify_token(token: str) -> dict | None:
    """Verify a Cognito JWT token and return the payload."""
    try:
        # Get JWKS
        jwks = await get_jwks()

        # Decode token header to get key ID
        headers = jwt.get_unverified_headers(token)
        kid = headers.get("kid")

        if not kid:
            return None

        # Find the matching key
        key = None
        for k in jwks.get("keys", []):
            if k.get("kid") == kid:
                key = k
                break

        if not key:
            return None

        # Construct the public key
        public_key = jwk.construct(key)

        # Verify the token
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=settings.cognito_app_client_id,
            issuer=settings.cognito_issuer,
        )

        return payload

    except JWTError:
        return None
    except Exception:
        return None
