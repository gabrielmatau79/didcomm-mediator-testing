import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { TenantsModule } from './tenants/tenants.module'
import { MessagesModule } from './messages/messages.module'
import { ConfigModule } from '@nestjs/config'
import { HandledRedisModule } from './lib/redis/redis.module'
import { SimulationTestModule } from './simulation-test/simulation-test.module'
import appConfig from './config/app.config'

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      load: [appConfig],
      isGlobal: true,
    }),
    TenantsModule,
    MessagesModule,
    HandledRedisModule,
    SimulationTestModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
