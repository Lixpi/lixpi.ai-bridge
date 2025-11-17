'use strict'

import { NATS_SUBJECTS } from '@lixpi/constants'
import type { AiModelId, AiInteractionChatSendMessagePayload, AiInteractionChatStopMessagePayload } from '@lixpi/constants'

const { AI_INTERACTION_SUBJECTS } = NATS_SUBJECTS

import AuthService from './auth0-service.ts'
import SegmentsReceiver from '$src/services/segmentsReceiver-service.js'
import { MarkdownStreamParser } from '@lixpi/markdown-stream-parser'

import { servicesStore } from '$src/stores/servicesStore.ts'
import { userStore } from '$src/stores/userStore.ts'
import { organizationStore } from '$src/stores/organizationStore.ts'
import { documentStore } from '$src/stores/documentStore.ts'


export default class ChatService {
    instanceKey: string
    segmentsReceiver: any
    markdownStreamParser: any
    markdownStreamParserUnsubscribe: any
    currentThreadId: string | null
    currentAiProvider: string | null

    constructor(instanceKey: string) {
        this.instanceKey = instanceKey
        this.segmentsReceiver = SegmentsReceiver
        this.currentThreadId = null
        this.currentAiProvider = null

        this.initNatsSubscriptions();
    }

    initMarkdownParser() {
        // Clean up existing parser if any
        if (this.markdownStreamParser) {
            if (this.markdownStreamParserUnsubscribe) {
                this.markdownStreamParserUnsubscribe()
            }
            MarkdownStreamParser.removeInstance(this.instanceKey)
        }

        // Initialize markdown stream parser (exact replication of backend pattern)
        this.markdownStreamParser = MarkdownStreamParser.getInstance(this.instanceKey)

        // Subscribe to parsed segments from the markdown stream parser
        this.markdownStreamParserUnsubscribe = this.markdownStreamParser.subscribeToTokenParse((parsedSegment, unsubscribe) => {
            // Emit parsed content to segmentsReceiver with aiProvider and threadId
            this.segmentsReceiver.receiveSegment({
                ...parsedSegment,
                aiProvider: this.currentAiProvider,
                threadId: this.currentThreadId
            })

            // Cleanup on stream end
            if (parsedSegment.status === 'END_STREAM') {
                unsubscribe()
                MarkdownStreamParser.removeInstance(this.instanceKey)
                this.currentThreadId = null
                this.currentAiProvider = null
            }
        })
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


    onChatMessageResponse(data: any) {
        try {
            if(data?.error) {
                alert(`Failed to receive chat message: \n${JSON.stringify(data.error)}`)
                return;
            }

            console.log('📨 [AI_CHAT] Received message:', { data, content: data?.content, threadId: data?.threadId })

            const { content, threadId } = data
            
            if (!content) {
                console.error('❌ [AI_CHAT] No content in message:', data)
                return
            }

            // Track current threadId and aiProvider for parser callback
            this.currentThreadId = threadId
            if (content.aiProvider) {
                this.currentAiProvider = content.aiProvider
            }

            // Route raw tokens through markdown parser (exact replication of backend pattern)
            if (content.status === 'START_STREAM') {
                console.log('🔵 [AI_CHAT] START_STREAM - initializing parser', { aiProvider: content.aiProvider })
                // Initialize fresh parser instance for this stream
                this.initMarkdownParser()
                // startParsing() will emit START_STREAM event internally via subscribeToTokenParse callback
                this.markdownStreamParser.startParsing()
            } else if (content.status === 'STREAMING' && content.text) {
                console.log('📡 [AI_CHAT] STREAMING - token:', content.text.substring(0, 50))
                // Feed raw token to parser - it will emit parsed segments via subscribeToTokenParse callback
                this.markdownStreamParser.parseToken(content.text)
            } else if (content.status === 'END_STREAM') {
                console.log('🟢 [AI_CHAT] END_STREAM - stopping parser')
                // stopParsing() will emit END_STREAM event internally via subscribeToTokenParse callback
                this.markdownStreamParser.stopParsing()
            }
        } catch (error) {
            console.error('❌ [AI_CHAT] Error in onChatMessageResponse:', error, { data })
            throw error // Re-throw so NATS error handler can log it
        }
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

