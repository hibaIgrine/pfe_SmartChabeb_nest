import { Test, TestingModule } from '@nestjs/testing';
import { LocauxService } from './locaux.service';

describe('LocauxService', () => {
  let service: LocauxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LocauxService],
    }).compile();

    service = module.get<LocauxService>(LocauxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
