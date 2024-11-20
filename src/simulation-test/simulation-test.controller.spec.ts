import { Test, TestingModule } from '@nestjs/testing'
import { SimulationTestController } from './simulation-test.controller'
import { SimulationTestService } from './simulation-test.service'

describe('SimulationTestController', () => {
  let controller: SimulationTestController
  let service: SimulationTestService

  beforeEach(async () => {
    const serviceMock = {
      simulateTest: jest.fn().mockResolvedValue({ status: 'Simulation started' }),
      getAllMessages: jest.fn().mockResolvedValue([]),
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
      }
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      await controller.simulate(config, mockResponse as any)

      expect(service.simulateTest).toHaveBeenCalledWith(config)
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'Simulation test is running' })
    })
  })

  describe('getAllMessages', () => {
    it('should return all messages', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      await controller.getAllMessages(mockResponse as any)

      expect(service.getAllMessages).toHaveBeenCalled()
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'success', messages: [] })
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
})
