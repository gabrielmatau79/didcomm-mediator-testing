import { Test, TestingModule } from '@nestjs/testing'
import { SimulationTestController } from './simulation-test.controller'
import { SimulationTestService } from './simulation-test.service'

jest.mock('@openwallet-foundation/askar-nodejs', () => ({ ariesAskar: {} }))

describe('SimulationTestController', () => {
  let controller: SimulationTestController
  let service: SimulationTestService

  beforeEach(async () => {
    const serviceMock = {
      simulateTest: jest.fn().mockResolvedValue({ status: 'Simulation test is running', testId: 'test-uuid' }),
      getMessagesByTestId: jest.fn().mockResolvedValue([]),
      calculateMetricsByAgent: jest.fn().mockResolvedValue({}),
      calculateTotals: jest.fn().mockResolvedValue({}),
      getTests: jest.fn().mockResolvedValue([]),
      activateTenantsForTest: jest.fn().mockResolvedValue({
        status: 'Tenants activated',
        tenantIds: ['Agent-1'],
        cleanupDelayMs: 10000,
      }),
      stopSimulation: jest.fn().mockResolvedValue({ status: 'Stop requested', testId: 'test-uuid' }),
      generateConsolidatedReport: jest.fn().mockResolvedValue({ reportPath: '/tmp/report-test-uuid.json' }),
      generateReport: jest.fn().mockResolvedValue({ reportPath: '/tmp/report-test-uuid.json' }),
      clearDatabase: jest.fn().mockResolvedValue({ status: 'Database cleared' }),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulationTestController],
      providers: [
        {
          provide: SimulationTestService,
          useValue: serviceMock,
        },
      ],
    }).compile()

    controller = module.get<SimulationTestController>(SimulationTestController)
    service = module.get<SimulationTestService>(SimulationTestService)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('simulate', () => {
    it('should trigger simulation test and return immediate response', async () => {
      const config = {
        messagesPerConnection: 10,
        timestampTestInterval: 60000,
        numAgent: 3,
        nameAgent: 'TestAgent',
        testName: 'Load Test',
      }
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      await controller.simulate(config, mockResponse as any)

      expect(service.simulateTest).toHaveBeenCalledWith(config)
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'Simulation test is running', testId: 'test-uuid' })
    })
  })

  describe('getMessagesByTestId', () => {
    it('should return messages for a test', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      await controller.getMessagesByTestId('test-uuid', mockResponse as any)

      expect(service.getMessagesByTestId).toHaveBeenCalledWith('test-uuid')
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'success', messages: [] })
    })
  })

  describe('getMetrics', () => {
    it('should return metrics for a test', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      await controller.getMetrics('test-uuid', mockResponse as any)

      expect(service.calculateMetricsByAgent).toHaveBeenCalledWith('test-uuid')
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'success', metrics: {} })
    })
  })

  describe('getTotals', () => {
    it('should return totals for a test', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      await controller.getTotals('test-uuid', mockResponse as any)

      expect(service.calculateTotals).toHaveBeenCalledWith('test-uuid')
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'success', totals: {} })
    })
  })

  describe('clearDatabase', () => {
    it('should clear the database and return success response', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      await controller.clearDatabase(mockResponse as any)

      expect(service.clearDatabase).toHaveBeenCalled()
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'success', message: 'Database cleared successfully.' })
    })
  })

  describe('getTests', () => {
    it('should return all tests', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      await controller.getTests(mockResponse as any)

      expect(service.getTests).toHaveBeenCalled()
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'success', tests: [] })
    })
  })

  describe('activateTenants', () => {
    it('should activate tenants for a test', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      await controller.activateTenants('test-uuid', 10000, mockResponse as any)

      expect(service.activateTenantsForTest).toHaveBeenCalledWith('test-uuid', 10000)
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'Tenants activated',
        tenantIds: ['Agent-1'],
        cleanupDelayMs: 10000,
      })
    })
  })

  describe('stopSimulation', () => {
    it('should request stop for a running simulation', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      await controller.stopSimulation('test-uuid', mockResponse as any)

      expect(service.stopSimulation).toHaveBeenCalledWith('test-uuid')
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'Stop requested', testId: 'test-uuid' })
    })
  })

  describe('getConsolidatedReport', () => {
    it('should download consolidated report for a test', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        download: jest.fn(),
      }

      await controller.getConsolidatedReport('test-uuid', mockResponse as any)

      expect(service.generateConsolidatedReport).toHaveBeenCalledWith('test-uuid')
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.download).toHaveBeenCalledWith('/tmp/report-test-uuid.json', 'report-test-uuid.json')
    })
  })
})
