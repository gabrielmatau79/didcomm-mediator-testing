import { Controller, Post, Body, Res, HttpStatus, Get } from '@nestjs/common'
import { SimulationTestService } from './simulation-test.service'

@Controller('simulation-test')
export class SimulationTestController {
  constructor(private readonly simulationTestService: SimulationTestService) {}

  @Post()
  async simulate(
    @Body()
    config: {
      messagesPerConnection: number
      timestampTestInterval: number
      numAgent: number
      nameAgent: string
    },
    @Res() res: any,
  ) {
    try {
      console.log(`messagesPeerConnection value: ${config.messagesPerConnection}`)
      const result = await this.simulationTestService.simulateTest(config)
      return res.status(HttpStatus.OK).json(result)
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({ status: false, error: error.message })
    }
  }

  /**
   * Endpoint to fetch all messages stored in Redis.
   * @returns List of messages with details.
   */
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
}
