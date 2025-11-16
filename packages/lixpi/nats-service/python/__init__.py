"""
NATS Service for Python - Shared NATS client implementation
"""

from .nats_client import NatsService, NatsServiceConfig, generate_self_issued_jwt

__all__ = ["NatsService", "NatsServiceConfig", "generate_self_issued_jwt"]
