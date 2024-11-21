import { Module } from '@nestjs/common'
import { TenantsModule } from './tenants/tenants.module'
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
    HandledRedisModule,
    SimulationTestModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
