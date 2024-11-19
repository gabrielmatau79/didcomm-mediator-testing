import { Injectable, Logger } from '@nestjs/common'
import { TenantsService } from '../tenants/tenants.service'
import Redis from 'ioredis'
import { InjectRedis } from '@nestjs-modules/ioredis'

@Injectable()
export class SimulationTestService {
  private readonly logger = new Logger(SimulationTestService.name)

  constructor(
    private readonly tenantsService: TenantsService,
    @InjectRedis() private readonly redisClient: Redis,
  ) {}

  /**
   * Simulate a test involving multiple agents, connections, and concurrent message exchanges.
   * @param mensajesPeerConnection Number of messages per connection.
   * @param timestampTestInterval Total duration of the test (ms).
   * @param numAgent Number of agents to create.
   * @param nameAgent Base name for the agents.
   * @returns Metrics of the simulation.
   */
  async simulateTest({
    messagesPerConnection,
    timestampTestInterval,
    numAgent,
    nameAgent,
    messageRate = 100,
  }: {
    messagesPerConnection: number
    timestampTestInterval: number
    numAgent: number
    nameAgent: string
    messageRate?: number
  }): Promise<{ status: string }> {
    this.logger.debug('Starting simulation test...')

    // Step 1: Generate agent IDs based on numAgent and nameAgent
    const agentIds = await this.createAgents(numAgent, nameAgent)

    this.logger.debug(`Agents involved in simulation: ${agentIds}`)

    try {
      // Step 2: Establish connections between all agents
      this.logger.debug('Establishing connections...')
      await this.connectAllAgents(agentIds)

      // Step 3: Send messages concurrently within the total duration
      this.logger.debug('Sending messages concurrently...')

      const startTime = Date.now()
      const endTime = startTime + timestampTestInterval

      await Promise.all(
        agentIds.map(async (fromAgent) => {
          let messageCount = 0

          while (Date.now() < endTime) {
            this.logger.debug(`Agent ${fromAgent} sending messages batch...`)

            this.logger.debug(`messagesPeerConnection value: ${messagesPerConnection}`)

            await Promise.all(
              Array.from({ length: messagesPerConnection }, async (_, i) => {
                this.logger.debug(`messagesPeerConnection ${fromAgent} `)
                const toAgent = this.getRandomConnection(fromAgent, agentIds)

                try {
                  await this.tenantsService.sendMessage(
                    fromAgent,
                    toAgent,
                    `Message #${++messageCount} from ${fromAgent} to ${toAgent}`,
                  )
                  this.logger.log(`Message #${messageCount} sent successfully from ${fromAgent} to ${toAgent}`)
                  await new Promise((resolve) => setTimeout(resolve, messageRate))
                } catch (error) {
                  this.logger.error(
                    `Failed to send message #${messageCount} from ${fromAgent} to ${toAgent}: ${error.message}`,
                  )
                }
              }),
            )

            // Pause between batches
            await new Promise((resolve) => setTimeout(resolve, messageRate))
          }
        }),
      )

      return {
        status: 'Simulation completed',
      }
    } catch (error) {
      this.logger.error('Simulation test failed:', error)
      throw new Error('Simulation test failed')
    } finally {
      // Step 4: Clean up and delete agents sequentially
      this.logger.debug('Deleting agents...')
      for (const agentId of agentIds) {
        try {
          await this.tenantsService.deleteTenant(agentId)
          this.logger.log(`Agent deleted: ${agentId}`)
        } catch (error) {
          this.logger.error(`Failed to delete agent ${agentId}: ${error.message}`)
        }
      }
    }
  }

  /**
   * Retrieve all messages stored in Redis.
   * @returns List of all messages with their details.
   */
  async getAllMessages(): Promise<any[]> {
    this.logger.debug('Fetching all messages from Redis...')
    try {
      // Fetch all keys matching the message pattern
      const keys = await this.redisClient.keys('message:*')

      // Retrieve and parse each message
      const messages = await Promise.all(
        keys.map(async (key) => {
          const message = await this.redisClient.get(key)
          return message ? JSON.parse(message) : null
        }),
      )

      // Filter out any null values (in case of errors or missing messages)
      const filteredMessages = messages.filter((message) => message !== null)

      this.logger.log(`Fetched ${filteredMessages.length} messages from Redis`)
      return filteredMessages
    } catch (error) {
      this.logger.error(`Error fetching messages from Redis: ${error.message}`)
      throw new Error('Failed to retrieve messages from Redis')
    }
  }

  async connectAllAgents(agentIds: string[]): Promise<void> {
    this.logger.debug('Establishing connections between all agents...')
    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const fromAgent = agentIds[i]
        const toAgent = agentIds[j]

        try {
          await this.tenantsService.createConnection(fromAgent, toAgent)
          this.logger.log(`Connection established between ${fromAgent} and ${toAgent}`)
        } catch (error) {
          this.logger.error(`Failed to establish connection between ${fromAgent} and ${toAgent}: ${error.message}`)
          throw new Error(`Connection establishment failed between ${fromAgent} and ${toAgent}: ${error.message}`)
        }
      }
    }
  }

  /**
   * Get a random connection from the list of connections for an agent.
   * Ensures the connection is valid and does not include the sender agent.
   * @param fromAgent The ID of the sender agent.
   * @param agentIds List of all agent IDs.
   * @returns A randomly selected agent ID to send the message.
   */
  private getRandomConnection(fromAgent: string, agentIds: string[]): string {
    const possibleConnections = agentIds.filter((agent) => agent !== fromAgent)
    const randomIndex = Math.floor(Math.random() * possibleConnections.length)
    return possibleConnections[randomIndex]
  }

  async calculateMetricsByAgent(): Promise<any> {
    this.logger.debug('Calculating metrics grouped by agent from Redis...')
    try {
      // Fetch all message keys
      const keys = await this.redisClient.keys('message:*')

      if (keys.length === 0) {
        this.logger.warn('No messages found in Redis for statistics')
        return []
      }

      const metricsByAgent: Record<string, { toTenantId: string; message: string; processingTimeMs: number | null }[]> =
        {}

      // Process each message
      for (const key of keys) {
        const messageData = await this.redisClient.get(key)
        if (messageData) {
          const message = JSON.parse(messageData)
          const { fromTenantId, toTenantId, message: content, processingTimeMs } = message

          // Initialize the agent group if it doesn't exist
          if (!metricsByAgent[fromTenantId]) {
            metricsByAgent[fromTenantId] = []
          }

          // Add the message details to the agent's group
          metricsByAgent[fromTenantId].push({
            toTenantId,
            message: content,
            processingTimeMs: processingTimeMs || null,
          })
        }
      }

      this.logger.log('Metrics grouped by agent successfully calculated')
      return metricsByAgent
    } catch (error) {
      this.logger.error(`Error calculating grouped metrics: ${error.message}`)
      throw new Error('Failed to calculate grouped metrics from Redis')
    }
  }

  async calculateTotals(): Promise<any> {
    this.logger.debug('Calculating total metrics from Redis...')
    try {
      // Fetch all message keys
      const keys = await this.redisClient.keys('message:*')

      if (keys.length === 0) {
        this.logger.warn('No messages found in Redis for statistics')
        return {}
      }

      const totals: Record<string, { totalMessages: number; averageProcessingTimeMs: number }> = {}

      // Process each message
      for (const key of keys) {
        const messageData = await this.redisClient.get(key)
        if (messageData) {
          const message = JSON.parse(messageData)
          const { fromTenantId, processingTimeMs } = message

          // Initialize totals for the agent if it doesn't exist
          if (!totals[fromTenantId]) {
            totals[fromTenantId] = { totalMessages: 0, averageProcessingTimeMs: 0 }
          }

          totals[fromTenantId].totalMessages++
          if (processingTimeMs) {
            totals[fromTenantId].averageProcessingTimeMs += processingTimeMs
          }
        }
      }

      // Calculate average processing times
      for (const agentId of Object.keys(totals)) {
        const { totalMessages, averageProcessingTimeMs } = totals[agentId]
        if (totalMessages > 0) {
          totals[agentId].averageProcessingTimeMs = Math.round(averageProcessingTimeMs / totalMessages)
        }
      }

      this.logger.log('Total metrics successfully calculated')
      return totals
    } catch (error) {
      this.logger.error(`Error calculating total metrics: ${error.message}`)
      throw new Error('Failed to calculate total metrics from Redis')
    }
  }

  /**
   * Generates and creates agents.
   * @param numAgent - Number of agents to create.
   * @param nameAgent - Base name for the agents.
   * @returns A list of agent IDs.
   */
  private async createAgents(numAgent: number, nameAgent: string): Promise<string[]> {
    const agentIds = Array.from({ length: numAgent }, (_, i) => `${nameAgent}-${i + 1}`)
    this.logger.debug(`Generated agent IDs: ${agentIds.join(', ')}`)

    this.logger.debug('Creating agents...')
    for (const agentId of agentIds) {
      try {
        await this.tenantsService.createTenant(agentId, {})
        this.logger.log(`Agent created: ${agentId}`)
      } catch (error) {
        this.logger.error(`Failed to create agent ${agentId}: ${error.message}`)
        throw new Error(`Agent creation failed: ${error.message}`)
      }
    }

    return agentIds
  }
}
