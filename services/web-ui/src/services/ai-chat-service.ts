'use strict'

import { AI_CHAT_SUBJECTS } from '@lixpi/constants'
import type { AiModelId, AiChatSendMessagePayload, AiChatStopMessagePayload } from '@lixpi/constants'

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
            servicesStore.getData('nats')!.getSubscriptions(['aiChat.receiveMessage.*']).forEach(sub => sub.unsubscribe())    // Unsubscribe from all previous subscriptions to avoid duplicate receives

            if (!this.instanceKey)
                throw new Error('aiChat this.instanceKey is `undefined` !!!')

            this.subscribeToChatMessages(this.instanceKey);
        } catch (error) {
            console.error('Failed to initialize NATS service:', error);
        }
    }

    async subscribeToChatMessages(documentId: string) {
        servicesStore.getData('nats')!.subscribe(`${AI_CHAT_SUBJECTS.SEND_MESSAGE_RESPONSE}.${documentId}`, (data, msg) => {
            this.onChatMessageResponse(data);
        })
    }


    onChatMessageResponse(data) {
        if(data?.error) {
            alert(`Failed to receive chat message: \n${JSON.stringify(data.error)}`)
            return;
        }
        this.segmentsReceiver.receiveSegment(data.content);
    }

    async sendMessage({ messages, aiModel, threadId }: AiChatSendMessagePayload) {
        console.log('[AI_DBG][SERVICE.sendMessage] called', { aiModel, threadId, chatContentPreview: (messages||'').slice(0,120), length: messages?.length })
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
        console.log('[AI_DBG][SERVICE.sendMessage] publishing', payload)
        servicesStore.getData('nats')!.publish(AI_CHAT_SUBJECTS.SEND_MESSAGE, payload)
    }

    async stopMessage({ threadId }: AiChatStopMessagePayload) {
        console.log('[AI_DBG][SERVICE.stopMessage] called', { documentId: this.instanceKey, threadId })

        const payload = {
            token: await AuthService.getTokenSilently(),
            documentId: this.instanceKey,
            threadId
        }

        servicesStore.getData('nats')!.publish(AI_CHAT_SUBJECTS.STOP_MESSAGE, payload)
    }

    disconnect() {}
}

