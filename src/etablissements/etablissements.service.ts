import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class EtablissementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return await this.prisma.etablissements.findMany({
      orderBy: { nom: 'asc' },
    });
  }

  async findOrCreate(nom: string) {
    if (!nom || nom.trim().length === 0) {
      return null;
    }

    const trimmedNom = nom.trim();

    const existing = await this.prisma.etablissements.findUnique({
      where: { nom: trimmedNom },
    });

    if (existing) {
      return existing;
    }

    return await this.prisma.etablissements.create({
      data: { nom: trimmedNom },
    });
  }

  async searchByName(query: string) {
    if (!query || query.trim().length === 0) {
      return await this.findAll();
    }

    const trimmedQuery = `%${query.trim()}%`;

    return await this.prisma.etablissements.findMany({
      where: {
        nom: {
          contains: query.trim(),
          mode: 'insensitive',
        },
      },
      orderBy: { nom: 'asc' },
      take: 50,
    });
  }
}
