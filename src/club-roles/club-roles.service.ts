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

  private normalizeRoleName(value: string) {
    return value
      .toUpperCase()
      .trim()
      .replace(/[\s-]+/g, '_');
  }

  async create(createClubRoleDto: CreateClubRoleDto) {
    const roleName = this.normalizeRoleName(createClubRoleDto.nom);

    if (roleName === 'RESPONSABLE_CLUB') {
      throw new ConflictException(
        'RESPONSABLE_CLUB est un rôle global et ne peut pas être créé comme rôle de club.',
      );
    }

    try {
      return await this.prisma.club_roles.create({
        data: {
          nom: roleName,
          description: createClubRoleDto.description?.trim() ?? '',
          is_active: true,
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
    const roles = await this.prisma.club_roles.findMany({
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

    return roles;
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

    const roleName = updateClubRoleDto.nom
      ? this.normalizeRoleName(updateClubRoleDto.nom)
      : undefined;

    if (roleName === 'RESPONSABLE_CLUB') {
      throw new ConflictException(
        'RESPONSABLE_CLUB est un rôle global et ne peut pas être utilisé comme rôle de club.',
      );
    }

    try {
      const updatedRole = await this.prisma.club_roles.update({
        where: { id },
        data: {
          nom: roleName,
          description:
            updateClubRoleDto.description !== undefined
              ? updateClubRoleDto.description?.trim() ?? ''
              : undefined,
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

  async deactivate(id: string) {
    const role = await this.findOne(id);

    if (role.is_active === false) {
      return role;
    }

    return await this.prisma.club_roles.update({
      where: { id },
      data: { is_active: false },
    });
  }

  async reactivate(id: string) {
    const role = await this.findOne(id);

    if (role.is_active !== false) {
      return role;
    }

    return await this.prisma.club_roles.update({
      where: { id },
      data: { is_active: true },
    });
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
