import { validate } from 'class-validator'
import { SimulateTestDto } from './simulate-test.dto'

describe('SimulateTestDto', () => {
  it('should require testName', async () => {
    const dto = new SimulateTestDto()
    dto.messagesPerConnection = 5
    dto.timestampTestInterval = 60000
    dto.numAgent = 2
    dto.nameAgent = 'TestAgent'
    dto.messageRate = 100

    const errors = await validate(dto)

    const testNameError = errors.find((error) => error.property === 'testName')
    expect(testNameError).toBeDefined()
  })

  it('should allow optional testDescription', async () => {
    const dto = new SimulateTestDto()
    dto.messagesPerConnection = 5
    dto.timestampTestInterval = 60000
    dto.numAgent = 2
    dto.nameAgent = 'TestAgent'
    dto.testName = 'Load Test'

    const errors = await validate(dto)

    expect(errors.length).toBe(0)
  })
})
