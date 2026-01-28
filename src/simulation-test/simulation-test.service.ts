import { Injectable, Logger } from '@nestjs/common'
import { TenantsService } from '../tenants/tenants.service'
import Redis from 'ioredis'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { SimulateTestDto } from './dto/simulate-test.dto'
import { ConfigService } from '@nestjs/config'
import { v4 as uuidv4 } from 'uuid'
import pLimit = require('p-limit')
import * as fs from 'fs'
import * as path from 'path'

@Injectable()
export class SimulationTestService {
  private readonly logger = new Logger(SimulationTestService.name)
  private readonly reportsDir: string
  private readonly activeRuns = new Map<string, { stopRequested: boolean }>()

  constructor(
    private readonly tenantsService: TenantsService,
    @InjectRedis() private readonly redisClient: Redis,
    private readonly configService: ConfigService,
  ) {
    this.reportsDir = this.configService.get<string>('appConfig.reportsDir') || path.join(process.cwd(), 'reports')
  }

  /**
   * Simulates a test involving multiple agents, connections, and message exchanges.
   * @param messagesPerConnection - Number of messages per connection.
   * @param timestampTestInterval - Total duration of the test (in milliseconds).
   * @param numAgent - Number of agents to create.
   * @param nameAgent - Base name for the agents.
   * @param messageRate - Optional rate at which messages are sent (in milliseconds).
   * @param testName - Name of the test.
   * @param testDescription - Optional description of the test.
   * @returns Status of the simulation and the test ID.
   */
  async simulateTest({
    messagesPerConnection,
    timestampTestInterval,
    numAgent,
    nameAgent,
    messageRate = 100,
    testName,
    testDescription,
  }: SimulateTestDto): Promise<{ status: string; testId: string }> {
    this.logger.debug('[simulateTest] Starting simulation test...')

    const testId = uuidv4()
    const stopSignal = { stopRequested: false }
    this.activeRuns.set(testId, stopSignal)
    const startDate = new Date()
    const estimatedEndDate = new Date(startDate.getTime() + timestampTestInterval)

    const testRecord = {
      testId,
      testName,
      testDescription,
      parameters: {
        messagesPerConnection,
        timestampTestInterval,
        numAgent,
        nameAgent,
        messageRate,
      },
      startDate: startDate.toISOString(),
      estimatedEndDate: estimatedEndDate.toISOString(),
      status: 'running',
    }

    await this.redisClient.set(`test:${testId}`, JSON.stringify(testRecord))

    this.runSimulation(
      testId,
      {
        messagesPerConnection,
        timestampTestInterval,
        numAgent,
        nameAgent,
        messageRate,
        testName,
        testDescription,
      },
      stopSignal,
    ).catch(async (error) => {
      this.logger.error(`[simulateTest] Simulation test failed: ${error.message}`)
      await this.updateTestRecord(testId, { status: 'failed', error: error.message })
      this.activeRuns.delete(testId)
    })

    return { status: 'Simulation test is running', testId }
  }

  private async runSimulation(
    testId: string,
    config: SimulateTestDto,
    stopSignal: { stopRequested: boolean },
  ): Promise<void> {
    const { messagesPerConnection, timestampTestInterval, numAgent, nameAgent, messageRate = 100 } = config

    const startTime = Date.now()
    const endTime = startTime + timestampTestInterval
    const maxConcurrentMessages = this.configService.get<number>('appConfig.maxConcurrentMessages') || 5

    let agentIds: string[] = []
    try {
      // Step 1: Generate agent IDs and create agents
      agentIds = await this.createAgents(numAgent, nameAgent)
      this.logger.debug(`[simulateTest] Agents created: ${agentIds.join(', ')}`)
      await new Promise((resolve) => setTimeout(resolve, numAgent * 1000))

      if (stopSignal.stopRequested) {
        await this.updateTestRecord(testId, {
          status: 'stopped',
          endDate: new Date().toISOString(),
        })
        return
      }

      // Step 2: Establish connections between all agents
      this.logger.debug('[simulateTest] Establishing connections...')
      await this.connectAllAgents(agentIds)

      await new Promise((resolve) => setTimeout(resolve, numAgent * 1000))

      if (stopSignal.stopRequested) {
        await this.updateTestRecord(testId, {
          status: 'stopped',
          endDate: new Date().toISOString(),
        })
        return
      }

      // Step 3: Send messages concurrently for the specified duration
      this.logger.debug('[simulateTest] Sending messages...')
      await Promise.all(
        agentIds.map((fromAgent) =>
          this.runMessageInterval({
            testId,
            fromAgent,
            messagesPerConnection,
            messageRate,
            endTime,
            maxConcurrentMessages,
            stopSignal,
          }),
        ),
      )

      await this.updateTestRecord(testId, {
        status: stopSignal.stopRequested ? 'stopped' : 'completed',
        endDate: new Date().toISOString(),
      })
    } catch (error) {
      this.logger.error(`[simulateTest] Simulation test failed: ${error.message}`)
      await this.updateTestRecord(testId, {
        status: 'failed',
        error: error.message,
        endDate: new Date().toISOString(),
      })
    } finally {
      this.activeRuns.delete(testId)
      const cleanupDelayMs = this.configService.get<number>('appConfig.agentCleanupDelayMs') || 0
      this.logger.debug(`cleanupDelayMs: ${cleanupDelayMs}`)
      if (cleanupDelayMs > 0) {
        this.logger.debug(`[simulateTest] Waiting ${cleanupDelayMs}ms before cleanup...`)
        await new Promise((resolve) => setTimeout(resolve, cleanupDelayMs))
      }

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

  private async runMessageInterval({
    testId,
    fromAgent,
    messagesPerConnection,
    messageRate,
    endTime,
    maxConcurrentMessages,
    stopSignal,
  }: {
    testId: string
    fromAgent: string
    messagesPerConnection: number
    messageRate: number
    endTime: number
    maxConcurrentMessages: number
    stopSignal: { stopRequested: boolean }
  }): Promise<void> {
    const limit = pLimit(Math.max(maxConcurrentMessages, 1))
    const activeTasks = new Set<Promise<void>>()
    let messageCount = 0

    return new Promise((resolve) => {
      const queueBatch = () => {
        if (stopSignal.stopRequested || Date.now() >= endTime) {
          return false
        }

        this.logger.debug(`[simulateTest] Agent ${fromAgent} sending batch of messages...`)

        for (let i = 0; i < messagesPerConnection; i++) {
          if (stopSignal.stopRequested) {
            break
          }
          const task = limit(async () => {
            if (stopSignal.stopRequested) {
              return
            }
            const toAgent = await this.getRandomConnection(fromAgent)
            if (!toAgent) {
              return
            }

            const currentMessageCount = ++messageCount

            try {
              await this.tenantsService.sendMessage(
                fromAgent,
                toAgent,
                `Message #${currentMessageCount} from ${fromAgent} to ${toAgent}`,
                testId,
              )
              this.logger.log(
                `[simulateTest] Message #${currentMessageCount} sent from ${fromAgent} to ${toAgent} (testId: ${testId})`,
              )
            } catch (error) {
              this.logger.error(
                `[simulateTest] Failed to send message #${currentMessageCount} from ${fromAgent} to ${toAgent}: ${error.message}`,
              )
            }
          })

          activeTasks.add(task)
          task.finally(() => activeTasks.delete(task))
        }
        return true
      }

      const hasQueued = queueBatch()

      if (!hasQueued) {
        Promise.allSettled(Array.from(activeTasks)).then(() => resolve())
        return
      }

      const intervalId = setInterval(() => {
        if (!queueBatch()) {
          clearInterval(intervalId)
          Promise.allSettled(Array.from(activeTasks)).then(() => resolve())
        }
      }, messageRate)
    })
  }

  /**
   * Retrieves messages stored in Redis for a specific test.
   * @returns A list of messages with details.
   */
  async getMessagesByTestId(testId: string): Promise<any[]> {
    this.logger.debug(`[getMessagesByTestId] Fetching messages for test ${testId} from Redis...`)
    const messages: any[] = []

    try {
      await this.scanJsonRecords(`message:${testId}:*`, (message) => {
        messages.push(message)
      })

      this.logger.log(`[getMessagesByTestId] Fetched ${messages.length} messages for test ${testId}.`)
      return messages
    } catch (error) {
      this.logger.error(`[getMessagesByTestId] Error fetching messages: ${error.message}`)
      throw new Error('[getMessagesByTestId] Failed to retrieve messages')
    }
  }

  /**
   * Establishes connections between all agents.
   * @param agentIds - List of agent IDs.
   */
  async connectAllAgents(agentIds: string[]): Promise<void> {
    this.logger.debug('[connectAllAgents] Connecting all agents with retries...')

    const connectionTasks: Promise<void>[] = []

    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const from = agentIds[i]
        const to = agentIds[j]

        const task = this.retryConnection(from, to, 3)
        connectionTasks.push(task)
      }
    }

    await Promise.all(connectionTasks)

    this.logger.debug('[connectAllAgents] ✅ All connection tasks completed')
  }

  private async retryConnection(from: string, to: string, retries = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.tenantsService.createConnection(from, to)
        this.logger.log(`[connectAllAgents] ✅ Connected ${from} <-> ${to} (attempt ${attempt})`)
        return
      } catch (error) {
        this.logger.warn(`[connectAllAgents] ⚠️ Attempt ${attempt} failed for ${from} -> ${to}: ${error.message}`)
        if (attempt === retries) {
          this.logger.error(`[connectAllAgents] ❌ Failed to connect ${from} and ${to} after ${retries} attempts`)
          throw new Error(`[connectAllAgents] Connection permanently failed between ${from} and ${to}`)
        }

        await new Promise((resolve) => setTimeout(resolve, 2000))
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

    const maxConcurrentAgentCreation = this.configService.get<number>('appConfig.maxConcurrentAgentCreation') || 2
    const limit = pLimit(Math.max(maxConcurrentAgentCreation, 1))

    await Promise.all(
      agentIds.map((agentId) =>
        limit(async () => {
          try {
            await this.tenantsService.createTenant(agentId)
            this.logger.log(`[createAgents] ✅ Agent created: ${agentId}`)
            await new Promise((resolve) => setTimeout(resolve, 1000))
          } catch (error) {
            this.logger.error(`[createAgents] ❌ Failed to create agent ${agentId}: ${error.message}`)
            throw new Error(`[createAgents] Agent creation failed: ${error.message}`)
          }
        }),
      ),
    )

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
  private async getRandomConnection(fromAgent: string): Promise<string | null> {
    const connections = await this.tenantsService.getConnections(fromAgent)

    const completedConnections = connections.filter((conn) => conn.state === 'completed' && conn.theirDid)

    if (completedConnections.length === 0) {
      this.logger.warn(`[getRandomConnection] No completed connections found for ${fromAgent}`)
      return null
    }

    const randomIndex = Math.floor(Math.random() * completedConnections.length)
    const randomConn = completedConnections[randomIndex]

    return randomConn.theirLabel
  }

  /**
   * Calculates total metrics for a test using aggregated stats.
   * @returns Total metrics including total messages and average processing time.
   * @throws Error if metrics calculation fails.
   */
  async calculateTotals(testId: string): Promise<any> {
    this.logger.debug(`[calculateTotals] Calculating total metrics for test ${testId} from Redis...`)

    try {
      const statsKey = `test:${testId}:stats`
      const stats = await this.redisClient.hgetall(statsKey)

      if (!stats || Object.keys(stats).length === 0) {
        this.logger.warn(`[calculateTotals] No stats found in Redis for test ${testId}.`)
        return {}
      }

      const totalMessages = Number(stats.totalMessages || 0)
      const totalProcessingTimeMs = Number(stats.totalProcessingTimeMs || 0)
      const averageProcessingTimeMs = totalMessages > 0 ? Math.round(totalProcessingTimeMs / totalMessages) : 0

      this.logger.log(`[calculateTotals] Total metrics successfully calculated for test ${testId}.`)
      return { totalMessages, averageProcessingTimeMs }
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
  async calculateMetricsByAgent(testId: string): Promise<any> {
    this.logger.debug(`[calculateMetricsByAgent] Calculating metrics for test ${testId} grouped by agent...`)

    try {
      const metricsByAgent: Record<string, { toTenantId: string; message: string; processingTimeMs: number | null }[]> =
        {}

      await this.scanJsonRecords(`message:${testId}:*`, (message) => {
        const { fromTenantId, toTenantId, message: content, processingTimeMs } = message

        if (!metricsByAgent[fromTenantId]) {
          metricsByAgent[fromTenantId] = []
        }

        metricsByAgent[fromTenantId].push({
          toTenantId,
          message: content,
          processingTimeMs: processingTimeMs || null,
        })
      })

      this.logger.log(`[calculateMetricsByAgent] Metrics grouped by agent successfully calculated for ${testId}.`)
      return metricsByAgent
    } catch (error) {
      this.logger.error(`Error calculating grouped metrics: ${error.message}`)
      throw new Error('Failed to calculate grouped metrics from Redis.')
    }
  }

  async generateReport(testId: string): Promise<{ reportPath: string; report: any }> {
    this.logger.debug(`[generateReport] Generating report for test ${testId}...`)
    const testRecordData = await this.redisClient.get(`test:${testId}`)

    if (!testRecordData) {
      throw new Error(`[generateReport] Test ${testId} not found`)
    }

    const testRecord = JSON.parse(testRecordData)
    const metricsByAgent = await this.calculateMetricsByAgent(testId)
    const totals = await this.calculateTotals(testId)

    const report = {
      ...testRecord,
      metricsByAgent,
      totals,
    }

    await fs.promises.mkdir(this.reportsDir, { recursive: true })
    const reportPath = path.join(this.reportsDir, `report-${testId}.json`)
    await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2))

    this.logger.log(`[generateReport] Report generated at ${reportPath}`)
    return { reportPath, report }
  }

  async generateConsolidatedReport(testId: string): Promise<{ reportPath: string; report: any }> {
    this.logger.debug(`[generateConsolidatedReport] Generating consolidated report for test ${testId}...`)
    const testRecordData = await this.redisClient.get(`test:${testId}`)

    if (!testRecordData) {
      throw new Error(`[generateConsolidatedReport] Test ${testId} not found`)
    }

    const testRecord = JSON.parse(testRecordData)
    const totals = await this.calculateTotals(testId)
    const messages = await this.getMessagesByTestId(testId)

    const report = {
      ...testRecord,
      totals,
      messages,
    }

    await fs.promises.mkdir(this.reportsDir, { recursive: true })
    const reportPath = path.join(this.reportsDir, `report-${testId}-consolidated.json`)
    await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2))

    this.logger.log(`[generateConsolidatedReport] Consolidated report generated at ${reportPath}`)
    return { reportPath, report }
  }

  async getTests(): Promise<any[]> {
    this.logger.debug('[getTests] Fetching tests from Redis...')
    const tests: any[] = []

    try {
      await this.scanJsonRecords(
        'test:*',
        (record) => {
          tests.push(record)
        },
        {
          keyFilter: (key) => !key.endsWith(':stats'),
        },
      )

      this.logger.log(`[getTests] Fetched ${tests.length} tests.`)
      return tests
    } catch (error) {
      this.logger.error(`[getTests] Error fetching tests: ${error.message}`)
      throw new Error('[getTests] Failed to retrieve tests')
    }
  }

  async activateTenantsForTest(
    testId: string,
    cleanupDelayMs?: number,
  ): Promise<{ status: string; tenantIds: string[]; cleanupDelayMs: number }> {
    const testRecordData = await this.redisClient.get(`test:${testId}`)
    if (!testRecordData) {
      throw new Error(`[activateTenantsForTest] Test ${testId} not found`)
    }

    const testRecord = JSON.parse(testRecordData)
    const { numAgent, nameAgent } = testRecord.parameters || {}

    if (!numAgent || !nameAgent) {
      throw new Error(`[activateTenantsForTest] Test ${testId} missing parameters`)
    }

    const tenantIds = await this.createAgents(numAgent, nameAgent)

    const delay =
      typeof cleanupDelayMs === 'number'
        ? cleanupDelayMs
        : this.configService.get<number>('appConfig.agentCleanupDelayMs') || 0

    if (delay > 0) {
      this.logger.debug(`[activateTenantsForTest] Scheduling cleanup in ${delay}ms for test ${testId}`)
      setTimeout(() => {
        tenantIds.forEach((tenantId) => {
          this.tenantsService
            .deleteTenant(tenantId)
            .then(() => this.logger.log(`[activateTenantsForTest] Agent deleted: ${tenantId}`))
            .catch((error) =>
              this.logger.error(`[activateTenantsForTest] Failed to delete agent ${tenantId}: ${error.message}`),
            )
        })
      }, delay)
    }

    return { status: 'Tenants activated', tenantIds, cleanupDelayMs: delay }
  }

  async stopSimulation(testId: string): Promise<{ status: string; testId: string }> {
    const run = this.activeRuns.get(testId)

    if (!run) {
      return { status: 'No active simulation for testId', testId }
    }

    run.stopRequested = true
    await this.updateTestRecord(testId, { status: 'stopping' })
    return { status: 'Stop requested', testId }
  }

  private async scanJsonRecords(
    pattern: string,
    onRecord: (record: any) => void,
    options?: { keyFilter?: (key: string) => boolean },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = this.redisClient.scanStream({ match: pattern, count: 1000 })

      stream.on('data', (keys: string[]) => {
        const filteredKeys = options?.keyFilter ? keys.filter(options.keyFilter) : keys
        if (!filteredKeys.length) {
          return
        }

        stream.pause()
        const pipeline = this.redisClient.pipeline()
        filteredKeys.forEach((key) => pipeline.get(key))

        pipeline
          .exec()
          .then((results) => {
            if (!results) {
              return
            }

            results.forEach((result) => {
              const [error, value] = result
              if (error || !value) {
                return
              }

              try {
                onRecord(JSON.parse(value as string))
              } catch (parseError) {
                this.logger.warn(`[scanJsonRecords] Failed to parse record for key pattern ${pattern}`)
              }
            })
          })
          .then(() => stream.resume())
          .catch((error) => {
            stream.destroy(error)
            reject(error)
          })
      })

      stream.on('end', () => resolve())
      stream.on('error', (error) => reject(error))
    })
  }

  private async updateTestRecord(testId: string, updates: Record<string, any>): Promise<void> {
    const existing = await this.redisClient.get(`test:${testId}`)
    if (!existing) {
      return
    }

    const record = JSON.parse(existing)
    await this.redisClient.set(`test:${testId}`, JSON.stringify({ ...record, ...updates }))
  }
}
