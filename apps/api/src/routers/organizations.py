from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from src.dependencies import CurrentOrgId, CurrentUser, DbSession
from src.models.database import OrgMember, Organization
from src.models.schemas import OrgMemberResponse, OrganizationResponse

router = APIRouter(prefix="/organizations")


@router.get("/current", response_model=OrganizationResponse)
async def get_current_organization(
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Get the current user's organization."""
    org = db.execute(
        select(Organization).where(Organization.id == UUID(org_id))
    ).scalar_one_or_none()

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    return org


@router.get("/current/members", response_model=list[OrgMemberResponse])
async def get_organization_members(
    org_id: CurrentOrgId,
    db: DbSession,
):
    """Get all members of the current organization."""
    members = db.execute(
        select(OrgMember).where(OrgMember.org_id == UUID(org_id))
    ).scalars().all()

    return members
