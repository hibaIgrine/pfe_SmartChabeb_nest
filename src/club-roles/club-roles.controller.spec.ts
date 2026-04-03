import { Test, TestingModule } from '@nestjs/testing';
import { ClubRolesController } from './club-roles.controller';
import { ClubRolesService } from './club-roles.service';

describe('ClubRolesController', () => {
  let controller: ClubRolesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClubRolesController],
      providers: [ClubRolesService],
    }).compile();

    controller = module.get<ClubRolesController>(ClubRolesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
