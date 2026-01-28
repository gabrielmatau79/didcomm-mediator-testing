import { Test, TestingModule } from '@nestjs/testing'
import { SimulationTestService } from './simulation-test.service'
import { TenantsService } from '../tenants/tenants.service'
import Redis from 'ioredis'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'

jest.mock('@openwallet-foundation/askar-nodejs', () => ({ ariesAskar: {} }))

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }))

describe('SimulationTestService', () => {
  let service: SimulationTestService
  let tenantsServiceMock: Partial<TenantsService>
  let redisMock: Redis
  let configServiceMock: ConfigService

  beforeEach(async () => {
    // Mock Redis
    redisMock = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      hgetall: jest.fn(),
      flushall: jest.fn().mockResolvedValue('OK'),
    } as unknown as Redis

    // Mock TenantsService
    tenantsServiceMock = {
      createTenant: jest.fn().mockResolvedValue({ status: 'Tenant created successfully' }),
      deleteTenant: jest.fn().mockResolvedValue({ status: 'Tenant deleted successfully' }),
      createConnection: jest.fn().mockResolvedValue({ status: 'Connection established successfully' }),
      sendMessage: jest.fn().mockResolvedValue({ status: 'Message sent successfully', response: { threadId: '123' } }),
      getConnections: jest.fn().mockResolvedValue([]),
    }

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'appConfig.maxConcurrentMessages':
            return 5
          case 'appConfig.maxConcurrentAgentCreation':
            return 2
          case 'appConfig.agentCleanupDelayMs':
            return 0
          case 'appConfig.reportsDir':
            return '/tmp/reports'
          default:
            return undefined
        }
      }),
    } as unknown as ConfigService

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulationTestService,
        { provide: TenantsService, useValue: tenantsServiceMock },
        { provide: 'default_IORedisModuleConnectionToken', useValue: redisMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile()

    service = module.get<SimulationTestService>(SimulationTestService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('simulateTest', () => {
    it('should start a simulation test and return testId immediately', async () => {
      const config = {
        messagesPerConnection: 3,
        timestampTestInterval: 5000,
        numAgent: 3,
        nameAgent: 'TestAgent',
        testName: 'Load Test',
        testDescription: 'Baseline run',
      }

      const runSimulationSpy = jest.spyOn(service as any, 'runSimulation').mockResolvedValue(undefined)

      const result = await service.simulateTest(config)

      expect(result.status).toBe('Simulation test is running')
      expect(result.testId).toBe('test-uuid')
      expect(redisMock.set).toHaveBeenCalledWith('test:test-uuid', expect.stringContaining('"testName":"Load Test"'))
      expect(runSimulationSpy).toHaveBeenCalled()
    })
  })

  describe('getMessagesByTestId', () => {
    it('should fetch messages by testId using scan helper', async () => {
      const scanSpy = jest
        .spyOn(service as any, 'scanJsonRecords')
        .mockImplementation(async (_pattern: string, onRecord: (record: any) => void) => {
          onRecord({ fromTenantId: 'Agent-1', toTenantId: 'Agent-2', message: 'hello' })
          onRecord({ fromTenantId: 'Agent-2', toTenantId: 'Agent-1', message: 'world' })
        })

      const result = await service.getMessagesByTestId('test-uuid')

      expect(scanSpy).toHaveBeenCalled()
      expect(result).toHaveLength(2)
      expect(result[0].message).toBe('hello')
      expect(result[1].message).toBe('world')
    })
  })

  describe('clearDatabase', () => {
    it('should clear the Redis database', async () => {
      await service.clearDatabase()

      expect(redisMock.flushall).toHaveBeenCalled()
    })
  })

  describe('calculateMetricsByAgent', () => {
    it('should calculate metrics grouped by agent for a test', async () => {
      jest
        .spyOn(service as any, 'scanJsonRecords')
        .mockImplementation(async (_pattern: string, onRecord: (record: any) => void) => {
          onRecord({
            fromTenantId: 'Agent-1',
            toTenantId: 'Agent-2',
            message: 'message-test-1',
            processingTimeMs: 50,
          })
          onRecord({
            fromTenantId: 'Agent-1',
            toTenantId: 'Agent-3',
            message: 'message-test-2',
            processingTimeMs: 30,
          })
        })

      const result = await service.calculateMetricsByAgent('test-uuid')

      expect(result['Agent-1']).toBeDefined()
      expect(result['Agent-1']).toHaveLength(2)
      expect(result['Agent-1'][0].toTenantId).toBe('Agent-2')
    })
  })

  describe('calculateTotals', () => {
    it('should calculate total metrics using aggregated stats', async () => {
      jest.spyOn(redisMock, 'hgetall').mockResolvedValue({ totalMessages: '2', totalProcessingTimeMs: '80' })

      const result = await service.calculateTotals('test-uuid')

      expect(result.totalMessages).toBe(2)
      expect(result.averageProcessingTimeMs).toBe(40)
    })
  })

  describe('generateReport', () => {
    it('should generate a report file for a test', async () => {
      jest
        .spyOn(redisMock, 'get')
        .mockResolvedValueOnce(
          JSON.stringify({ testId: 'test-uuid', testName: 'Load Test', startDate: '2024-01-01T00:00:00Z' }),
        )
      jest.spyOn(service, 'calculateMetricsByAgent').mockResolvedValue({})
      jest.spyOn(service, 'calculateTotals').mockResolvedValue({})

      const mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
      const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)

      const result = await service.generateReport('test-uuid')

      expect(mkdirSpy).toHaveBeenCalled()
      expect(writeSpy).toHaveBeenCalled()
      expect(result.reportPath).toContain('report-test-uuid.json')
    })
  })

  describe('generateConsolidatedReport', () => {
    it('should generate a consolidated report file for a test', async () => {
      jest
        .spyOn(redisMock, 'get')
        .mockResolvedValueOnce(
          JSON.stringify({ testId: 'test-uuid', testName: 'Load Test', startDate: '2024-01-01T00:00:00Z' }),
        )
      jest.spyOn(service, 'calculateTotals').mockResolvedValue({})
      jest.spyOn(service, 'getMessagesByTestId').mockResolvedValue([])

      const mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
      const writeSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)

      const result = await service.generateConsolidatedReport('test-uuid')

      expect(mkdirSpy).toHaveBeenCalled()
      expect(writeSpy).toHaveBeenCalled()
      expect(result.reportPath).toContain('report-test-uuid-consolidated.json')
    })
  })

  describe('getTests', () => {
    it('should fetch test records from Redis', async () => {
      const scanSpy = jest
        .spyOn(service as any, 'scanJsonRecords')
        .mockImplementation(async (_pattern: string, onRecord: (record: any) => void) => {
          onRecord({ testId: 'test-uuid', testName: 'Load Test' })
        })

      const result = await service.getTests()

      expect(scanSpy).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].testId).toBe('test-uuid')
    })
  })

  describe('activateTenantsForTest', () => {
    it('should activate tenants from test record and schedule cleanup', async () => {
      jest
        .spyOn(redisMock, 'get')
        .mockResolvedValueOnce(JSON.stringify({ parameters: { numAgent: 2, nameAgent: 'Agent' } }))
      const createAgentsSpy = jest.spyOn(service as any, 'createAgents').mockResolvedValue(['Agent-1', 'Agent-2'])
      jest.spyOn(global, 'setTimeout')

      const result = await service.activateTenantsForTest('test-uuid', 5000)

      expect(createAgentsSpy).toHaveBeenCalledWith(2, 'Agent')
      expect(result.cleanupDelayMs).toBe(5000)
      expect(result.tenantIds).toEqual(['Agent-1', 'Agent-2'])
    })
  })

  describe('stopSimulation', () => {
    it('should request stop for an active simulation', async () => {
      const stopSignal = { stopRequested: false }
      ;(service as any).activeRuns.set('test-uuid', stopSignal)
      jest.spyOn(service as any, 'updateTestRecord').mockResolvedValue(undefined)

      const result = await service.stopSimulation('test-uuid')

      expect(result.status).toBe('Stop requested')
      expect(stopSignal.stopRequested).toBe(true)
    })
  })
})
