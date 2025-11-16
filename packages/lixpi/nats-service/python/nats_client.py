"""
NATS Service Client for Python
Shared implementation mirroring TypeScript version with optional self-issued JWT authentication.
"""

import asyncio
import json
import logging
import time
import base64
from typing import Any, Dict, Optional, Callable, List
from enum import Enum

import nats
from nats.aio.client import Client as NATS
from nats.aio.msg import Msg
from nats.js import JetStreamContext
from nkeys import from_seed

logger = logging.getLogger(__name__)


def generate_self_issued_jwt(nkey_seed: str, user_id: str, expiry_hours: int = 1) -> str:
    """
    Generate a self-issued JWT signed with NKey (Ed25519).

    This is optional and only used by services that require self-issued JWT authentication.

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


class PayloadType(str, Enum):
    """Payload encoding types."""
    JSON = "json"
    BUFFER = "buffer"


class SubscriptionType(str, Enum):
    """Subscription types."""
    SUBSCRIBE = "subscribe"
    REPLY = "reply"


class NatsServiceConfig:
    """Configuration for NATS service."""

    def __init__(
        self,
        servers: Optional[List[str]] = None,
        name: Optional[str] = None,
        token: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        nkey_seed: Optional[str] = None,
        user_id: Optional[str] = None,
        tls_ca_cert: Optional[str] = None,
        max_reconnect_attempts: int = -1,
        reconnect_time_wait: int = 2,
    ):
        """
        Initialize NATS service configuration.

        Args:
            servers: List of NATS server URLs
            name: Client name
            token: Auth token (can be regular token or JWT)
            user: Username for basic auth
            password: Password for basic auth
            nkey_seed: NKey seed for self-issued JWT (optional)
            user_id: User ID for JWT subject when using nkey_seed (optional)
            tls_ca_cert: Path to TLS CA certificate (optional)
            max_reconnect_attempts: Maximum reconnection attempts (-1 for infinite)
            reconnect_time_wait: Wait time between reconnections in seconds
        """
        self.servers = servers or ["nats://localhost:4222"]
        self.name = name or "nats-client"
        self.token = token
        self.user = user
        self.password = password
        self.nkey_seed = nkey_seed
        self.user_id = user_id
        self.tls_ca_cert = tls_ca_cert
        self.max_reconnect_attempts = max_reconnect_attempts
        self.reconnect_time_wait = reconnect_time_wait


class NatsService:
    """
    NATS Service client mirroring TypeScript implementation.
    Supports optional self-issued JWT authentication via NKeys.
    """

    _instance: Optional['NatsService'] = None

    def __init__(self, config: NatsServiceConfig):
        """
        Initialize NATS service.

        Args:
            config: NATS service configuration
        """
        self.config = config
        self.nc: Optional[NATS] = None
        self.js: Optional[JetStreamContext] = None
        self._subscriptions: Dict[str, Any] = {}
        self._is_connecting = False
        self._is_monitoring = False

    @classmethod
    def get_instance(cls) -> Optional['NatsService']:
        """Get singleton instance."""
        return cls._instance

    @classmethod
    async def init(cls, config: NatsServiceConfig) -> 'NatsService':
        """
        Initialize singleton instance and connect.

        Args:
            config: NATS service configuration

        Returns:
            NatsService instance
        """
        if not cls._instance:
            cls._instance = cls(config)
            await cls._instance.connect()
        return cls._instance

    async def connect(self, initial_connect_timeout: int = 10) -> None:
        """
        Connect to NATS server.

        Args:
            initial_connect_timeout: Timeout for initial connection in seconds
        """
        if self._is_connecting or self.is_connected():
            return

        self._is_connecting = True

        try:
            logger.info(f"Connecting to NATS servers: {self.config.servers}")

            # Build connection options
            options = {
                "servers": self.config.servers,
                "name": self.config.name,
                "max_reconnect_attempts": self.config.max_reconnect_attempts,
                "reconnect_time_wait": self.config.reconnect_time_wait,
                "error_cb": self._error_callback,
                "disconnected_cb": self._disconnected_callback,
                "reconnected_cb": self._reconnected_callback,
                "closed_cb": self._closed_callback,
            }

            # Handle authentication
            if self.config.nkey_seed and self.config.user_id:
                # Generate self-issued JWT for services that require it
                logger.info("Generating self-issued JWT...")
                jwt_token = generate_self_issued_jwt(
                    nkey_seed=self.config.nkey_seed,
                    user_id=self.config.user_id,
                    expiry_hours=1
                )
                options["token"] = jwt_token
                logger.info(f"Using self-issued JWT for user: {self.config.user_id}")
            elif self.config.token:
                options["token"] = self.config.token
            elif self.config.user and self.config.password:
                options["user"] = self.config.user
                options["password"] = self.config.password

            # Handle TLS if CA cert provided
            if self.config.tls_ca_cert:
                import ssl
                tls_ctx = ssl.create_default_context(purpose=ssl.Purpose.SERVER_AUTH)
                tls_ctx.load_verify_locations(cafile=self.config.tls_ca_cert)
                options["tls"] = tls_ctx
                logger.info("TLS context configured with custom CA cert")

            # Connect to NATS
            self.nc = await asyncio.wait_for(
                nats.connect(**options),
                timeout=initial_connect_timeout
            )

            logger.info(f"✅ Connected to NATS server: {self.nc.connected_url}")

            # Initialize JetStream context
            self.js = self.nc.jetstream()

        except asyncio.TimeoutError:
            logger.error(f"❌ Connection timeout after {initial_connect_timeout}s")
            raise
        except Exception as e:
            logger.error(f"❌ Failed to connect to NATS: {e}")
            raise
        finally:
            self._is_connecting = False

    async def disconnect(self) -> None:
        """Disconnect from NATS server."""
        if self.nc and not self.nc.is_closed:
            try:
                # Unsubscribe from all subscriptions
                for sub_name, sub in list(self._subscriptions.items()):
                    logger.info(f"Unsubscribing from: {sub_name}")
                    await sub.unsubscribe()

                self._subscriptions.clear()

                # Drain and close connection
                await self.nc.drain()
                logger.info("✅ Disconnected from NATS")
            except Exception as e:
                logger.error(f"Error disconnecting from NATS: {e}")

    async def drain(self) -> None:
        """Drain all subscriptions and disconnect."""
        await self.disconnect()

    def is_connected(self) -> bool:
        """Check if connected to NATS."""
        return self.nc is not None and not self.nc.is_closed

    def get_connection(self) -> Optional[NATS]:
        """Get underlying NATS connection."""
        return self.nc

    def publish(self, subject: str, data: Any) -> None:
        """
        Publish JSON data to a subject.

        Args:
            subject: NATS subject to publish to
            data: Data to publish (will be JSON encoded)
        """
        if not self.nc:
            logger.error("NATS client is not connected")
            return

        asyncio.create_task(self._publish_async(subject, data))

    async def _publish_async(self, subject: str, data: Any) -> None:
        """Async publish helper."""
        try:
            payload = json.dumps(data).encode()
            await self.nc.publish(subject, payload)
            logger.debug(f"Published to {subject}: {data}")
        except Exception as e:
            logger.error(f"Failed to publish to {subject}: {e}")

    async def subscribe(
        self,
        subject: str,
        handler: Callable[[Any, Msg], None],
        queue: Optional[str] = None,
        payload_type: PayloadType = PayloadType.JSON
    ) -> Optional[Any]:
        """
        Subscribe to a NATS subject.

        Args:
            subject: NATS subject to subscribe to
            handler: Callback function to handle messages
            queue: Optional queue group name
            payload_type: Payload encoding type

        Returns:
            Subscription object or None
        """
        if not self.nc:
            logger.error("NATS client is not connected")
            return None

        try:
            async def message_handler(msg: Msg):
                """Wrapper to handle message decoding and error handling."""
                try:
                    # Decode payload
                    if payload_type == PayloadType.JSON:
                        data = json.loads(msg.data.decode())
                    else:
                        data = msg.data.decode()

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

            return sub

        except Exception as e:
            logger.error(f"Failed to subscribe to {subject}: {e}")
            raise

    async def request(
        self,
        subject: str,
        data: Any,
        timeout: float = 5.0,
        payload_type: PayloadType = PayloadType.JSON
    ) -> Any:
        """
        Send a request and wait for reply.

        Args:
            subject: NATS subject to send request to
            data: Data to send
            timeout: Timeout in seconds
            payload_type: Payload encoding type

        Returns:
            Reply data
        """
        if not self.nc:
            raise RuntimeError("NATS client not connected")

        try:
            # Encode request data
            if payload_type == PayloadType.JSON:
                payload = json.dumps(data).encode()
            else:
                payload = data.encode() if isinstance(data, str) else data

            # Send request and wait for reply
            msg = await self.nc.request(subject, payload, timeout=timeout)

            # Decode reply
            if payload_type == PayloadType.JSON:
                reply = json.loads(msg.data.decode())
            else:
                reply = msg.data.decode()

            return reply

        except asyncio.TimeoutError:
            logger.error(f"Request to {subject} timed out after {timeout}s")
            raise
        except Exception as e:
            logger.error(f"Failed to send request to {subject}: {e}")
            raise

    async def reply(
        self,
        subject: str,
        handler: Callable[[Any, Msg], Any],
        queue: Optional[str] = None,
        payload_type: PayloadType = PayloadType.JSON
    ) -> Optional[Any]:
        """
        Subscribe to a subject and reply to requests.

        Args:
            subject: NATS subject to subscribe to
            handler: Callback function that returns reply data
            queue: Optional queue group name
            payload_type: Payload encoding type

        Returns:
            Subscription object or None
        """
        if not self.nc:
            logger.error("NATS client is not connected")
            return None

        try:
            async def reply_handler(msg: Msg):
                """Wrapper to handle request/reply pattern."""
                try:
                    # Decode request payload
                    if payload_type == PayloadType.JSON:
                        data = json.loads(msg.data.decode())
                    else:
                        data = msg.data.decode()

                    logger.debug(f"Received request on {msg.subject}: {data}")

                    # Call handler to get reply
                    result = await handler(data, msg)

                    # Encode and send reply
                    if payload_type == PayloadType.JSON:
                        reply_payload = json.dumps(result).encode()
                    else:
                        reply_payload = result.encode() if isinstance(result, str) else result

                    await msg.respond(reply_payload)

                except Exception as e:
                    logger.error(f"Reply error on subject {subject}: {e}")
                    # Send error reply
                    error_reply = {"error": str(e)}
                    await msg.respond(json.dumps(error_reply).encode())

            # Subscribe with or without queue group
            if queue:
                sub = await self.nc.subscribe(subject, queue=queue, cb=reply_handler)
                logger.info(f"✅ Reply handler registered for '{subject}' with queue '{queue}'")
            else:
                sub = await self.nc.subscribe(subject, cb=reply_handler)
                logger.info(f"✅ Reply handler registered for '{subject}'")

            # Store subscription reference
            self._subscriptions[subject] = sub

            return sub

        except Exception as e:
            logger.error(f"Failed to register reply handler for {subject}: {e}")
            raise

    async def unsubscribe_all(self) -> None:
        """Unsubscribe from all subscriptions."""
        for sub_name, sub in list(self._subscriptions.items()):
            try:
                await sub.unsubscribe()
                logger.info(f"Unsubscribed from: {sub_name}")
            except Exception as e:
                logger.error(f"Error unsubscribing from {sub_name}: {e}")

        self._subscriptions.clear()

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
