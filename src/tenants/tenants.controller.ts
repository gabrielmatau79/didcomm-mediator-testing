import { Controller, Post, Get, Body, Param, HttpStatus, Res, Delete } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBody } from '@nestjs/swagger'
import { TenantsService } from './tenants.service'

@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiBody({
    description: 'Details of the tenant to be created',
    schema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', example: 'tenant-123' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Tenant created successfully' })
  @Post()
  createTenant(@Body('tenantId') tenantId: string) {
    return this.tenantsService.createTenant(tenantId)
  }

  @ApiOperation({ summary: 'Get details of a tenant' })
  @ApiParam({ name: 'tenantId', description: 'ID of the tenant', example: 'tenant-123' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Tenant details retrieved successfully' })
  @Get(':tenantId')
  getTenant(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenantAgent(tenantId)
  }

  @ApiOperation({ summary: 'List all tenants' })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of tenants retrieved successfully' })
  @Get()
  async listTenants() {
    return this.tenantsService.listTenants()
  }

  @ApiOperation({ summary: 'Create a connection between two tenants' })
  @ApiBody({
    description: 'Details of the tenants to connect',
    schema: {
      type: 'object',
      properties: {
        fromTenantId: { type: 'string', example: 'tenant-1' },
        toTenantId: { type: 'string', example: 'tenant-2' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Connection created successfully' })
  @Post('connect')
  async createConnection(@Body('fromTenantId') fromTenantId: string, @Body('toTenantId') toTenantId: string) {
    return await this.tenantsService.createConnection(fromTenantId, toTenantId)
  }

  @ApiOperation({ summary: 'Get all connections of a tenant' })
  @ApiParam({ name: 'tenantId', description: 'ID of the tenant', example: 'tenant-123' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Connections retrieved successfully' })
  @Get(':tenantId/connections')
  async getConnections(@Param('tenantId') tenantId: string, @Res() res: any) {
    try {
      const connections = await this.tenantsService.getConnections(tenantId)
      return res.status(200).json(connections)
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: false, error: error.message })
    }
  }

  @ApiOperation({ summary: 'Send a message between tenants' })
  @ApiParam({ name: 'fromTenantId', description: 'ID of the sender tenant', example: 'tenant-1' })
  @ApiBody({
    description: 'Details of the message to send',
    schema: {
      type: 'object',
      properties: {
        toTenantId: { type: 'string', example: 'tenant-2' },
        message: { type: 'string', example: 'Hello from tenant-1!' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Message sent successfully' })
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

  @ApiOperation({ summary: 'Delete a tenant' })
  @ApiParam({ name: 'tenantId', description: 'ID of the tenant to delete', example: 'tenant-123' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Tenant deleted successfully' })
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
