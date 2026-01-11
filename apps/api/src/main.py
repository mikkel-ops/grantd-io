from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from src.config import get_settings
from src.routers import auth, changesets, connections, objects, organizations, sync

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title="Grantd API",
    description="Visual RBAC for data platforms",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=f"{settings.api_prefix}/docs",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix=settings.api_prefix, tags=["auth"])
app.include_router(
    organizations.router, prefix=settings.api_prefix, tags=["organizations"]
)
app.include_router(connections.router, prefix=settings.api_prefix, tags=["connections"])
app.include_router(sync.router, prefix=settings.api_prefix, tags=["sync"])
app.include_router(objects.router, prefix=settings.api_prefix, tags=["objects"])
app.include_router(changesets.router, prefix=settings.api_prefix, tags=["changesets"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "0.1.0"}


@app.get(f"{settings.api_prefix}/health")
async def api_health_check():
    return {"status": "healthy", "version": "0.1.0"}


# AWS Lambda handler
handler = Mangum(app, lifespan="off")
