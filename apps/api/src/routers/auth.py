from fastapi import APIRouter

from src.dependencies import CurrentUser

router = APIRouter(prefix="/auth")


@router.get("/me")
async def get_current_user_info(user: CurrentUser):
    """Get the current authenticated user's information."""
    return {
        "sub": user.get("sub"),
        "email": user.get("email"),
        "org_id": user.get("custom:org_id"),
        "role": user.get("custom:role"),
    }
