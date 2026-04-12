import { Test, TestingModule } from '@nestjs/testing';
import { PresencesController } from './presences.controller';
import { PresencesService } from './presences.service';

describe('PresencesController', () => {
  let controller: PresencesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PresencesController],
      providers: [
        {
          provide: PresencesService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<PresencesController>(PresencesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
