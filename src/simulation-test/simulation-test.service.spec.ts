import { Test, TestingModule } from '@nestjs/testing'
import { SimulationTestService } from './simulation-test.service'
import { TenantsService } from '../tenants/tenants.service'
import Redis from 'ioredis'

describe('SimulationTestService', () => {
  let service: SimulationTestService
  let tenantsServiceMock: Partial<TenantsService>
  let redisMock: Redis

  beforeEach(async () => {
    // Mock Redis
    redisMock = new Redis()
    jest.spyOn(redisMock, 'keys').mockResolvedValue(['message:1', 'message:2'])
    jest
      .spyOn(redisMock, 'get')
      .mockResolvedValueOnce(
        JSON.stringify({
          fromTenantId: 'Agent-1',
          toTenantId: 'Agent-2',
          message: 'message-test-1',
          processingTimeMs: 50,
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          fromTenantId: 'Agent-1',
          toTenantId: 'Agent-3',
          message: 'message-test-2',
          processingTimeMs: 30,
        }),
      )
    jest.spyOn(redisMock, 'flushall').mockResolvedValue('OK')

    // Mock TenantsService
    tenantsServiceMock = {
      createTenant: jest.fn().mockResolvedValue({ status: 'Tenant created successfully' }),
      deleteTenant: jest.fn().mockResolvedValue({ status: 'Tenant deleted successfully' }),
      createConnection: jest.fn().mockResolvedValue({ status: 'Connection established successfully' }),
      sendMessage: jest.fn().mockResolvedValue({ status: 'Message sent successfully', response: { threadId: '123' } }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulationTestService,
        { provide: TenantsService, useValue: tenantsServiceMock },
        { provide: 'default_IORedisModuleConnectionToken', useValue: redisMock },
      ],
    }).compile()

    service = module.get<SimulationTestService>(SimulationTestService)
  })

  afterEach(() => {
    jest.clearAllMocks()
    redisMock.quit()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('simulateTest', () => {
    it('should start a simulation test', async () => {
      const config = {
        messagesPerConnection: 10,
        timestampTestInterval: 5000,
        numAgent: 3,
        nameAgent: 'TestAgent',
      }

      const result = await service.simulateTest(config)

      expect(result.status).toBe('Simulation completed')
      expect(tenantsServiceMock.createTenant).toHaveBeenCalledTimes(3)
      expect(tenantsServiceMock.createConnection).toHaveBeenCalled()
    }, 20000) // Increased timeout
  })

  describe('getAllMessages', () => {
    it('should fetch all messages from Redis', async () => {
      const result = await service.getAllMessages()

      expect(result).toHaveLength(2)
      expect(result[0].message).toBe('message-test-1')
      expect(result[1].message).toBe('message-test-2')
    })
  })

  describe('clearDatabase', () => {
    it('should clear the Redis database', async () => {
      await service.clearDatabase()

      expect(redisMock.flushall).toHaveBeenCalled()
    })
  })

  describe('calculateMetricsByAgent', () => {
    it('should calculate metrics grouped by agent', async () => {
      const result = await service.calculateMetricsByAgent()

      expect(result['Agent-1']).toBeDefined()
      expect(result['Agent-1']).toHaveLength(2)
      expect(result['Agent-1'][0].toTenantId).toBe('Agent-2')
    })
  })

  describe('calculateTotals', () => {
    it('should calculate total metrics', async () => {
      jest
        .spyOn(redisMock, 'get')
        .mockResolvedValueOnce(JSON.stringify({ fromTenantId: 'Agent-1', processingTimeMs: 50 }))
        .mockResolvedValueOnce(JSON.stringify({ fromTenantId: 'Agent-1', processingTimeMs: 30 }))

      const result = await service.calculateTotals()

      expect(result['Agent-1']).toBeDefined()
      expect(result['Agent-1'].totalMessages).toBe(2)
      expect(result['Agent-1'].averageProcessingTimeMs).toBe(40)
    })
  })
})
