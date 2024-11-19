import { Test, TestingModule } from '@nestjs/testing';
import { SimulationTestController } from './simulation-test.controller';
import { SimulationTestService } from './simulation-test.service';

describe('SimulationTestController', () => {
  let controller: SimulationTestController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulationTestController],
      providers: [SimulationTestService],
    }).compile();

    controller = module.get<SimulationTestController>(SimulationTestController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
