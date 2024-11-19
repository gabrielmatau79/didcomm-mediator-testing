import { Test, TestingModule } from '@nestjs/testing';
import { SimulationTestService } from './simulation-test.service';

describe('SimulationTestService', () => {
  let service: SimulationTestService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SimulationTestService],
    }).compile();

    service = module.get<SimulationTestService>(SimulationTestService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
