import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
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
      console.error("Erreur lors de la sauvegarde de l'image Base64", err);
      return ''; // En cas d'erreur on retourne vide pour ne pas crasher
    }
  }

  async create(data: any) {
    try {
      // 1. Tes logiques existantes (Image, Planning)
      let finalLogoUrl = data.logo_url
        ? this.saveBase64Image(data.logo_url)
        : undefined;
      let finalPlanning =
        typeof data.planning === 'string'
          ? { texte: data.planning }
          : data.planning;

      // 2. Création via transaction pour tout gérer
      return await this.prisma.$transaction(async (tx) => {
        const nouveauClub = await tx.clubs.create({
          data: {
            nom: data.nom,
            description: data.description,
            categorie: data.categorie,
            id_salle: data.id_salle,
            id_coach: data.id_coach || undefined, // Gardé pour ne pas casser l'existant
            planning: finalPlanning,
            logo_url: finalLogoUrl,
            capacite: data.capacite ? parseInt(data.capacite) : null,
            locale: data.locale,
          },
        });

        // 3. Ajout du staff si envoyé (Optionnel, ne casse rien si vide)
        if (data.staff && Array.isArray(data.staff)) {
          await tx.club_staff.createMany({
            data: data.staff.map((s: any) => ({
              id_club: nouveauClub.id,
              id_utilisateur: s.id_utilisateur,
              role_dans_club: s.role_dans_club,
            })),
          });
        }
        return nouveauClub;
      });
    } catch (error) {
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

    const totalIns = clubs.reduce(
      (acc, c) => acc + (c.inscriptions?.length || 0),
      0,
    );
    console.log(
      `[ClubsService] findAll: ${clubs.length} clubs, ${totalIns} total inscriptions.`,
    );

    return clubs;
  }
  // Rejoindre un club
  // clubs.service.ts

  async applyToClub(userId: string, clubId: string) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Récupérer le club et COMPTER uniquement ceux qui sont déjà 'ACCEPTE'
      const club = await tx.clubs.findUnique({
        where: { id: clubId },
        select: {
          capacite: true,
          _count: {
            select: {
              inscriptions: {
                where: { statut: 'ACCEPTE' }, // 💡 On ne compte que les vrais membres
              },
            },
          },
        },
      });

      if (!club) throw new NotFoundException('Club introuvable');

      // 2. Déterminer le statut automatiquement
      let statutFinal = 'EN_ATTENTE'; // Statut par défaut pour le responsable

      // 💡 LOGIQUE DE CAPACITÉ :
      // Si la capacité existe (pas null) et qu'elle est atteinte ou dépassée
      if (club.capacite !== null && club._count.inscriptions >= club.capacite) {
        statutFinal = 'LISTE_ATTENTE'; // 👈 On force l'enregistrement en LISTE_ATTENTE
      }

      // 3. Créer l'inscription avec le statut calculé
      try {
        const nouvelleInscription = await tx.inscriptions_clubs.create({
          data: {
            id_utilisateur: userId,
            id_club: clubId,
            statut: statutFinal,
          },
        });

        console.log(`📥 Inscription créée : ${statutFinal}`);
        return nouvelleInscription;
      } catch (e) {
        throw new ConflictException(
          'Vous avez déjà une demande en cours pour ce club.',
        );
      }
    });
  }

  async getClubInscriptions(clubId: string) {
    return await this.prisma.inscriptions_clubs.findMany({
      where: { id_club: clubId },
      include: {
        utilisateur: { select: { nom: true, prenom: true, email: true } },
      },
      orderBy: { date_adhesion: 'desc' },
    });
  }

  async updateInscriptionStatus(
    inscriptionId: string,
    statut: string,
    responsableId: string,
  ) {
    // 💡 Si le responsable veut ACCEPTER, on revérifie une dernière fois la capacité
    if (statut === 'ACCEPTE') {
      const currentIns = await this.prisma.inscriptions_clubs.findUnique({
        where: { id: inscriptionId },
        include: {
          club: {
            include: {
              _count: {
                select: { inscriptions: { where: { statut: 'ACCEPTE' } } },
              },
            },
          },
        },
      });

      if (currentIns && currentIns.club.capacite !== null) {
        if (currentIns.club._count.inscriptions >= currentIns.club.capacite) {
          // 🛑 On renvoie une erreur Conflict (409) que ton React va attraper
          throw new ConflictException(
            "Capacité maximale atteinte. Impossible d'accepter plus de membres.",
          );
        }
      }
    }

    // Mise à jour normale (Acceptation ou Refus)
    return await this.prisma.inscriptions_clubs.update({
      where: { id: inscriptionId },
      data: {
        statut: statut,
        date_validation: new Date(),
        responsable_id: responsableId,
      },
    });
  }

  // Voir mes inscriptions (pour le mobile)
  async findMyClubs(userId: string) {
    try {
      console.log('🔍 Recherche inscriptions pour utilisateur ID:', userId);

      const inscriptions = await this.prisma.inscriptions_clubs.findMany({
        where: { id_utilisateur: userId },
        // 💡 On simplifie l'include pour éviter les erreurs de jointures complexes
        include: {
          club: {
            select: { id: true, nom: true },
          },
        },
      });

      console.log(`✅ ${inscriptions.length} inscriptions trouvées.`);
      return inscriptions;
    } catch (error) {
      // 💡 Cela va afficher l'erreur RÉELLE dans ton terminal noir (NestJS)
      console.error('❌ ERREUR CRITIQUE findMyClubs:', error);
      throw error;
    }
  }
  // src/clubs/clubs.service.ts

  async findOne(id: string) {
    return await this.prisma.clubs.findUnique({
      where: { id },
      include: {
        salles: { select: { nom: true } },
        coach: { select: { nom: true, prenom: true } },
        staff: {
          // 🆕 Ajouté sans supprimer tes relations existantes
          include: {
            utilisateur: { select: { id: true, nom: true, prenom: true } },
          },
        },
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
  async getStaffBySalle(id_salle: string) {
    return await this.prisma.utilisateurs.findMany({
      where: {
        id_salle: id_salle,
        role: { in: ['COACH', 'ANIMATEUR', 'RESPONSABLE_CLUB'] }, // Rôles autorisés
      },
      select: { id: true, nom: true, prenom: true, role: true },
    });
  }
  async assignStaff(
    id_club: string,
    staffList: { id_utilisateur: string; role: string }[],
  ) {
    // Supprimer l'ancien staff pour éviter les conflits
    await this.prisma.club_staff.deleteMany({ where: { id_club } });

    // Créer le nouveau staff
    return await this.prisma.club_staff.createMany({
      data: staffList.map((item) => ({
        id_club,
        id_utilisateur: item.id_utilisateur,
        role_dans_club: item.role,
      })),
    });
  }
}
