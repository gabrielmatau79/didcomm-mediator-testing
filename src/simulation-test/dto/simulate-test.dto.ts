import { IsNumber, IsString, Min, IsOptional } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class SimulateTestDto {
  @ApiProperty({
    description: 'Number of messages to send per connection',
    example: 10,
  })
  @IsNumber()
  @Min(1)
  messagesPerConnection: number

  @ApiProperty({
    description: 'Total duration of the test in milliseconds',
    example: 60000,
  })
  @IsNumber()
  @Min(1000)
  timestampTestInterval: number

  @ApiProperty({
    description: 'Number of agents to create',
    example: 5,
  })
  @IsNumber()
  @Min(1)
  numAgent: number

  @ApiProperty({
    description: 'Base name for the agents',
    example: 'TestAgent',
  })
  @IsString()
  nameAgent: string

  @ApiProperty({
    description: 'Optional message rate in milliseconds',
    example: 100,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Min(10)
  messageRate?: number
}
