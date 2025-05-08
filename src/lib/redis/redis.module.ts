import { Module, Logger } from '@nestjs/common'
import { RedisModule, RedisModuleOptions } from '@nestjs-modules/ioredis'
import { ConfigModule, ConfigService } from '@nestjs/config'

@Module({
  imports: [
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): RedisModuleOptions => {
        const logger = new Logger('HandledRedisModule')
        logger.log('[HandledRedisModule] Configuring Redis as Single Node')

        return {
          type: 'single',
          url: configService.get<string>('appConfig.redisDbUrl'),
          options: {
            connectTimeout: 10000,
            maxRetriesPerRequest: 5,
            enableReadyCheck: true,
            reconnectOnError(err: Error): boolean {
              const targetError = 'READONLY'
              if (err.message.includes(targetError)) {
                logger.error('Reconnect due to READONLY error:', err)
                return true
              }
              return false
            },
          },
        }
      },
    }),
  ],
  exports: [RedisModule],
})
export class HandledRedisModule {}
