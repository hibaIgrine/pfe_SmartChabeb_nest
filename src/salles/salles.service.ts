import { ConflictException, Injectable } from '@nestjs/common';
import { CreateSalleDto } from './dto/create-salle.dto';
import { UpdateSalleDto } from './dto/update-salle.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SallesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSalleDto: any) {
    try {
      return await this.prisma.salles.create({
        data: createSalleDto,
      });
    } catch (error) {
      // Code P2002 = Erreur de violation de contrainte unique (doublon)
      if (error.code === 'P2002') {
        throw new ConflictException(
          'Un centre avec ce nom existe déjà en Tunisie.',
        );
      }
      throw error;
    }
  }

  async findAll(gouvernorat?: string) {
    return await this.prisma.salles.findMany({
      where: {
        // On utilise 'gouvernorat' car c'est le nouveau nom de ta colonne
        gouvernorat: gouvernorat ? { equals: gouvernorat } : undefined,
      },
      // On inclut les comptes pour ne pas faire planter le Web Admin
      include: {
        _count: { select: { utilisateurs: true, equipements: true } },
      },
    });
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
  // Ajoute ceci dans UsersService
  async assignToSalle(email: string, id_salle: string) {
    try {
      return await this.prisma.utilisateurs.update({
        where: { email: email },
        data: {
          id_salle: id_salle, // On met à jour l'UUID de la salle
        },
      });
    } catch (error) {
      throw new Error("Erreur lors de l'assignation de la salle");
    }
  }
}
