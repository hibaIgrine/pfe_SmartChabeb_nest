import { ConflictException, Injectable } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  // ==========================================
  // Créer un nouveau grade (RBAC Dynamique)
  // ==========================================
  async create(createRoleDto: CreateRoleDto) {
    try {
      return await this.prisma.roles.create({
        data: {
          nom: createRoleDto.nom.toUpperCase().trim(),
          description: createRoleDto.description,
        },
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Ce rôle existe déjà dans le système.');
      }
      throw error;
    }
  }

  // ==========================================
  // Lister les rôles avec les utilisateurs et leurs centres
  // ==========================================
  // src/roles/roles.service.ts
  async findAll() {
    return await this.prisma.roles.findMany({
      include: {
        utilisateurs: {
          include: {
            centre: true, // 💡 Doit être identique au nom dans le modèle utilisateurs
          },
        },
      },
      orderBy: { nom: 'asc' },
    });
  }

  // ==========================================
  // Supprimer un grade (Sécurisé)
  // ==========================================
  async remove(id: string) {
    // 🛡️ Sécurité : On vérifie si des utilisateurs portent encore ce grade
    const count = await this.prisma.utilisateurs.count({
      where: { id_role: id },
    });

    if (count > 0) {
      throw new ConflictException(
        `Impossible de supprimer : ${count} utilisateur(s) possèdent encore ce grade.`,
      );
    }

    return this.prisma.roles.delete({
      where: { id },
    });
  }

  // Fonctions de base (à implémenter si besoin pour ton CRUD)
  findOne(id: string) {
    return this.prisma.roles.findUnique({ where: { id } });
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    return await this.prisma.roles.update({
      where: { id },
      data: {
        nom: updateRoleDto.nom?.toUpperCase().trim(),
        description: updateRoleDto.description,
      },
    });
  }
}
