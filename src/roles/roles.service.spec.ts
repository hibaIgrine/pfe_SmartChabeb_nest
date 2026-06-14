/**
 * Test unitaire minimal pour RolesService.
 * Vérifie uniquement que le service est instanciable dans un module de test NestJS.
 * Aucune connexion BDD n'est établie — PrismaService n'est pas fourni dans ce test.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let service: RolesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesService],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
