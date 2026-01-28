import { Controller, Post, Body, Res, HttpStatus, Get, Param } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger'
import { SimulationTestService } from './simulation-test.service'
import { SimulateTestDto } from './dto/simulate-test.dto'
import * as path from 'path'

@ApiTags('Simulation Test')
@Controller('simulation-test')
export class SimulationTestController {
  constructor(private readonly simulationTestService: SimulationTestService) {}

  @ApiOperation({ summary: 'Simulate a messaging test between agents' })
  @ApiBody({
    description: 'Configuration for the simulation test',
    schema: {
      type: 'object',
      properties: {
        messagesPerConnection: { type: 'number', example: 5, description: 'Messages per connection' },
        timestampTestInterval: { type: 'number', example: 60000, description: 'Test duration in milliseconds' },
        numAgent: { type: 'number', example: 3, description: 'Number of agents to create' },
        nameAgent: { type: 'string', example: 'Agent', description: 'Base name for agents' },
        testName: { type: 'string', example: 'Load Test - Mediator v1', description: 'Name of the test' },
        testDescription: {
          type: 'string',
          example: 'Baseline test for mediator throughput',
          description: 'Optional description of the test',
        },
        messageRate: { type: 'number', example: 100, description: 'Optional message rate in milliseconds' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Simulation completed successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input or simulation failed' })
  @Post()
  async simulate(
    @Body()
    config: SimulateTestDto,
    @Res() res: any,
  ) {
    try {
      const result = await this.simulationTestService.simulateTest(config)

      return res.status(HttpStatus.OK).json(result)
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', error: error.message })
    }
  }

  @ApiOperation({ summary: 'Fetch all messages stored in Redis for a test' })
  @ApiParam({ name: 'testId', description: 'ID of the test', example: 'test-uuid' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Messages retrieved successfully' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Failed to fetch messages' })
  @Get('messages/:testId')
  async getMessagesByTestId(@Param('testId') testId: string, @Res() res: any) {
    try {
      const messages = await this.simulationTestService.getMessagesByTestId(testId)
      return res.status(HttpStatus.OK).json({ status: 'success', messages })
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: 'Failed to fetch messages',
        error: error.message,
      })
    }
  }

  @ApiOperation({ summary: 'Fetch metrics grouped by agent for a test' })
  @ApiParam({ name: 'testId', description: 'ID of the test', example: 'test-uuid' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Metrics retrieved successfully' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Failed to fetch metrics' })
  @Get('metrics/:testId')
  async getMetrics(@Param('testId') testId: string, @Res() res: any) {
    try {
      const metrics = await this.simulationTestService.calculateMetricsByAgent(testId)
      return res.status(HttpStatus.OK).json({ status: 'success', metrics })
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: 'Failed to fetch metrics',
        error: error.message,
      })
    }
  }

  @ApiOperation({ summary: 'Fetch total metrics for a test' })
  @ApiParam({ name: 'testId', description: 'ID of the test', example: 'test-uuid' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Total metrics retrieved successfully' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Failed to fetch total metrics' })
  @Get('metrics/:testId/totals')
  async getTotals(@Param('testId') testId: string, @Res() res: any) {
    try {
      const totals = await this.simulationTestService.calculateTotals(testId)
      return res.status(HttpStatus.OK).json({ status: 'success', totals })
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: 'Failed to fetch total metrics',
        error: error.message,
      })
    }
  }

  @ApiOperation({ summary: 'Fetch all tests stored in Redis' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Tests retrieved successfully' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Failed to fetch tests' })
  @Get('tests')
  async getTests(@Res() res: any) {
    try {
      const tests = await this.simulationTestService.getTests()
      return res.status(HttpStatus.OK).json({ status: 'success', tests })
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: 'Failed to fetch tests',
        error: error.message,
      })
    }
  }

  @ApiOperation({ summary: 'Activate tenants for a test to receive delayed messages' })
  @ApiParam({ name: 'testId', description: 'ID of the test', example: 'test-uuid' })
  @ApiBody({
    description: 'Optional cleanup delay for the activated tenants (ms)',
    schema: {
      type: 'object',
      properties: {
        cleanupDelayMs: { type: 'number', example: 10000 },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Tenants activated successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Failed to activate tenants' })
  @Post('activate/:testId')
  async activateTenants(
    @Param('testId') testId: string,
    @Body('cleanupDelayMs') cleanupDelayMs: number,
    @Res() res: any,
  ) {
    try {
      const result = await this.simulationTestService.activateTenantsForTest(testId, cleanupDelayMs)
      return res.status(HttpStatus.OK).json(result)
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', error: error.message })
    }
  }

  @ApiOperation({ summary: 'Stop a running simulation' })
  @ApiParam({ name: 'testId', description: 'ID of the test', example: 'test-uuid' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Stop requested' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Failed to stop simulation' })
  @Post('stop/:testId')
  async stopSimulation(@Param('testId') testId: string, @Res() res: any) {
    try {
      const result = await this.simulationTestService.stopSimulation(testId)
      return res.status(HttpStatus.OK).json(result)
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', error: error.message })
    }
  }

  @ApiOperation({ summary: 'Generate and download a report for a test' })
  @ApiParam({ name: 'testId', description: 'ID of the test', example: 'test-uuid' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Report generated successfully' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Failed to generate report' })
  @Get('reports/:testId')
  async getReport(@Param('testId') testId: string, @Res() res: any) {
    try {
      const { reportPath } = await this.simulationTestService.generateReport(testId)
      return res.status(HttpStatus.OK).download(reportPath, path.basename(reportPath))
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: 'Failed to generate report',
        error: error.message,
      })
    }
  }

  @ApiOperation({ summary: 'Download a consolidated report (config, totals, messages) for a test' })
  @ApiParam({ name: 'testId', description: 'ID of the test', example: 'test-uuid' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Consolidated report generated successfully' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Failed to generate consolidated report' })
  @Get('reports/:testId/consolidated')
  async getConsolidatedReport(@Param('testId') testId: string, @Res() res: any) {
    try {
      const { reportPath } = await this.simulationTestService.generateConsolidatedReport(testId)
      return res.status(HttpStatus.OK).download(reportPath, path.basename(reportPath))
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: 'Failed to generate consolidated report',
        error: error.message,
      })
    }
  }

  @Post('clear-database')
  @ApiOperation({ summary: 'Clear the Redis database after testing' })
  @ApiResponse({
    status: 200,
    description: 'The database was cleared successfully.',
  })
  @ApiResponse({
    status: 500,
    description: 'An error occurred while clearing the database.',
  })
  async clearDatabase(@Res() res: any) {
    try {
      await this.simulationTestService.clearDatabase()
      return res.status(HttpStatus.OK).json({
        status: 'success',
        message: 'Database cleared successfully.',
      })
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: 'Failed to clear database',
        error: error.message,
      })
    }
  }
}
