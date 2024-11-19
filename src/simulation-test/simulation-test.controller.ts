import { Controller, Post, Body, Res, HttpStatus, Get } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger'
import { SimulationTestService } from './simulation-test.service'
import { SimulateTestDto } from './dto/simulate-test.dto'

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
      console.log(`messagesPerConnection value: ${config.messagesPerConnection}`)

      // Start the simulation test in the background
      this.simulationTestService.simulateTest(config).catch((error) => {
        console.error(`Simulation test failed: ${error.message}`)
      })

      return res.status(HttpStatus.OK).json({
        status: 'Simulation test is running',
      })
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: 'error', error: error.message })
    }
  }

  @ApiOperation({ summary: 'Fetch all messages stored in Redis' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Messages retrieved successfully' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Failed to fetch messages' })
  @Get('messages')
  async getAllMessages(@Res() res: any) {
    try {
      const messages = await this.simulationTestService.getAllMessages()
      return res.status(HttpStatus.OK).json({ status: 'success', messages })
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: 'Failed to fetch messages',
        error: error.message,
      })
    }
  }

  @ApiOperation({ summary: 'Fetch metrics grouped by agent' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Metrics retrieved successfully' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Failed to fetch metrics' })
  @Get('metrics')
  async getMetrics(@Res() res: any) {
    try {
      const metrics = await this.simulationTestService.calculateMetricsByAgent()
      return res.status(HttpStatus.OK).json({ status: 'success', metrics })
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: 'Failed to fetch metrics',
        error: error.message,
      })
    }
  }

  @ApiOperation({ summary: 'Fetch total metrics' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Total metrics retrieved successfully' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Failed to fetch total metrics' })
  @Get('metrics/totals')
  async getTotals(@Res() res: any) {
    try {
      const totals = await this.simulationTestService.calculateTotals()
      return res.status(HttpStatus.OK).json({ status: 'success', totals })
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: 'Failed to fetch total metrics',
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
