import { Injectable, ConflictException } from '@nestjs/common';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  // src/clubs/clubs.service.ts

  // Fonction utilitaire pour sauvegarder l'image Base64
  private saveBase64Image(base64Data: string): string {
    if (!base64Data || !base64Data.startsWith('data:image')) {
      return base64Data; // retourne la valeur tel quel (peut-être déjà une URL)
    }

    try {
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw new Error('Format Base64 invalide');
      }

      const extension = matches[1].split('/')[1] || 'png';
      const imageBuffer = Buffer.from(matches[2], 'base64');
      const filename = `club-${Date.now()}-${Math.floor(Math.random() * 10000)}.${extension}`;
      
      const uploadDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, imageBuffer);

      return `/uploads/${filename}`;
    } catch (err) {
      console.error('Erreur lors de la sauvegarde de l\'image Base64', err);
      return ''; // En cas d'erreur on retourne vide pour ne pas crasher
    }
  }

  async create(data: any) {
    console.log('🚀 Données reçues du Front: Nom=', data.nom, ' Categorie=', data.categorie); 

    try {
      // 1. Sauvegarde du logo s'il est en base64
      let finalLogoUrl: string | undefined = undefined;
      if (data.logo_url) {
        finalLogoUrl = this.saveBase64Image(data.logo_url);
      }

      // 2. Formatage du planning en Objet JSON
      let finalPlanning: any = undefined;
      if (data.planning) {
        finalPlanning = typeof data.planning === 'string' ? { texte: data.planning } : data.planning;
      }

      const nouveauClub = await this.prisma.clubs.create({
        data: {
          nom: data.nom,
          description: data.description,
          categorie: data.categorie,
          id_salle: data.id_salle,
          id_coach: data.id_coach || undefined,
          planning: finalPlanning,
          logo_url: finalLogoUrl,
        },
      });

      console.log('✅ Club enregistré en BDD avec ID:', nouveauClub.id);
      return nouveauClub; // On renvoie l'objet créé pour confirmer au front
    } catch (error) {
      console.error('❌ ERREUR PRISMA LORS DU CREATE:');
      console.error(error);
      if (error instanceof Error) {
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
      }
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
    const clubs = await this.prisma.clubs.findMany({
      where: salleId ? { id_salle: salleId } : {},
      include: {
        coach: { select: { nom: true, prenom: true } },
        salles: { select: { nom: true, gouvernorat: true } },
        inscriptions: {
          include: {
            utilisateur: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                email: true,
                photo_profil_url: true,
              },
            },
          },
          orderBy: { date_adhesion: 'desc' }, // Latest first in the DB query too
        },
        _count: {
          select: { inscriptions: true },
        },
      },
      orderBy: { nom: 'asc' },
    });

    const totalIns = clubs.reduce((acc, c) => acc + (c.inscriptions?.length || 0), 0);
    console.log(`[ClubsService] findAll: ${clubs.length} clubs, ${totalIns} total inscriptions.`);
    
    return clubs;
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
  // src/clubs/clubs.service.ts

  async findOne(id: string) {
    return await this.prisma.clubs.findUnique({
      where: { id },
      include: {
        salles: { select: { nom: true } },
        coach: { select: { nom: true, prenom: true } },
        // 🏆 ON RÉCUPÈRE LES MEMBRES RÉELS
        inscriptions: {
          include: {
            utilisateur: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                email: true,
                photo_profil_url: true,
              },
            },
          },
        },
      },
    });
  }
  async update(id: string, data: any) {
    let finalLogoUrl = data.logo_url;
    if (finalLogoUrl && finalLogoUrl.startsWith('data:image')) {
      finalLogoUrl = this.saveBase64Image(finalLogoUrl);
    }

    let finalPlanning = data.planning;
    if (finalPlanning && typeof finalPlanning === 'string') {
      finalPlanning = { texte: finalPlanning };
    }

    return await this.prisma.clubs.update({
      where: { id },
      data: {
        nom: data.nom,
        description: data.description || undefined,
        categorie: data.categorie,
        id_salle: data.id_salle,
        id_coach: data.id_coach || undefined,
        logo_url: finalLogoUrl !== undefined ? finalLogoUrl : undefined,
        planning: finalPlanning !== undefined ? finalPlanning : undefined,
      },
    });
  }

  async remove(id: string) {
    return await this.prisma.clubs.delete({ where: { id } });
  }
}
