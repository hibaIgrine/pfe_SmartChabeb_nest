import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CentresService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // Créer un nouveau centre (Dar Chabab)
  // ==========================================
  async create(createCentreDto: any) {
    try {
      return await this.prisma.centres.create({
        data: createCentreDto,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Un centre avec ce nom existe déjà.');
      }
      throw error;
    }
  }

  // ==========================================
  // Lister tous les centres (avec filtres & stats)
  // ==========================================
  async findAll(gouvernorat?: string) {
    return await this.prisma.centres.findMany({
      where: gouvernorat ? { gouvernorat } : undefined,
      include: {
        // Stats pour le Dashboard Admin Web
        _count: {
          select: {
            utilisateurs: true,
            clubs: true,
            locaux: true,
            inventaire: true,
          },
        },
      },
      orderBy: { nom: 'asc' },
    });
  }

  // ==========================================
  // Détails d'un centre spécifique
  // ==========================================
  async findOne(id: string) {
    const centre = await this.prisma.centres.findUnique({
      where: { id },
      include: {
        locaux: true,
        inventaire: true,
        clubs: {
          include: { responsable: { select: { nom: true, prenom: true } } },
        },
      },
    });
    if (!centre) throw new NotFoundException('Centre introuvable');
    return centre;
  }

  // ==========================================
  // Mettre à jour les infos d'un centre
  // ==========================================
  async update(id: string, dto: any) {
    try {
      return await this.prisma.centres.update({
        where: { id },
        data: {
          nom: dto.nom,
          gouvernorat: dto.gouvernorat,
          delegation: dto.delegation,
          code_postal: dto.code_postal,
          adresse: dto.adresse,
          telephone_centre: dto.telephone_centre, // 💡 Mis à jour
        },
      });
    } catch (error) {
      throw new NotFoundException(
        'Impossible de mettre à jour : centre introuvable.',
      );
    }
  }

  // ==========================================
  // Supprimer un centre (Sécurisé par Cascade)
  // ==========================================
  async remove(id: string) {
    try {
      return await this.prisma.centres.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2003') {
        throw new ConflictException(
          "Erreur d'intégrité : vérifiez les dépendances du centre.",
        );
      }
      throw error;
    }
  }

  // ==========================================
  // LOGIQUE UTILISATEUR : Assigner à un centre
  // ==========================================
  async assignToCentre(email: string, id_centre: string) {
    try {
      return await this.prisma.utilisateurs.update({
        where: { email },
        data: {
          id_centre: id_centre, // 💡 id_salle -> id_centre
        },
      });
    } catch (error) {
      throw new Error("Erreur lors de l'assignation du centre");
    }
  }
}
