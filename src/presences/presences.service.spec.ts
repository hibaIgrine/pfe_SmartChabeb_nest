import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { PresencesService } from './presences.service';

describe('PresencesService', () => {
  let service: PresencesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresencesService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PresencesService>(PresencesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
