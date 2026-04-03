import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateClubRoleDto } from './dto/create-club-role.dto';
import { UpdateClubRoleDto } from './dto/update-club-role.dto';

@Injectable()
export class ClubRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createClubRoleDto: CreateClubRoleDto) {
    const roleName = createClubRoleDto.nom.toUpperCase().trim();

    try {
      return await this.prisma.club_roles.create({
        data: {
          nom: roleName,
          description: createClubRoleDto.description,
        },
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Ce rôle club existe déjà.');
      }
      throw error;
    }
  }

  async findAll() {
    return await this.prisma.club_roles.findMany({
      include: {
        staff: {
          include: {
            utilisateur: {
              select: { id: true, nom: true, prenom: true, email: true },
            },
            club: {
              select: { id: true, nom: true },
            },
          },
        },
      },
      orderBy: { nom: 'asc' },
    });
  }

  async findOne(id: string) {
    const clubRole = await this.prisma.club_roles.findUnique({
      where: { id },
      include: {
        staff: {
          include: {
            utilisateur: {
              select: { id: true, nom: true, prenom: true, email: true },
            },
            club: {
              select: { id: true, nom: true },
            },
          },
        },
      },
    });

    if (!clubRole) {
      throw new NotFoundException('Rôle club introuvable.');
    }

    return clubRole;
  }

  async update(id: string, updateClubRoleDto: UpdateClubRoleDto) {
    await this.findOne(id);

    const roleName = updateClubRoleDto.nom?.toUpperCase().trim();
    try {
      const updatedRole = await this.prisma.club_roles.update({
        where: { id },
        data: {
          nom: roleName,
          description: updateClubRoleDto.description,
        },
      });

      if (roleName) {
        await this.prisma.club_staff.updateMany({
          where: { id_club_role: id },
          data: { role_dans_club: roleName },
        });
      }

      return updatedRole;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Ce rôle club existe déjà.');
      }
      throw error;
    }
  }

  async remove(id: string) {
    const role = await this.findOne(id);

    if (role.staff.length > 0) {
      throw new ConflictException(
        `Impossible de supprimer : ${role.staff.length} affectation(s) staff utilisent encore ce rôle club.`,
      );
    }

    return await this.prisma.club_roles.delete({ where: { id } });
  }
}
