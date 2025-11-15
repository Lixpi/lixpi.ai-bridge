'use strict'

import chalk from 'chalk'

import NATS_Service from '@lixpi/nats-service'
import { log, info, infoStr, warn, err } from '@lixpi/debug-tools'
import { AI_CHAT_SUBJECTS, type AiModelId, type AiChatSendMessagePayload, type AiChatStopMessagePayload } from '@lixpi/constants'

import AiModel from '../../models/ai-model.ts'

// Internal NATS subjects for communication with llm-api service
const LLM_CHAT_PROCESS = 'llm.chat.process'
const LLM_CHAT_STOP = 'llm.chat.stop'
const LLM_CHAT_ERROR = 'llm.chat.error'

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
                messages,
                aiModel,
                threadId,
                documentId,
                organizationId
            } = data as {
                user: { userId: string; stripeCustomerId: string }
                documentId: string
                organizationId: string
            } & AiChatSendMessagePayload

            const [provider, model] = (aiModel as string).split(':')
            const natsService = await NATS_Service.getInstance();

            try {
                // Fetch AI model meta info with pricing (for llm-api service)
                const aiModelMetaInfo = await AiModel.getAiModel({ provider, model, omitPricing: false })

                if (!aiModelMetaInfo || !aiModelMetaInfo.modelVersion) {
                    err('AI model meta info not found in the database', { aiModel })

                    // Publish error directly to client
                    natsService.publish(`${AI_CHAT_SUBJECTS.SEND_MESSAGE_RESPONSE}.${documentId}`, {
                        error: `AI model not found: ${aiModel}`
                    })
                    return
                }

                // One stream per thread - use documentId:threadId as unique key
                const instanceKey = threadId ? `${documentId}:${threadId}` : documentId

                infoStr([
                    chalk.cyan('🚀 [AI_CHAT] GATEWAY'),
                    ' :: Forwarding to llm-api',
                    ' :: instanceKey:',
                    chalk.yellow(instanceKey),
                    ' :: provider:',
                    chalk.green(provider)
                ])

                // Forward request to llm-api service via internal NATS subject
                natsService.publish(LLM_CHAT_PROCESS, {
                    messages,
                    aiModelMetaInfo,
                    threadId,
                    documentId,
                    eventMeta: {
                        userId,
                        stripeCustomerId,
                        organizationId,
                        documentId
                    }
                })

                infoStr([
                    chalk.green('✅ [AI_CHAT] GATEWAY'),
                    ' :: Request forwarded to llm-api',
                    ' :: instanceKey:',
                    chalk.yellow(instanceKey)
                ])

            } catch (error) {
                err('❌ [AI_CHAT] GATEWAY ERROR:', error)

                // Publish error to client
                natsService.publish(`${AI_CHAT_SUBJECTS.SEND_MESSAGE_RESPONSE}.${documentId}`, {
                    error: error instanceof Error ? error.message : String(error)
                })
            }
        }
    },

    // Stop AI message streaming
    {
        subject: AI_CHAT_SUBJECTS.STOP_MESSAGE,
        type: 'subscribe',
        queue: 'aiChat',
        payloadType: 'json',
        permissions: {
            pub: {
                allow: [
                    AI_CHAT_SUBJECTS.STOP_MESSAGE
                ]
            }
        },
        handler: async (data, msg) => {
            const {
                user: {
                    userId
                },
                documentId,
                threadId
            } = data as {
                user: { userId: string }
                documentId: string
            } & AiChatStopMessagePayload

            const natsService = await NATS_Service.getInstance()
            const instanceKey = threadId ? `${documentId}:${threadId}` : documentId

            infoStr([
                chalk.yellow('🛑 [AI_CHAT] GATEWAY'),
                ' :: Relaying STOP to llm-api',
                ' :: instanceKey:',
                chalk.red(instanceKey)
            ])

            // Relay stop request to llm-api service
            natsService.publish(`${LLM_CHAT_STOP}.${instanceKey}`, {
                documentId,
                threadId,
                userId
            })

            infoStr([
                chalk.green('✅ [AI_CHAT] GATEWAY'),
                ' :: STOP request relayed to llm-api',
                ' :: instanceKey:',
                chalk.yellow(instanceKey)
            ])
        }
    },

    // Handle errors from llm-api service
    {
        subject: `${LLM_CHAT_ERROR}.>`,
        type: 'subscribe',
        queue: 'aiChat',
        payloadType: 'json',
        permissions: {
            sub: {
                allow: [
                    `${LLM_CHAT_ERROR}.>`
                ]
            }
        },
        handler: async (data, msg) => {
            const { error, instanceKey } = data as { error: string; instanceKey: string }

            const natsService = await NATS_Service.getInstance()

            // Extract documentId from instanceKey (format: documentId or documentId:threadId)
            const documentId = instanceKey.split(':')[0]

            err('❌ [AI_CHAT] ERROR from llm-api:', { instanceKey, error })

            // Forward error to client
            natsService.publish(`${AI_CHAT_SUBJECTS.SEND_MESSAGE_RESPONSE}.${documentId}`, {
                error
            })
        }
    },
]
