import { Test, TestingModule } from '@nestjs/testing';
import { SallesController } from './salles.controller';
import { SallesService } from './salles.service';

describe('SallesController', () => {
  let controller: SallesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SallesController],
      providers: [SallesService],
    }).compile();

    controller = module.get<SallesController>(SallesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
