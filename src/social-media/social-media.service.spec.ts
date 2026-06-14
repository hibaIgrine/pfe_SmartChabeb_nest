/**
 * Test unitaire minimal pour SocialMediaService.
 * ATTENTION : le test actuel injecte SocialMediaService sans ses dépendances réelles
 * (PrismaService, NotificationsService), ce qui provoque une erreur à l'exécution.
 * À compléter avec des mocks avant d'ajouter des tests de logique.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { SocialMediaService } from './social-media.service';

describe('SocialMediaService', () => {
  let service: SocialMediaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SocialMediaService],
    }).compile();

    service = module.get<SocialMediaService>(SocialMediaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
