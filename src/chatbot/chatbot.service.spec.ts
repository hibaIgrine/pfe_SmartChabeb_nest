/**
 * Test unitaire pour ChatbotService.
 * PrismaService et ConfigService sont mockés pour éviter les appels BDD et API.
 * Les findMany renvoient [] par défaut — le service doit s'initialiser sans données.
 * GROQ_API_KEY fictive ('test-groq-key') fournie via configMock pour éviter l'erreur de démarrage.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ChatbotService } from './chatbot.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('ChatbotService', () => {
  let service: ChatbotService;
  const prismaMock = {
    clubs: { findMany: jest.fn() },
    events: { findMany: jest.fn() },
    locaux: { findMany: jest.fn() },
    reservations_locaux: { findMany: jest.fn() },
  };

  const configMock = {
    get: jest.fn().mockReturnValue('test-groq-key'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.clubs.findMany.mockResolvedValue([]);
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.locaux.findMany.mockResolvedValue([]);
    prismaMock.reservations_locaux.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatbotService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<ChatbotService>(ChatbotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
