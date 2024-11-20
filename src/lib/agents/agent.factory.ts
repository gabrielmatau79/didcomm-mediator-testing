import { Injectable } from '@nestjs/common'
import { Agent, WsOutboundTransport, AgentEventTypes, ConsoleLogger, LogLevel } from '@credo-ts/core'
import { AskarModule } from '@credo-ts/askar'
import { agentDependencies } from '@credo-ts/node'
import { ariesAskar } from '@hyperledger/aries-askar-nodejs'
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

  constructor(
    @InjectRedis() private readonly redisClient: Redis,
    private configService: ConfigService,
  ) {
    this.logger = new ConsoleLogger(LogLevel.debug)
    fs.mkdirSync(this.logDir, { recursive: true })
  }

  async createAgent(tenantId: string): Promise<Agent<any>> {
    const logFilePath = `${this.logDir}/agent_log_${tenantId}.txt`
    const logStream = fs.createWriteStream(logFilePath, { flags: 'w' })

    this.logger.info(`Creating agent for tenant: ${tenantId}`)
    logStream.write(`Creating agent for tenant: ${tenantId}\n`)

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
          askar: new AskarModule({ ariesAskar }),
          mediationRecipient: new MediationRecipientModule({
            mediatorPickupStrategy: MediatorPickupStrategy.PickUpV2LiveMode,
          }),
          connections: new ConnectionsModule({ autoAcceptConnections: true }),
        },
      })

      agent.registerOutboundTransport(new WsOutboundTransport())
      await agent.initialize()

      this.logger.info(`Agent for tenant ${tenantId} initialized successfully`)
      logStream.write(`Agent for tenant ${tenantId} initialized successfully\n`)

      if (!(await agent.mediationRecipient.findDefaultMediator())) {
        this.logger.debug(`No default mediator found for tenant: ${tenantId}`)
        logStream.write(`No default mediator found for tenant: ${tenantId}`)
        await this.setupMediation(agent, tenantId, logStream)
      } else {
        this.logger.debug(`Mediation already set up for tenant: ${tenantId}`)
        logStream.write(`Mediation already set up for tenant: ${tenantId}\n`)
      }
      agent.wallet.delete
      this.registerAgentEvents(agent, tenantId, logStream)

      return agent
    } catch (error) {
      this.logger.error(`Error initializing agent for tenant ${tenantId}: ${error.message}`)
      logStream.write(`Error initializing agent for tenant ${tenantId}: ${error.stack}\n`)
      throw error
    }
  }

  private async setupMediation(agent: Agent<any>, tenantId: string, logStream: fs.WriteStream): Promise<void> {
    const publicDid = this.configService.get('appConfig.publicDid')

    if (!publicDid) {
      const error = new Error('Mediator DID URL is not configured')
      this.logger.error(error.message)
      logStream.write(`Error: ${error.message}\n`)
      throw error
    }

    this.logger.debug(`Setting up mediation for tenant: ${tenantId}`)
    logStream.write(`Setting up mediation for tenant: ${tenantId}\n`)

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
      logStream.write(`Mediator connection established: ${JSON.stringify(mediatorConnection)}\n`)

      const mediationRecord = await agent.mediationRecipient.requestAndAwaitGrant(mediatorConnection)
      this.logger.debug('Mediation granted. Initializing mediator recipient module.')
      logStream.write('Mediation granted. Initializing mediator recipient module.\n')

      await agent.mediationRecipient.setDefaultMediator(mediationRecord)
      await agent.mediationRecipient.initialize()

      this.logger.info(`Tenant ${tenantId} mediation established with DID: ${publicDid}`)
      logStream.write(`Tenant ${tenantId} mediation established with DID: ${publicDid}\n`)
    } catch (error) {
      this.logger.error(`Error during mediation setup for tenant ${tenantId}: ${error.message}`)
      logStream.write(`Error during mediation setup for tenant ${tenantId}: ${error.stack}\n`)
      throw error
    }
  }

  private registerAgentEvents(agent: Agent<any>, tenantId: string, logStream: fs.WriteStream): void {
    this.logger.debug(`Registering events for tenant: ${tenantId}`)
    logStream.write(`Registering events for tenant: ${tenantId}\n`)

    agent.events.on(AgentEventTypes.AgentMessageSent, (data: AgentMessageSentEvent) => {
      const threadId = data.payload.message.message.threadId
      this.logger.debug(`[AgentMessageSent] Tenant: ${tenantId}, ThreadId: ${threadId}`)
      logStream.write(`[AgentMessageSent] Tenant: ${tenantId}, ThreadId: ${threadId}\n`)
    })

    agent.events.on(AgentEventTypes.AgentMessageProcessed, async (data: AgentMessageProcessedEvent) => {
      const threadId = data.payload.message.threadId
      const processedTimestamp = new Date().toISOString()

      this.logger.debug(`[AgentMessageProcessed] Tenant: ${tenantId}, ThreadId: ${threadId}`)
      logStream.write(`[AgentMessageProcessed] Tenant: ${tenantId}, ThreadId: ${threadId}\n`)

      try {
        // Retrieve message record from Redis
        const messageKey = `message:${threadId}`
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

          this.logger.info(
            `Message processed for Tenant: ${tenantId}, ThreadId: ${threadId}, Processing Time: ${processedTime}ms`,
          )
          logStream.write(
            `Message processed for Tenant: ${tenantId}, ThreadId: ${threadId}, Processing Time: ${processedTime}ms\n`,
          )
        } else {
          this.logger.warn(`Message with ThreadId ${threadId} not found in Redis for Tenant: ${tenantId}`)
          logStream.write(`Message with ThreadId ${threadId} not found in Redis for Tenant: ${tenantId}\n`)
        }
      } catch (error) {
        this.logger.error(`Error processing message for Tenant: ${tenantId}, ThreadId: ${threadId}: ${error.message}`)
        logStream.write(`Error processing message for Tenant: ${tenantId}, ThreadId: ${threadId}: ${error.message}\n`)
      }
    })
  }
}
