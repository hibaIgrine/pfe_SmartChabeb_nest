import { ConflictException, Injectable } from '@nestjs/common';
import { CreateSalleDto } from './dto/create-salle.dto';
import { UpdateSalleDto } from './dto/update-salle.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SallesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: any) {
    return await this.prisma.salles.create({
      data: {
        nom: dto.nom,
        gouvernorat: dto.gouvernorat, // mis à jour
        delegation: dto.delegation, // ajouté
        code_postal: dto.code_postal, // ajouté
        adresse: dto.adresse,
        telephone_salle: dto.telephone_salle,
      },
    });
  }

  async findAll() {
    return await this.prisma.salles.findMany();
  }

  findOne(id: number) {
    return `This action returns a #${id} salle`;
  }

  async update(id: string, dto: any) {
    return await this.prisma.salles.update({
      where: { id: id },
      data: {
        nom: dto.nom,
        gouvernorat: dto.gouvernorat,
        delegation: dto.delegation,
        code_postal: dto.code_postal,
        adresse: dto.adresse,
        telephone_salle: dto.telephone_salle,
      },
    });
  }

  async remove(id: string) {
    try {
      return await this.prisma.salles.delete({
        where: { id: id },
      });
    } catch (error) {
      // Si l'erreur vient des clés étrangères (salle liée à des membres)
      if (error.code === 'P2003') {
        throw new ConflictException(
          'Impossible de supprimer : ce centre possède des membres ou du matériel.',
        );
      }
      throw error;
    }
  }
}
