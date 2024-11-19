import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { MessagesService } from './messages.service';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('simulate')
  async simulateMessages(
    @Body('tenantIds') tenantIds: string[],
    @Body('messagesPerTenant') messagesPerTenant: number,
    @Body('intervalMs') intervalMs: number,
  ) {
    await this.messagesService.simulateInteractions(
      tenantIds,
      messagesPerTenant,
      intervalMs,
    );
    return { status: 'Simulation started' };
  }

  @Get('statistics/:tenantId')
  async getStatistics(@Param('tenantId') tenantId: string) {
    return await this.messagesService.getStatistics(tenantId);
  }
}
