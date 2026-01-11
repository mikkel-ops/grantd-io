from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from src.auth.cognito import verify_token
from src.models.database import get_db

security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> dict:
    """Verify JWT token and return user claims."""
    token = credentials.credentials
    payload = await verify_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


async def get_current_user_org(
    user: Annotated[dict, Depends(get_current_user)],
) -> str:
    """Get the current user's organization ID."""
    org_id = user.get("custom:org_id")
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User not associated with an organization",
        )
    return org_id


# Type aliases for cleaner dependency injection
CurrentUser = Annotated[dict, Depends(get_current_user)]
CurrentOrgId = Annotated[str, Depends(get_current_user_org)]
DbSession = Annotated[Session, Depends(get_db)]
