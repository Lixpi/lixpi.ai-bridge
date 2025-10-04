'use strict'

import chalk from 'chalk'

import NATS_Service from '@lixpi/nats-service'
import { log, info, infoStr, warn, err } from '@lixpi/debug-tools'
import { AI_CHAT_SUBJECTS, type AiModelId } from '@lixpi/constants'

import AiModel from '../../models/ai-model.ts'

import OpenAiChatService from '../../services/LLM-providers/OpenAI/chat-service.ts'
import AnthropicChatService from '../../services/LLM-providers/Anthropic/chat-service.ts'

export const aiChatSubjects = [
    {
        subject: AI_CHAT_SUBJECTS.SEND_MESSAGE,
        type: 'subscribe',
        queue: 'aiChat',
        payloadType: 'json',
        permissions: {
            pub: {
                allow: [
                    AI_CHAT_SUBJECTS.SEND_MESSAGE
                ]
            },
            sub: {
                allow: [
                    `${AI_CHAT_SUBJECTS.SEND_MESSAGE_RESPONSE}.>`
                ]
            }
        },
        handler: async (data, msg) => {
            const {
                user: {
                    userId,
                    stripeCustomerId
                },
                aiModel,
                documentId,
                chatContent,
                organizationId
            } = data as { user: { userId: string; stripeCustomerId: string }; aiModel: AiModelId; documentId: string; chatContent: any; organizationId: string }

            const [provider, model] = (aiModel as string).split(':')
            const natsService = await NATS_Service.getInstance();

            // Fetch AI model meta info
            const aiModelMetaInfo = await AiModel.getAiModel({ provider, model, omitPricing: false })

            if (!aiModelMetaInfo || !aiModelMetaInfo.modelVersion) {
                console.error('AI model meta info not found in the database', {aiModel})
                return
            }

            // Anthropic ---------------------------------------------------------------------------------------
            if (provider === 'Anthropic') {
                const anthropicChatService = AnthropicChatService.getInstance(documentId)

                try {
                    // Subscribe to chat content
                    anthropicChatService.subscribeToTokenReceive((content: any, unsubscribe: any) => {
                        natsService.publish(`${AI_CHAT_SUBJECTS.SEND_MESSAGE_RESPONSE}.${documentId}`, { content })

                        if (content.status === 'END_STREAM') {
                            infoStr([
                                chalk.green('Socket.IO -> '),
                                'emitters :: ',
                                chalk.green(AI_CHAT_SUBJECTS.SEND_MESSAGE_RESPONSE),
                                '  :   :: END_STREAM :: unsubscribe() and removeInstance(',
                                documentId,
                                ')'
                            ])
                            unsubscribe();
                            AnthropicChatService.removeInstance(documentId);
                        }
                    });

                    await anthropicChatService.generate({
                        chatContent,
                        aiModelMetaInfo,
                        eventMeta: {
                            userId,
                            stripeCustomerId,
                            organizationId,
                            documentId
                        }
                    })
                } catch (error) {
                    natsService.publish(`${AI_CHAT_SUBJECTS.SEND_MESSAGE_RESPONSE}.${documentId}`, { error: error instanceof Error ? error.message : String(error) })
                }

            }
            // End AI Chat ---------------------------------------------------------------------------------------------------


            // OpenAI ---------------------------------------------------------------------------------------
            if (provider === 'OpenAI') {
                const openAiChatService = OpenAiChatService.getInstance(documentId)

                try {
                    // Subscribe to chat content
                    openAiChatService.subscribeToTokenReceive((content: any, unsubscribe: any) => {
                        natsService.publish(`${AI_CHAT_SUBJECTS.SEND_MESSAGE_RESPONSE}.${documentId}`, { content })

                        if (content.status === 'END_STREAM') {
                            infoStr([
                                chalk.green('Socket.IO -> '),
                                'emitters :: ',
                                chalk.green(AI_CHAT_SUBJECTS.SEND_MESSAGE_RESPONSE),
                                '  :   :: END_STREAM :: unsubscribe() and removeInstance(',
                                documentId,
                                ')'
                            ])
                            unsubscribe();
                            OpenAiChatService.removeInstance(documentId);
                        }
                    });

                    await openAiChatService.generate({
                        chatContent,
                        aiModelMetaInfo,
                        eventMeta: {
                            userId,
                            stripeCustomerId,
                            organizationId,
                            documentId
                        }
                    })

                } catch (error) {
                    natsService.publish(`${AI_CHAT_SUBJECTS.SEND_MESSAGE_RESPONSE}.${documentId}`, { error: error instanceof Error ? error.message : String(error) })
                }
            }
        }
    },
]
