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
