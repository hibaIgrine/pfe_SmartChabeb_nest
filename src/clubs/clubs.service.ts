import { Injectable, ConflictException } from '@nestjs/common';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import {  PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  // src/clubs/clubs.service.ts

  async create(data: any) {
    console.log('🚀 Données reçues du Front:', data); // Pour vérifier ce qui arrive

    try {
      const nouveauClub = await this.prisma.clubs.create({
        data: {
          nom: data.nom,
          description: data.description,
          categorie: data.categorie,
          id_salle: data.id_salle,
          id_coach: data.id_coach || null,
          planning: data.planning || {},
        },
      });

      console.log('✅ Club enregistré en BDD avec ID:', nouveauClub.id);
      return nouveauClub; // On renvoie l'objet créé pour confirmer au front
    } catch (error) {
      console.error('❌ ERREUR PRISMA LORS DU CREATE:', error);
      throw error;
    }
  }
  async findBySalle(salleId: string) {
    return await this.prisma.clubs.findMany({
      where: { id_salle: salleId },
      include: {
        coach: { select: { nom: true, prenom: true } },
        _count: { select: { inscriptions: true } }, // Nombre de membres
      },
    });
  }
  async findAll() {
    return await this.prisma.clubs.findMany({
      include: {
        salles: { select: { nom: true, gouvernorat: true } },
        coach: { select: { nom: true, prenom: true } },
        _count: { select: { inscriptions: true } },
      },
      orderBy: { nom: 'asc' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} club`;
  }

  update(id: number, updateClubDto: UpdateClubDto) {
    return `This action updates a #${id} club`;
  }

  async remove(id: string) {
    return await this.prisma.clubs.delete({ where: { id } });
  }
}
