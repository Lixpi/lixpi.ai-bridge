"""
Provider registry for managing LLM provider instances.
Handles instance lifecycle, NATS subscriptions, and routing.
"""

import logging
from typing import Dict, Optional

from lixpi_constants import NATS_SUBJECTS
from nats_client.client import NatsClient
from providers.openai.provider import OpenAIProvider
from providers.anthropic.provider import AnthropicProvider
from services.usage_reporter import UsageReporter

logger = logging.getLogger(__name__)

# Extract AI interaction subjects
AI_INTERACTION_SUBJECTS = NATS_SUBJECTS["AI_INTERACTION_SUBJECTS"]
CHAT_PROCESS = AI_INTERACTION_SUBJECTS["CHAT_PROCESS"]
CHAT_STOP = AI_INTERACTION_SUBJECTS["CHAT_STOP"]
CHAT_ERROR = AI_INTERACTION_SUBJECTS["CHAT_ERROR"]


class ProviderRegistry:
    """
    Manages LLM provider instances and handles NATS message routing.
    """

    def __init__(self, nats_client: NatsClient):
        """
        Initialize provider registry.

        Args:
            nats_client: NATS client instance
        """
        self.nats_client = nats_client
        self.usage_reporter = UsageReporter(nats_client)

        # Instance registry: {documentId:threadId -> Provider instance}
        self.instances: Dict[str, any] = {}

    async def initialize(self) -> None:
        """Initialize NATS subscriptions for LLM operations."""
        logger.info("Initializing provider registry...")

        # Subscribe to chat processing requests
        await self.nats_client.subscribe(
            CHAT_PROCESS,
            self._handle_chat_process,
            queue="llm-workers"
        )

        # Subscribe to stop requests (wildcard)
        await self.nats_client.subscribe(
            f"{CHAT_STOP}.>",
            self._handle_chat_stop
        )

        logger.info("✅ Provider registry initialized")

    async def shutdown(self) -> None:
        """Shutdown all active provider instances."""
        logger.info("Shutting down provider registry...")

        # Stop all active instances
        for instance_key, provider in list(self.instances.items()):
            logger.info(f"Stopping instance: {instance_key}")
            await provider.stop()

        self.instances.clear()
        logger.info("✅ Provider registry shutdown complete")

    async def _handle_chat_process(self, data: Dict, msg) -> None:
        """
        Handle incoming chat processing request from services/api.

        Args:
            data: Request payload containing messages, model info, etc.
            msg: NATS message
        """
        try:
            # Extract request data
            document_id = data.get('documentId')
            thread_id = data.get('threadId', '')
            ai_model_meta_info = data.get('aiModelMetaInfo', {})
            provider_name = ai_model_meta_info.get('provider')

            if not document_id:
                logger.error("Missing documentId in request")
                return

            if not provider_name:
                logger.error("Missing provider in aiModelMetaInfo")
                return

            # Create instance key
            instance_key = f"{document_id}:{thread_id}" if thread_id else document_id

            logger.info(f"Processing chat request for {instance_key} using {provider_name}")

            # Get or create provider instance
            provider = self._get_or_create_instance(instance_key, provider_name)

            # Process the request through LangGraph workflow
            await provider.process(data)

            # Remove instance after completion
            self._remove_instance(instance_key)

        except Exception as e:
            logger.error(f"Error handling chat process: {e}", exc_info=True)

            # Publish error back to services/api
            instance_key = data.get('documentId', 'unknown')
            await self.nats_client.publish(
                f"{CHAT_ERROR}.{instance_key}",
                {
                    'error': str(e),
                    'instanceKey': instance_key
                }
            )

    async def _handle_chat_stop(self, data: Dict, msg) -> None:
        """
        Handle request to stop streaming.

        Args:
            data: Request payload
            msg: NATS message
        """
        try:
            # Extract instance key from subject (ai.interaction.chat.stop.{instanceKey})
            subject_parts = msg.subject.split('.')
            if len(subject_parts) >= 5:
                instance_key = '.'.join(subject_parts[4:])
            else:
                instance_key = data.get('instanceKey', data.get('documentId', ''))

            logger.info(f"Received stop request for {instance_key}")

            # Find and stop the instance
            provider = self.instances.get(instance_key)
            if provider:
                await provider.stop()
                logger.info(f"✅ Stopped instance: {instance_key}")
            else:
                logger.warning(f"Instance not found: {instance_key}")

        except Exception as e:
            logger.error(f"Error handling chat stop: {e}", exc_info=True)

    def _get_or_create_instance(self, instance_key: str, provider_name: str):
        """
        Get existing provider instance or create a new one.

        Args:
            instance_key: Unique instance identifier
            provider_name: Provider name ('OpenAI' or 'Anthropic')

        Returns:
            Provider instance
        """
        # Return existing instance if available
        if instance_key in self.instances:
            logger.info(f"Reusing existing instance: {instance_key}")
            return self.instances[instance_key]

        # Create new instance
        logger.info(f"Creating new {provider_name} instance: {instance_key}")

        if provider_name == 'OpenAI':
            provider = OpenAIProvider(
                instance_key,
                self.nats_client,
                self.usage_reporter
            )
        elif provider_name == 'Anthropic':
            provider = AnthropicProvider(
                instance_key,
                self.nats_client,
                self.usage_reporter
            )
        else:
            raise ValueError(f"Unsupported provider: {provider_name}")

        # Store instance
        self.instances[instance_key] = provider

        return provider

    def _remove_instance(self, instance_key: str) -> None:
        """
        Remove a provider instance from the registry.

        Args:
            instance_key: Instance identifier
        """
        if instance_key in self.instances:
            logger.info(f"Removing instance: {instance_key}")
            del self.instances[instance_key]
