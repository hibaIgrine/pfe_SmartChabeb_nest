import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLocalDto } from './dto/create-local.dto';

@Injectable()
export class LocauxService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLocalDto) {
    return await this.prisma.locaux.create({
      data: dto,
    });
  }

  async findAll(id_centre?: string) {
    return await this.prisma.locaux.findMany({
      where: id_centre ? { id_centre } : {},
      include: {
        centre: { select: { nom: true } },
        _count: { select: { reservations: true } },
      },
      orderBy: { nom: 'asc' },
    });
  }

  async findOne(id: string) {
    const local = await this.prisma.locaux.findUnique({
      where: { id },
      include: {
        centre: true,
        equipements: { include: { equipement: true } },
        reservations: { take: 5, orderBy: { date_reservation: 'desc' } },
      },
    });
    if (!local) throw new NotFoundException('Espace introuvable');
    return local;
  }

  async update(id: string, data: any) {
    return await this.prisma.locaux.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return await this.prisma.locaux.delete({
      where: { id },
    });
  }
}
