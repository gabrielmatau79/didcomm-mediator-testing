import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { AppModule } from '../src/app.module'
import { EventEmitter } from 'events'
import { SimulationTestController } from '../src/simulation-test/simulation-test.controller'

describe('Didcomm Mediator Testing E2E Tests', () => {
  let app: INestApplication
  let controller: SimulationTestController
  let redisClient: {
    scanStream: jest.Mock
    pipeline: jest.Mock
    flushall: jest.Mock
    quit: jest.Mock
  }

  beforeAll(async () => {
    // Mock Redis for testing
    const messages = [
      { fromTenantId: 'Agent-1', toTenantId: 'Agent-2', message: 'Hello', processingTimeMs: 10 },
      { fromTenantId: 'Agent-2', toTenantId: 'Agent-1', message: 'World', processingTimeMs: 12 },
    ]

    redisClient = {
      scanStream: jest.fn(),
      pipeline: jest.fn(),
      flushall: jest.fn().mockResolvedValue('OK'),
      quit: jest.fn().mockResolvedValue('OK'),
    }

    redisClient.scanStream.mockImplementation(() => {
      const stream = new EventEmitter() as EventEmitter & {
        pause: () => void
        resume: () => void
        destroy: (error?: Error) => void
      }
      stream.pause = jest.fn()
      stream.resume = jest.fn()
      stream.destroy = jest.fn()

      process.nextTick(() => {
        stream.emit('data', ['message:test-uuid:1', 'message:test-uuid:2'])
        stream.emit('end')
      })

      return stream
    })

    redisClient.pipeline.mockImplementation(() => {
      const exec = jest.fn().mockResolvedValue([
        [null, JSON.stringify(messages[0])],
        [null, JSON.stringify(messages[1])],
      ])

      return {
        get: jest.fn().mockReturnThis(),
        exec,
      }
    })

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('default_IORedisModuleConnectionToken')
      .useValue(redisClient)
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()
    controller = moduleFixture.get<SimulationTestController>(SimulationTestController)
  })

  afterAll(async () => {
    await redisClient.quit()
    await app.close()
  })

  it('/simulation-test/messages/:testId (GET) - should fetch all messages', async () => {
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }

    await controller.getMessagesByTestId('test-uuid', mockResponse as any)

    expect(mockResponse.status).toHaveBeenCalledWith(200)
    expect(mockResponse.json).toHaveBeenCalledWith({
      messages: [
        { fromTenantId: 'Agent-1', toTenantId: 'Agent-2', message: 'Hello', processingTimeMs: 10 },
        { fromTenantId: 'Agent-2', toTenantId: 'Agent-1', message: 'World', processingTimeMs: 12 },
      ],
      status: 'success',
    })
  })

  it('/simulation-test/database (DELETE) - should clear the database', async () => {
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }

    await controller.clearDatabase(mockResponse as any)

    expect(mockResponse.status).toHaveBeenCalledWith(200)
    expect(mockResponse.json).toHaveBeenCalledWith({ status: 'success', message: 'Database cleared successfully.' })
    expect(redisClient.flushall).toHaveBeenCalled()
  })
})
