import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import Redis from 'ioredis'

describe('Didcomm Mediator Testing E2E Tests', () => {
  let app: INestApplication
  let redisClient: Redis

  beforeAll(async () => {
    // Mock Redis for testing
    redisClient = new Redis()
    jest.spyOn(redisClient, 'keys').mockResolvedValue(['message:1', 'message:2'])
    jest.spyOn(redisClient, 'get').mockImplementation((key) =>
      Promise.resolve(
        JSON.stringify({
          messageId: key,
          content: `Message content for ${key}`,
        }),
      ),
    )
    jest.spyOn(redisClient, 'flushall').mockResolvedValue('OK')

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('default_IORedisModuleConnectionToken')
      .useValue(redisClient)
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await redisClient.quit()
    await app.close()
  })

  it('/simulation-test/messages (GET) - should fetch all messages', async () => {
    const response = await request(app.getHttpServer()).get('/simulation-test/messages').expect(200)

    expect(response.body).toEqual({
      messages: [
        { messageId: 'message:1', content: 'Message content for message:1' },
        { messageId: 'message:2', content: 'Message content for message:2' },
      ],
      status: 'success',
    })
  })

  it('/simulation-test/database (DELETE) - should clear the database', async () => {
    const response = await request(app.getHttpServer()).post('/simulation-test/clear-database').expect(200)

    expect(response.body).toEqual({ status: 'success', message: 'Database cleared successfully.' })
    expect(redisClient.flushall).toHaveBeenCalled()
  })
})
