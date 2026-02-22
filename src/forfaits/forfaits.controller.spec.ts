import { Test, TestingModule } from '@nestjs/testing';
import { ForfaitsController } from './forfaits.controller';
import { ForfaitsService } from './forfaits.service';

describe('ForfaitsController', () => {
  let controller: ForfaitsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ForfaitsController],
      providers: [ForfaitsService],
    }).compile();

    controller = module.get<ForfaitsController>(ForfaitsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
