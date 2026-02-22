import { Test, TestingModule } from '@nestjs/testing';
import { SallesService } from './salles.service';

describe('SallesService', () => {
  let service: SallesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SallesService],
    }).compile();

    service = module.get<SallesService>(SallesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
