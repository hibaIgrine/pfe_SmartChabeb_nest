/**
 * Test unitaire minimal pour RolesController.
 * Vérifie uniquement que le controller est instanciable avec RolesService.
 * Aucune connexion BDD n'est établie — PrismaService n'est pas fourni dans ce test.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

describe('RolesController', () => {
  let controller: RolesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [RolesService],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
