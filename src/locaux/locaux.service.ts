import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLocalDto } from './dto/create-local.dto';

@Injectable()
export class LocauxService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateLocalDto,
    requesterId?: string,
    requesterRole?: string,
  ) {
    let resolvedCentreId = dto.id_centre;

    if (requesterRole === 'RESPONSABLE_CENTRE') {
      if (!requesterId) {
        throw new BadRequestException('Utilisateur responsable introuvable');
      }

      const requester = await this.prisma.utilisateurs.findUnique({
        where: { id: requesterId },
        select: { id_centre: true },
      });

      if (!requester?.id_centre) {
        throw new BadRequestException(
          'Aucun centre associe au responsable courant',
        );
      }

      resolvedCentreId = requester.id_centre;
    }

    if (!resolvedCentreId) {
      throw new BadRequestException('id_centre est obligatoire');
    }

    return await this.prisma.locaux.create({
      data: {
        ...dto,
        id_centre: resolvedCentreId,
      },
    });
  }

  async findAll(user: any, queryIdCentre?: string) {
    let idToFilter = queryIdCentre;

    // 🛡️ SÉCURITÉ : Si l'utilisateur n'est pas ADMIN
    if (user.role !== 'ADMIN') {
      // On ignore le filtre demandé et on force son propre centre
      idToFilter = user.id_centre;
    }

    return await this.prisma.locaux.findMany({
      where: idToFilter ? { id_centre: idToFilter } : {},
      include: {
        centre: { select: { nom: true, gouvernorat: true } },
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
