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
  // src/clubs/clubs.service.ts

  async findAll(salleId?: string) {
    return await this.prisma.clubs.findMany({
      where: salleId ? { id_salle: salleId } : {},
      include: {
        // 1. On récupère les infos du coach
        coach: { select: { nom: true, prenom: true } },
        // 2. On récupère le nom du centre
        salles: { select: { nom: true } },
        // 3. LA MAGIE : On demande le compte des inscriptions
        _count: {
          select: {
            inscriptions: true, // Vérifie si dans ton schema c'est 'inscriptions' ou 'inscriptions_clubs'
          },
        },
      },
      orderBy: { nom: 'asc' },
    });
  }
  // Rejoindre un club
  async joinClub(userId: string, clubId: string) {
    try {
      return await this.prisma.inscriptions_clubs.create({
        data: {
          id_utilisateur: userId,
          id_club: clubId,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Tu es déjà membre de ce club !');
      }
      throw error;
    }
  }

  // Voir mes inscriptions (pour le mobile)
  async findMyClubs(userId: string) {
    return await this.prisma.inscriptions_clubs.findMany({
      where: { id_utilisateur: userId },
      include: { club: true },
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
