import { Test, TestingModule } from '@nestjs/testing';
import { ForfaitsService } from './forfaits.service';

describe('ForfaitsService', () => {
  let service: ForfaitsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ForfaitsService],
    }).compile();

    service = module.get<ForfaitsService>(ForfaitsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
