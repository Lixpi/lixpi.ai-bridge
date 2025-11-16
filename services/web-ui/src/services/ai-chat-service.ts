'use strict'

import { NATS_SUBJECTS } from '@lixpi/constants'
import type { AiModelId, AiInteractionChatSendMessagePayload, AiInteractionChatStopMessagePayload } from '@lixpi/constants'

const { AI_INTERACTION_SUBJECTS } = NATS_SUBJECTS

import AuthService from './auth0-service.ts'
import SegmentsReceiver from '$src/services/segmentsReceiver-service.js'

import { servicesStore } from '$src/stores/servicesStore.ts'
import { userStore } from '$src/stores/userStore.ts'
import { organizationStore } from '$src/stores/organizationStore.ts'
import { documentStore } from '$src/stores/documentStore.ts'


export default class ChatService {
    instanceKey: string
    segmentsReceiver: any

    constructor(instanceKey: string) {
        this.instanceKey = instanceKey
        this.segmentsReceiver = SegmentsReceiver;

        this.initNatsSubscriptions();
    }

    async initNatsSubscriptions() {
        try {
            servicesStore.getData('nats')!.getSubscriptions(['ai.interaction.chat.receiveMessage.*']).forEach(sub => sub.unsubscribe())    // Unsubscribe from all previous subscriptions to avoid duplicate receives

            if (!this.instanceKey)
                throw new Error('aiChat this.instanceKey is `undefined` !!!')

            this.subscribeToChatMessages(this.instanceKey);
        } catch (error) {
            console.error('Failed to initialize NATS service:', error);
        }
    }

    async subscribeToChatMessages(documentId: string) {
        servicesStore.getData('nats')!.subscribe(`${AI_INTERACTION_SUBJECTS.CHAT_SEND_MESSAGE_RESPONSE}.${documentId}`, (data, msg) => {
            this.onChatMessageResponse(data);
        })
    }


    onChatMessageResponse(data) {
        if(data?.error) {
            alert(`Failed to receive chat message: \n${JSON.stringify(data.error)}`)
            return;
        }
        // Backend sends { content: { status, segment, aiProvider }, threadId }
        // Merge threadId into the content object before passing to receiver
        this.segmentsReceiver.receiveSegment({ ...data.content, threadId: data.threadId });
    }

    async sendMessage({ messages, aiModel, threadId }: AiInteractionChatSendMessagePayload) {
        console.log('🚀 [SEND_MESSAGE] START', { threadId, aiModel })

        const organizationId = organizationStore.getData('organizationId')
        const user = userStore.getData()

        const payload = {
            token: await AuthService.getTokenSilently(),
            documentId: this.instanceKey,
            messages,
            aiModel,
            threadId,
            organizationId
        }
        servicesStore.getData('nats')!.publish(AI_INTERACTION_SUBJECTS.CHAT_SEND_MESSAGE, payload)
    }

    async stopMessage({ threadId }: AiInteractionChatStopMessagePayload) {
        console.log('[AI_DBG][SERVICE.stopMessage] called', { documentId: this.instanceKey, threadId })

        const payload = {
            token: await AuthService.getTokenSilently(),
            documentId: this.instanceKey,
            threadId
        }

        servicesStore.getData('nats')!.publish(AI_INTERACTION_SUBJECTS.CHAT_STOP_MESSAGE, payload)
    }

    disconnect() {}
}

