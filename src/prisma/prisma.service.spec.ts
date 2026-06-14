/**
 * ============================================================
 * FICHIER : prisma.service.spec.ts
 * RÔLE    : Test unitaire minimal pour PrismaService.
 * ============================================================
 *
 * CE QUE CE TEST VÉRIFIE :
 *   - PrismaService peut être instancié dans un module de test NestJS.
 *   - L'injection de dépendances fonctionne correctement pour ce service.
 *
 * NOTE : Ce test ne vérifie pas la connexion réelle à la base de données.
 *   Il s'assure uniquement que la classe est bien définie et injectable.
 *   Pour tester la connexion PostgreSQL, des tests d'intégration avec
 *   une vraie base de données seraient nécessaires.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  // Vérifie que PrismaService est correctement instancié par le module de test
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
