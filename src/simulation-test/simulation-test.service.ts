import { Injectable, Logger } from '@nestjs/common'
import { TenantsService } from '../tenants/tenants.service'
import Redis from 'ioredis'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { SimulateTestDto } from './dto/simulate-test.dto'

@Injectable()
export class SimulationTestService {
  private readonly logger = new Logger(SimulationTestService.name)

  constructor(
    private readonly tenantsService: TenantsService,
    @InjectRedis() private readonly redisClient: Redis,
  ) {}

  /**
   * Simulates a test involving multiple agents, connections, and message exchanges.
   * @param messagesPerConnection - Number of messages per connection.
   * @param timestampTestInterval - Total duration of the test (in milliseconds).
   * @param numAgent - Number of agents to create.
   * @param nameAgent - Base name for the agents.
   * @param messageRate - Optional rate at which messages are sent (in milliseconds).
   * @returns Status of the simulation.
   */
  async simulateTest({
    messagesPerConnection,
    timestampTestInterval,
    numAgent,
    nameAgent,
    messageRate = 100,
  }: SimulateTestDto): Promise<{ status: string }> {
    this.logger.debug('[simulateTest] Starting simulation test...')

    // Step 1: Generate agent IDs and create agents
    const agentIds = await this.createAgents(numAgent, nameAgent)
    this.logger.debug(`[simulateTest] Agents created: ${agentIds.join(', ')}`)

    try {
      // Step 2: Establish connections between all agents
      this.logger.debug('[simulateTest] Establishing connections...')
      await this.connectAllAgents(agentIds)

      // Step 3: Send messages concurrently for the specified duration
      this.logger.debug('[simulateTest] Sending messages...')
      const startTime = Date.now()
      const endTime = startTime + timestampTestInterval

      await Promise.all(
        agentIds.map(async (fromAgent) => {
          let messageCount = 0

          while (Date.now() < endTime) {
            this.logger.debug(`[simulateTest] Agent ${fromAgent} sending batch of messages...`)
            await Promise.all(
              Array.from({ length: messagesPerConnection }, async (_, i) => {
                const toAgent = this.getRandomConnection(fromAgent, agentIds)
                this.logger.log(`[simulateTest] Message #${i} ${_ ?? ''}`)
                try {
                  await this.tenantsService.sendMessage(
                    fromAgent,
                    toAgent,
                    `Message #${++messageCount} from ${fromAgent} to ${toAgent}`,
                  )
                  await new Promise((resolve) => setTimeout(resolve, messageRate))
                  this.logger.log(`[simulateTest] Message #${messageCount} sent from ${fromAgent} to ${toAgent}`)
                } catch (error) {
                  this.logger.error(
                    `[simulateTest] Failed to send message #${messageCount} from ${fromAgent} to ${toAgent}: ${error.message}`,
                  )
                }
                await new Promise((resolve) => setTimeout(resolve, messageRate))
              }),
            )
          }
        }),
      )

      return { status: 'Simulation completed' }
    } catch (error) {
      this.logger.error(`[simulateTest] Simulation test failed: ${error.message}`)
      throw new Error('[simulateTest] Simulation test failed')
    } finally {
      this.logger.debug('[simulateTest] Await 1 minute agents to end...')
      await new Promise((resolve) => setTimeout(resolve, 60000))
      // Step 4: Clean up and delete agents
      this.logger.debug('[simulateTest] Cleaning up agents...')
      for (const agentId of agentIds) {
        try {
          await this.tenantsService.deleteTenant(agentId)
          this.logger.log(`[simulateTest] Agent deleted: ${agentId}`)
        } catch (error) {
          this.logger.error(`[simulateTest] Failed to delete agent ${agentId}: ${error.message}`)
        }
      }
    }
  }

  /**
   * Retrieves all messages stored in Redis.
   * @returns A list of messages with details.
   */
  async getAllMessages(): Promise<any[]> {
    this.logger.debug('[getAllMessages] Fetching all messages from Redis...')
    try {
      const keys = await this.redisClient.keys('message:*')
      const messages = await Promise.all(
        keys.map(async (key) => {
          const message = await this.redisClient.get(key)
          return message ? JSON.parse(message) : null
        }),
      )
      this.logger.log(`[getAllMessages] Fetched ${messages.length} messages.`)
      return messages.filter((message) => message !== null)
    } catch (error) {
      this.logger.error(`[getAllMessages] Error fetching messages: ${error.message}`)
      throw new Error('[getAllMessages] Failed to retrieve messages')
    }
  }

  /**
   * Establishes connections between all agents.
   * @param agentIds - List of agent IDs.
   */
  async connectAllAgents(agentIds: string[]): Promise<void> {
    this.logger.debug('[connectAllAgents] Connecting all agents...')
    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        try {
          await this.tenantsService.createConnection(agentIds[i], agentIds[j])
          this.logger.log(`[connectAllAgents] Connection established between ${agentIds[i]} and ${agentIds[j]}`)
        } catch (error) {
          this.logger.error(`[connectAllAgents] Failed to connect ${agentIds[i]} and ${agentIds[j]}: ${error.message}`)
          throw new Error('[connectAllAgents] Connection setup failed')
        }
      }
    }
  }

  /**
   * Generates and creates agents.
   * @param numAgent - Number of agents.
   * @param nameAgent - Base name for agents.
   * @returns List of agent IDs.
   */
  private async createAgents(numAgent: number, nameAgent: string): Promise<string[]> {
    const agentIds = Array.from({ length: numAgent }, (_, i) => `${nameAgent}-${i + 1}`)
    this.logger.debug(`[createAgents] Generated agent IDs: ${agentIds.join(', ')}`)

    for (const agentId of agentIds) {
      try {
        await this.tenantsService.createTenant(agentId)
        this.logger.log(`[createAgents] Agent created: ${agentId}`)
      } catch (error) {
        this.logger.error(`[createAgents] Failed to create agent ${agentId}: ${error.message}`)
        throw new Error(`[createAgents] Agent creation failed: ${error.message}`)
      }
    }

    return agentIds
  }

  /**
   * Clears all keys from the Redis database.
   */
  async clearDatabase(): Promise<void> {
    try {
      this.logger.log('[clearDatabase] Clearing Redis database...')
      await this.redisClient.flushall()
      this.logger.log('[clearDatabase] Redis database cleared successfully.')
    } catch (error) {
      this.logger.error('[clearDatabase] Failed to clear Redis database:', error.message)
      throw new Error('[clearDatabase] Error clearing Redis database')
    }
  }

  /**
   * Gets a random connection for a specific agent.
   * @param fromAgent - Agent initiating the message.
   * @param agentIds - List of agent IDs.
   * @returns Randomly selected target agent ID.
   */
  private getRandomConnection(fromAgent: string, agentIds: string[]): string {
    const connections = agentIds.filter((agent) => agent !== fromAgent)
    return connections[Math.floor(Math.random() * connections.length)]
  }

  /**
   * Calculates total metrics for all agents based on messages stored in Redis.
   * @returns Total metrics including total messages and average processing time per agent.
   * @throws Error if metrics calculation fails.
   */
  async calculateTotals(): Promise<any> {
    this.logger.debug('Calculating total metrics from Redis...')
    try {
      // Fetch all message keys from Redis
      const keys = await this.redisClient.keys('message:*')

      if (keys.length === 0) {
        this.logger.warn('No messages found in Redis for total metrics calculation.')
        return {}
      }

      const totals: Record<string, { totalMessages: number; averageProcessingTimeMs: number }> = {}

      // Process each message key to calculate totals
      for (const key of keys) {
        const messageData = await this.redisClient.get(key)
        if (messageData) {
          const message = JSON.parse(messageData)
          const { fromTenantId, processingTimeMs } = message

          // Initialize totals for the agent if it doesn't exist
          if (!totals[fromTenantId]) {
            totals[fromTenantId] = { totalMessages: 0, averageProcessingTimeMs: 0 }
          }

          // Update total messages and aggregate processing time
          totals[fromTenantId].totalMessages++
          if (processingTimeMs) {
            totals[fromTenantId].averageProcessingTimeMs += processingTimeMs
          }
        }
      }

      // Calculate average processing time for each agent
      for (const agentId of Object.keys(totals)) {
        const { totalMessages, averageProcessingTimeMs } = totals[agentId]
        if (totalMessages > 0) {
          totals[agentId].averageProcessingTimeMs = Math.round(averageProcessingTimeMs / totalMessages)
        }
      }

      this.logger.log('Total metrics successfully calculated.')
      return totals
    } catch (error) {
      this.logger.error(`Error calculating total metrics: ${error.message}`)
      throw new Error('Failed to calculate total metrics from Redis.')
    }
  }

  /**
   * Calculates metrics grouped by agent based on messages stored in Redis.
   * @returns Metrics grouped by agents, including message details and processing times.
   * @throws Error if metrics calculation fails.
   */
  async calculateMetricsByAgent(): Promise<any> {
    this.logger.debug('Calculating metrics grouped by agent from Redis...')
    try {
      // Fetch all message keys stored in Redis
      const keys = await this.redisClient.keys('message:*')

      if (keys.length === 0) {
        this.logger.warn('No messages found in Redis for metrics calculation.')
        return []
      }

      const metricsByAgent: Record<string, { toTenantId: string; message: string; processingTimeMs: number | null }[]> =
        {}

      // Process each message key to build metrics
      for (const key of keys) {
        const messageData = await this.redisClient.get(key)
        if (messageData) {
          const message = JSON.parse(messageData)
          const { fromTenantId, toTenantId, message: content, processingTimeMs } = message

          // Initialize the agent's metrics group if it doesn't exist
          if (!metricsByAgent[fromTenantId]) {
            metricsByAgent[fromTenantId] = []
          }

          // Add the message details to the agent's metrics group
          metricsByAgent[fromTenantId].push({
            toTenantId,
            message: content,
            processingTimeMs: processingTimeMs || null,
          })
        }
      }

      this.logger.log('Metrics grouped by agent successfully calculated.')
      return metricsByAgent
    } catch (error) {
      this.logger.error(`Error calculating grouped metrics: ${error.message}`)
      throw new Error('Failed to calculate grouped metrics from Redis.')
    }
  }
}
