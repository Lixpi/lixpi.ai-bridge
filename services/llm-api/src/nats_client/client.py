"""NATS client for LLM API service.
Handles connection to NATS LLM_SERVICE account with self-issued JWT authentication.
"""

import asyncio
import json
import logging
import ssl
import time
import base64
from typing import Any, Dict, Optional, Callable

import nats
from nats.aio.client import Client as NATS
from nats.aio.msg import Msg
from nats.js import JetStreamContext
from nkeys import from_seed

from config import settings

logger = logging.getLogger(__name__)


def generate_self_issued_jwt(nkey_seed: str, user_id: str, expiry_hours: int = 1) -> str:
    """
    Generate a self-issued JWT signed with NKey (Ed25519).

    Args:
        nkey_seed: Base32-encoded NKey seed (starts with 'SU')
        user_id: Service identity (e.g., 'svc:llm-service')
        expiry_hours: Token validity period in hours (default: 1)

    Returns:
        Signed JWT token string
    """
    # Create NKey pair from seed
    kp = from_seed(nkey_seed.encode())

    # Get public key for issuer field
    public_key = kp.public_key.decode()

    # Create JWT claims
    now = int(time.time())
    claims = {
        "sub": user_id,           # Subject: service identity
        "iss": public_key,        # Issuer: our public key
        "iat": now,               # Issued at
        "exp": now + (expiry_hours * 3600)  # Expiry
    }

    # Create JWT header
    header = {
        "typ": "JWT",
        "alg": "EdDSA"  # Ed25519 signature algorithm
    }

    # Encode header and claims as base64url
    def base64url_encode(data: dict) -> str:
        json_str = json.dumps(data, separators=(',', ':'))
        encoded = base64.urlsafe_b64encode(json_str.encode()).rstrip(b'=')
        return encoded.decode()

    header_b64 = base64url_encode(header)
    claims_b64 = base64url_encode(claims)

    # Create signing input
    message = f"{header_b64}.{claims_b64}"

    # Sign with NKey
    signature = kp.sign(message.encode())
    signature_b64 = base64.urlsafe_b64encode(signature).rstrip(b'=').decode()

    # Construct final JWT
    jwt_token = f"{message}.{signature_b64}"

    logger.debug(f"Generated self-issued JWT for {user_id}, expires in {expiry_hours}h")

    return jwt_token


class NatsClient:
    """NATS client with self-issued JWT authentication for LLM_SERVICE account."""

    def __init__(self):
        self.nc: Optional[NATS] = None
        self.js: Optional[JetStreamContext] = None
        self._subscriptions: Dict[str, Any] = {}

    async def connect(self) -> None:
        """Connect to NATS server using self-issued JWT authentication."""
        try:
            logger.info(f"Connecting to NATS servers: {settings.NATS_SERVERS}")

            # Parse NATS servers
            servers = [s.strip() for s in settings.NATS_SERVERS.split(',')]
            logger.info(f"Parsed servers: {servers}")

            # Configure TLS context to use Caddy's CA cert
            logger.info("Configuring TLS context with Caddy CA cert...")
            tls_ctx = ssl.create_default_context(purpose=ssl.Purpose.SERVER_AUTH)
            tls_ctx.load_verify_locations(cafile="/opt/nats/certs/ca.crt")
            logger.info("TLS context configured")

            # Generate self-issued JWT signed with our NKey
            logger.info("Generating self-issued JWT for llm-service...")
            jwt_token = generate_self_issued_jwt(
                nkey_seed=settings.NATS_NKEY_SEED,
                user_id="svc:llm-service",
                expiry_hours=1
            )
            logger.info("Self-issued JWT generated")

            # Connect with JWT token authentication
            logger.info("Attempting NATS connection with self-issued JWT...")
            self.nc = await nats.connect(
                servers=servers,
                token=jwt_token,  # Send JWT as auth_token
                name="llm-api-service",
                max_reconnect_attempts=-1,  # Infinite reconnection attempts
                reconnect_time_wait=2,  # Wait 2 seconds between reconnections
                tls=tls_ctx,
                error_cb=self._error_callback,
                disconnected_cb=self._disconnected_callback,
                reconnected_cb=self._reconnected_callback,
                closed_cb=self._closed_callback,
            )
            logger.info("NATS connection established!")

            # Initialize JetStream context
            self.js = self.nc.jetstream()

            logger.info("✅ Successfully connected to NATS (LLM_SERVICE account)")

        except Exception as e:
            logger.error(f"❌ Failed to connect to NATS: {e}")
            raise

    async def disconnect(self) -> None:
        """Disconnect from NATS server."""
        if self.nc:
            try:
                # Unsubscribe from all subscriptions
                for sub_name, sub in self._subscriptions.items():
                    logger.info(f"Unsubscribing from: {sub_name}")
                    await sub.unsubscribe()

                # Drain and close connection
                await self.nc.drain()
                await self.nc.close()
                logger.info("✅ Disconnected from NATS")
            except Exception as e:
                logger.error(f"Error disconnecting from NATS: {e}")

    async def subscribe(
        self,
        subject: str,
        handler: Callable,
        queue: Optional[str] = None
    ) -> None:
        """
        Subscribe to a NATS subject.

        Args:
            subject: NATS subject to subscribe to
            handler: Async callback function to handle messages
            queue: Optional queue group name
        """
        if not self.nc:
            raise RuntimeError("NATS client not connected")

        try:
            async def message_handler(msg: Msg):
                """Wrapper to handle message decoding and error handling."""
                try:
                    # Decode JSON payload
                    data = json.loads(msg.data.decode())
                    logger.debug(f"Received message on {msg.subject}: {data}")

                    # Call handler
                    await handler(data, msg)

                except json.JSONDecodeError as e:
                    logger.error(f"Failed to decode JSON message on {msg.subject}: {e}")
                except Exception as e:
                    logger.error(f"Error handling message on {msg.subject}: {e}", exc_info=True)

            # Subscribe with or without queue group
            if queue:
                sub = await self.nc.subscribe(subject, queue=queue, cb=message_handler)
                logger.info(f"✅ Subscribed to '{subject}' with queue '{queue}'")
            else:
                sub = await self.nc.subscribe(subject, cb=message_handler)
                logger.info(f"✅ Subscribed to '{subject}'")

            # Store subscription reference
            self._subscriptions[subject] = sub

        except Exception as e:
            logger.error(f"Failed to subscribe to {subject}: {e}")
            raise

    async def publish(
        self,
        subject: str,
        data: Dict[str, Any]
    ) -> None:
        """
        Publish a message to a NATS subject.

        Args:
            subject: NATS subject to publish to
            data: Dictionary to publish as JSON
        """
        if not self.nc:
            raise RuntimeError("NATS client not connected")

        try:
            # Encode data as JSON
            payload = json.dumps(data).encode()

            # Publish message
            await self.nc.publish(subject, payload)
            logger.debug(f"Published to {subject}: {data}")

        except Exception as e:
            logger.error(f"Failed to publish to {subject}: {e}")
            raise

    async def request(
        self,
        subject: str,
        data: Dict[str, Any],
        timeout: float = 5.0
    ) -> Dict[str, Any]:
        """
        Send a request and wait for reply.

        Args:
            subject: NATS subject to send request to
            data: Dictionary to send as JSON
            timeout: Timeout in seconds

        Returns:
            Reply data as dictionary
        """
        if not self.nc:
            raise RuntimeError("NATS client not connected")

        try:
            # Encode request data
            payload = json.dumps(data).encode()

            # Send request and wait for reply
            msg = await self.nc.request(subject, payload, timeout=timeout)

            # Decode reply
            reply = json.loads(msg.data.decode())
            return reply

        except asyncio.TimeoutError:
            logger.error(f"Request to {subject} timed out after {timeout}s")
            raise
        except Exception as e:
            logger.error(f"Failed to send request to {subject}: {e}")
            raise

    # Connection event callbacks

    async def _error_callback(self, e: Exception) -> None:
        """Handle NATS errors."""
        logger.error(f"NATS error: {e}")

    async def _disconnected_callback(self) -> None:
        """Handle disconnection from NATS."""
        logger.warning("⚠️  Disconnected from NATS server")

    async def _reconnected_callback(self) -> None:
        """Handle reconnection to NATS."""
        logger.info("✅ Reconnected to NATS server")

    async def _closed_callback(self) -> None:
        """Handle NATS connection closure."""
        logger.info("NATS connection closed")
