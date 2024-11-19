import { Injectable } from '@nestjs/common'
import { InjectRedis } from '@nestjs-modules/ioredis'
import Redis from 'ioredis'

@Injectable()
export class MessagesService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async sendMessage(threadId: string, tenantId: string, message: string) {
    const sendTime = new Date().toISOString()
    await this.redis.hset(`message:${threadId}`, 'tenantId', tenantId, 'sendTime', sendTime, 'message', message)
    return { status: 'message sent', threadId, sendTime }
  }

  async receiveMessage(threadId: string) {
    const receiveTime = new Date().toISOString()
    await this.redis.hset(`message:${threadId}`, 'receiveTime', receiveTime)
    return { status: 'message received', threadId, receiveTime }
  }

  async getMessage(threadId: string) {
    return await this.redis.hgetall(`message:${threadId}`)
  }

  async simulateInteractions(tenantIds: string[], messagesPerTenant: number, intervalMs: number): Promise<void> {
    const simulationStart = Date.now()
    console.log(`[Simulation] Starting simulation with ${tenantIds.length} tenants...`)

    for (const tenantId of tenantIds) {
      for (let i = 0; i < messagesPerTenant; i++) {
        const threadId = `thread-${tenantId}-${i}`
        const message = `Message ${i + 1} from ${tenantId}`
        await this.sendMessage(threadId, tenantId, message)

        setTimeout(async () => {
          await this.receiveMessage(threadId)
          console.log(`[Simulation] Tenant ${tenantId}, Message ${i + 1} processed.`)
        }, intervalMs)
      }
    }

    console.log(`[Simulation] Finished in ${Date.now() - simulationStart} ms`)
  }

  async getStatistics(tenantId: string): Promise<{ sent: number; received: number; avgProcessingTime: number }> {
    const keys = await this.redis.keys(`message:*`)
    let sent = 0
    let received = 0
    let totalProcessingTime = 0

    for (const key of keys) {
      const data = await this.redis.hgetall(key)
      if (data.tenantId === tenantId) {
        if (data.sendTime) sent++
        if (data.receiveTime) {
          received++
          const sendTime = new Date(data.sendTime).getTime()
          const receiveTime = new Date(data.receiveTime).getTime()
          totalProcessingTime += receiveTime - sendTime
        }
      }
    }

    const avgProcessingTime = received > 0 ? totalProcessingTime / received : 0
    return { sent, received, avgProcessingTime }
  }
}
