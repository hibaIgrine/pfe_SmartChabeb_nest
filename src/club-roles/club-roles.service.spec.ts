import { Test, TestingModule } from '@nestjs/testing';
import { ClubRolesService } from './club-roles.service';

describe('ClubRolesService', () => {
  let service: ClubRolesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClubRolesService],
    }).compile();

    service = module.get<ClubRolesService>(ClubRolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
