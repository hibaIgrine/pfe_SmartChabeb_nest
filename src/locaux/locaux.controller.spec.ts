import { Test, TestingModule } from '@nestjs/testing';
import { LocauxController } from './locaux.controller';

describe('LocauxController', () => {
  let controller: LocauxController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocauxController],
    }).compile();

    controller = module.get<LocauxController>(LocauxController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
