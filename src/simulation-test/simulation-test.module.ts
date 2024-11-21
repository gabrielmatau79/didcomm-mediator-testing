import { Module } from '@nestjs/common'
import { SimulationTestService } from './simulation-test.service'
import { SimulationTestController } from './simulation-test.controller'
import { TenantsModule } from 'src/tenants/tenants.module'

@Module({
  imports: [TenantsModule],
  controllers: [SimulationTestController],
  providers: [SimulationTestService],
})
export class SimulationTestModule {}
