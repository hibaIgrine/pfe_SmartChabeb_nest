import { ConflictException, Injectable } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async create(createRoleDto: CreateRoleDto) {
    try {
      return await this.prisma.roles.create({
        data: {
          nom: createRoleDto.nom.toUpperCase(),
          description: createRoleDto.description,
        },
      });
    } catch (error) {
      if (error.code === 'P2002')
        throw new ConflictException('Ce rôle existe déjà');
      throw error;
    }
  }

  async findAll() {
    return await this.prisma.roles.findMany({
      include: {
        utilisateurs: {
          include: {
            salles: true, // 🏆 CRUCIAL : Sans ça, le front ne connaît pas la région de l'utilisateur
          },
        },
      },
      orderBy: { nom: 'asc' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} role`;
  }

  update(id: number, updateRoleDto: UpdateRoleDto) {
    return `This action updates a #${id} role`;
  }

  async remove(id: string) {
    // Sécurité : ne pas supprimer un rôle si des membres l'utilisent encore
    const count = await this.prisma.utilisateurs.count({
      where: { id_role: id },
    });
    if (count > 0)
      throw new ConflictException('Ce rôle est utilisé par des membres');

    return this.prisma.roles.delete({ where: { id } });
  }
}
