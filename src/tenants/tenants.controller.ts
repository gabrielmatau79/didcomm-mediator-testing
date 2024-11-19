import { Controller, Post, Get, Body, Param, HttpStatus, Res, Delete } from '@nestjs/common'
import { TenantsService } from './tenants.service'

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  createTenant(@Body('tenantId') tenantId: string, @Body('config') config: any) {
    return this.tenantsService.createTenant(tenantId, config)
  }

  @Get(':tenantId')
  getTenant(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenantAgent(tenantId)
  }

  @Get()
  listTenants() {
    return this.tenantsService.listTenants()
  }

  @Post('connect')
  async createConnection(@Body('fromTenantId') fromTenantId: string, @Body('toTenantId') toTenantId: string) {
    return await this.tenantsService.createConnection(fromTenantId, toTenantId)
  }

  @Get(':tenantId/connections')
  async getConnections(@Param('tenantId') tenantId: string, @Res() res: any) {
    try {
      const connections = await this.tenantsService.getConnections(tenantId)
      return res.status(200).json(connections)
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: false, error: error.message })
    }
  }

  @Post(':fromTenantId/send-message')
  async sendMessage(
    @Param('fromTenantId') fromTenantId: string,
    @Body('toTenantId') toTenantId: string,
    @Body('message') message: string,
    @Res() res: any,
  ) {
    try {
      const result = await this.tenantsService.sendMessage(fromTenantId, toTenantId, message)
      return res.status(HttpStatus.OK).json(result)
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: false, error: error.message })
    }
  }

  @Delete(':tenantId')
  async deleteTenant(@Param('tenantId') tenantId: string, @Res() res: any) {
    try {
      const result = await this.tenantsService.deleteTenant(tenantId)
      return res.status(HttpStatus.OK).json(result)
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: false, error: error.message })
    }
  }
}
