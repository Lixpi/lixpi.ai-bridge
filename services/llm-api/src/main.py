"""
Lixpi LLM API Service - Main application entry point.
Python-based microservice for handling AI model interactions via NATS.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from lixpi_nats_service import NatsService, NatsServiceConfig
from providers.registry import ProviderRegistry

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - handles startup and shutdown."""
    logger.info("🚀 Starting Lixpi LLM API Service...")

    # Initialize NATS client with self-issued JWT
    from config import settings

    nats_config = NatsServiceConfig(
        servers=[s.strip() for s in settings.NATS_SERVERS.split(',')],
        name="llm-api-service",
        nkey_seed=settings.NATS_NKEY_SEED,
        user_id="svc:llm-service",
        tls_ca_cert="/opt/nats/certs/ca.crt",
        max_reconnect_attempts=-1,
        reconnect_time_wait=2
    )

    nats_client = await NatsService.init(nats_config)
    app.state.nats_client = nats_client

    # Initialize provider registry
    provider_registry = ProviderRegistry(nats_client)
    await provider_registry.initialize()
    app.state.provider_registry = provider_registry

    logger.info("✅ Lixpi LLM API Service started successfully")

    yield

    # Cleanup
    logger.info("🛑 Shutting down Lixpi LLM API Service...")
    await provider_registry.shutdown()
    await nats_client.disconnect()
    logger.info("✅ Shutdown complete")


app = FastAPI(
    title="Lixpi LLM API",
    description="Python-based microservice for AI model interactions",
    version="0.1.0",
    lifespan=lifespan
)


@app.get("/health")
async def health_check():
    """Health check endpoint for container orchestration."""
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": "lixpi-llm-api",
            "version": "0.1.0"
        }
    )


@app.get("/")
async def root():
    """Root endpoint - redirects to health check."""
    return JSONResponse(
        status_code=200,
        content={
            "message": "Lixpi LLM API Service",
            "health_check": "/health"
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
