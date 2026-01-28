import { Injectable } from '@nestjs/common'
import { Agent, WsOutboundTransport, AgentEventTypes, ConsoleLogger, LogLevel } from '@credo-ts/core'
import { AskarModule } from '@credo-ts/askar'
import { agentDependencies } from '@credo-ts/node'
import { askar } from '@openwallet-foundation/askar-nodejs'

import { ConnectionsModule, MediationRecipientModule, MediatorPickupStrategy } from '@credo-ts/core'
import { AgentMessageSentEvent, AgentMessageProcessedEvent } from '@credo-ts/core'
import { InjectRedis } from '@nestjs-modules/ioredis'
import * as fs from 'fs'
import Redis from 'ioredis'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class AgentFactory {
  private logDir = `${process.cwd()}/logs_test`
  private logger: ConsoleLogger
  private readonly enableAgentLogs: boolean

  constructor(
    @InjectRedis() private readonly redisClient: Redis,
    private configService: ConfigService,
  ) {
    this.logger = new ConsoleLogger(LogLevel.debug)
    this.enableAgentLogs = this.configService.get<boolean>('appConfig.enableAgentLogs') ?? true
    if (this.enableAgentLogs) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  async createAgent(tenantId: string): Promise<Agent<any>> {
    const logStream = this.enableAgentLogs
      ? fs.createWriteStream(`${this.logDir}/agent_log_${tenantId}.txt`, { flags: 'w' })
      : null
    const logWrite = (message: string) => {
      if (logStream) {
        logStream.write(message.endsWith('\n') ? message : `${message}\n`)
      }
    }

    this.logger.info(`Creating agent for tenant: ${tenantId}`)
    logWrite(`Creating agent for tenant: ${tenantId}`)

    const agentConfig = {
      label: tenantId,
      walletConfig: { id: `WALLET_${tenantId}`, key: `KEY_${tenantId}` },
      //logger: this.logger,
    }

    try {
      const agent = new Agent({
        config: agentConfig,
        dependencies: agentDependencies,
        modules: {
          askar: new AskarModule({ ariesAskar: askar }),
          mediationRecipient: new MediationRecipientModule({
            mediatorPickupStrategy: MediatorPickupStrategy.PickUpV2LiveMode,
          }),
          connections: new ConnectionsModule({ autoAcceptConnections: true }),
        },
      })

      agent.registerOutboundTransport(new WsOutboundTransport())
      await agent.initialize()

      this.logger.info(`Agent for tenant ${tenantId} initialized successfully`)
      logWrite(`Agent for tenant ${tenantId} initialized successfully`)

      if (!(await agent.mediationRecipient.findDefaultMediator())) {
        this.logger.debug(`No default mediator found for tenant: ${tenantId}`)
        logWrite(`No default mediator found for tenant: ${tenantId}`)
        await this.setupMediation(agent, tenantId, logWrite)
      } else {
        this.logger.debug(`Mediation already set up for tenant: ${tenantId}`)
        logWrite(`Mediation already set up for tenant: ${tenantId}`)
      }
      this.registerAgentEvents(agent, tenantId, logWrite)

      return agent
    } catch (error) {
      this.logger.error(`Error initializing agent for tenant ${tenantId}: ${error.message}`)
      logWrite(`Error initializing agent for tenant ${tenantId}: ${error.stack}`)
      throw error
    }
  }

  private async setupMediation(
    agent: Agent<any>,
    tenantId: string,
    logWrite: (message: string) => void,
  ): Promise<void> {
    const publicDid = this.configService.get('appConfig.publicDid')

    if (!publicDid) {
      const error = new Error('Mediator DID URL is not configured')
      this.logger.error(error.message)
      logWrite(`Error: ${error.message}`)
      throw error
    }

    this.logger.debug(`Setting up mediation for tenant: ${tenantId}`)
    logWrite(`Setting up mediation for tenant: ${tenantId}`)

    try {
      const { connectionRecord } = await agent.oob.receiveImplicitInvitation({
        did: publicDid,
        autoAcceptConnection: true,
        autoAcceptInvitation: true,
      })

      if (!connectionRecord) {
        throw new Error('Cannot create connection record')
      }

      const mediatorConnection = await agent.connections.returnWhenIsConnected(connectionRecord.id, {
        timeoutMs: 5000,
      })

      this.logger.debug(`Mediator connection established: ${JSON.stringify(mediatorConnection)}`)
      logWrite(`Mediator connection established: ${JSON.stringify(mediatorConnection)}`)

      const mediationRecord = await agent.mediationRecipient.requestAndAwaitGrant(mediatorConnection)
      this.logger.debug('Mediation granted. Initializing mediator recipient module.')
      logWrite('Mediation granted. Initializing mediator recipient module.')

      await agent.mediationRecipient.setDefaultMediator(mediationRecord)
      await agent.mediationRecipient.initialize()

      this.logger.info(`Tenant ${tenantId} mediation established with DID: ${publicDid}`)
      logWrite(`Tenant ${tenantId} mediation established with DID: ${publicDid}`)
    } catch (error) {
      this.logger.error(`Error during mediation setup for tenant ${tenantId}: ${error.message}`)
      logWrite(`Error during mediation setup for tenant ${tenantId}: ${error.stack}`)
      throw error
    }
  }

  private registerAgentEvents(agent: Agent<any>, tenantId: string, logWrite: (message: string) => void): void {
    this.logger.debug(`Registering events for tenant: ${tenantId}`)
    logWrite(`Registering events for tenant: ${tenantId}`)

    agent.events.on(AgentEventTypes.AgentMessageSent, (data: AgentMessageSentEvent) => {
      const threadId = data.payload.message.message.threadId
      this.logger.debug(`[AgentMessageSent] Tenant: ${tenantId}, ThreadId: ${threadId}`)
      logWrite(`[AgentMessageSent] Tenant: ${tenantId}, ThreadId: ${threadId}`)
    })

    agent.events.on(AgentEventTypes.AgentMessageProcessed, async (data: AgentMessageProcessedEvent) => {
      const threadId = data.payload.message.threadId
      const processedTimestamp = new Date().toISOString()

      this.logger.debug(`[AgentMessageProcessed] Tenant: ${tenantId}, ThreadId: ${threadId}`)
      logWrite(`[AgentMessageProcessed] Tenant: ${tenantId}, ThreadId: ${threadId}`)

      try {
        const testId = await this.redisClient.get(`message-index:${threadId}`)
        const messageKey = testId ? `message:${testId}:${threadId}` : `message:${threadId}`
        const messageData = await this.redisClient.get(messageKey)

        if (messageData) {
          const messageRecord = JSON.parse(messageData)

          // Calculate processing time
          const sentTimestamp = new Date(messageRecord.timestamp).getTime()
          const processedTime = new Date(processedTimestamp).getTime() - sentTimestamp

          // Update the message record
          messageRecord.processedTimestamp = processedTimestamp
          messageRecord.processingTimeMs = processedTime

          await this.redisClient.set(messageKey, JSON.stringify(messageRecord))

          if (messageRecord.testId) {
            const statsKey = `test:${messageRecord.testId}:stats`
            await this.redisClient.hincrby(statsKey, 'totalMessages', 1)
            await this.redisClient.hincrby(statsKey, 'totalProcessingTimeMs', processedTime)
          }

          this.logger.info(
            `Message processed for Tenant: ${tenantId}, ThreadId: ${threadId}, Processing Time: ${processedTime}ms`,
          )
          logWrite(
            `Message processed for Tenant: ${tenantId}, ThreadId: ${threadId}, Processing Time: ${processedTime}ms`,
          )
        } else {
          this.logger.warn(`Message with ThreadId ${threadId} not found in Redis for Tenant: ${tenantId}`)
          logWrite(`Message with ThreadId ${threadId} not found in Redis for Tenant: ${tenantId}`)
        }
      } catch (error) {
        this.logger.error(`Error processing message for Tenant: ${tenantId}, ThreadId: ${threadId}: ${error.message}`)
        logWrite(`Error processing message for Tenant: ${tenantId}, ThreadId: ${threadId}: ${error.message}`)
      }
    })
  }
}
