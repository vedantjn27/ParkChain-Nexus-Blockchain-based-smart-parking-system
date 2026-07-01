"""FastAPI application entrypoint for ParkChain Nexus."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.chain import router as chain_router
from app.api.demo import router as demo_router
from app.api.forecast import router as forecast_router
from app.api.lots import router as lots_router
from app.api.parkcoin import router as parkcoin_router
from app.api.pricing import router as pricing_router
from app.api.sessions import router as sessions_router
from app.api.trust import router as trust_router
from app.api.ws import router as ws_router
from app.core.config import get_settings
from app.db.session import create_db_and_tables


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[] if settings.allow_all_cors_origins else settings.cors_origin_list,
    allow_origin_regex=".*" if settings.allow_all_cors_origins else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chain_router)
app.include_router(demo_router)
app.include_router(forecast_router)
app.include_router(lots_router)
app.include_router(parkcoin_router)
app.include_router(pricing_router)
app.include_router(sessions_router)
app.include_router(trust_router)
app.include_router(ws_router)


@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.environment,
    }
