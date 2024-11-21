import { Module } from '@nestjs/common'
import { TenantsService } from './tenants.service'
import { TenantsController } from './tenants.controller'
import { AgentFactory } from 'src/lib/agents/agent.factory'

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, AgentFactory],
  exports: [TenantsService],
})
export class TenantsModule {}
