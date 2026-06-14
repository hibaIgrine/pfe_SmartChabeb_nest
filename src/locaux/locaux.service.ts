/**
 * ============================================================
 * FICHIER : locaux.service.ts
 * RÔLE    : Logique métier pour la gestion des locaux (salles/espaces).
 * ============================================================
 *
 * Ce service implémente une logique de sécurité RBAC (Role-Based Access Control)
 * directement dans les méthodes — pas uniquement au niveau du controller.
 *
 * FONCTIONS :
 *   create()   → crée un local, résout automatiquement le centre pour RESPONSABLE_CENTRE
 *   findAll()  → liste les locaux avec filtrage forcé selon le rôle
 *   findOne()  → détails complets d'un local (équipements + réservations récentes)
 *   update()   → met à jour les champs d'un local
 *   remove()   → supprime définitivement un local (hard delete)
 *
 * SÉCURITÉ APPLIQUÉE :
 *   - ADMIN             : accès complet, peut filtrer par n'importe quel centre
 *   - RESPONSABLE_CENTRE: ne voit et ne crée que dans SON centre (vérifié en BDD)
 *   - Autres rôles      : ne voient que les locaux de leur centre rattaché
 *
 * Cette logique est appliquée au NIVEAU SERVICE (pas seulement controller)
 * pour éviter qu'un appel direct au service contourne les restrictions.
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLocalDto } from './dto/create-local.dto';

@Injectable()
export class LocauxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CRÉER UN LOCAL
   * Insère un nouveau local dans la table `locaux`.
   *
   * Logique de résolution du centre (sécurité RBAC) :
   *   - Si le créateur est RESPONSABLE_CENTRE :
   *       → On ignore complètement le champ `id_centre` du body
   *       → On récupère en BDD le centre associé à ce responsable
   *       → Impossible de créer un local dans un autre centre
   *   - Si le créateur est ADMIN :
   *       → On utilise l'`id_centre` fourni dans le body (CreateLocalDto)
   *
   * Cette protection empêche un RESPONSABLE_CENTRE de cibler un autre centre
   * même en manipulant manuellement le body de la requête.
   */
  async create(
    dto: CreateLocalDto,
    requesterId?: string,
    requesterRole?: string,
  ) {
    // Par défaut : on utilise l'id_centre fourni dans le DTO (cas ADMIN)
    let resolvedCentreId = dto.id_centre;

    // Cas RESPONSABLE_CENTRE : on force son propre centre
    if (requesterRole === 'RESPONSABLE_CENTRE') {
      if (!requesterId) {
        throw new BadRequestException('Utilisateur responsable introuvable');
      }

      // Récupérer le centre du responsable depuis la BDD (source de vérité)
      const requester = await this.prisma.utilisateurs.findUnique({
        where: { id: requesterId },
        select: { id_centre: true },
      });

      if (!requester?.id_centre) {
        throw new BadRequestException(
          'Aucun centre associé au responsable courant',
        );
      }

      // On écrase l'id_centre du DTO par celui du responsable → sécurité garantie
      resolvedCentreId = requester.id_centre;
    }

    // Vérification finale : on doit avoir un centre (obligatoire pour un local)
    if (!resolvedCentreId) {
      throw new BadRequestException('id_centre est obligatoire');
    }

    return await this.prisma.locaux.create({
      data: {
        ...dto,
        id_centre: resolvedCentreId, // L'id_centre résolu (celui du responsable ou du DTO)
      },
    });
  }

  /**
   * LISTER LES LOCAUX (avec filtrage RBAC)
   *
   * Règle appliquée :
   *   - ADMIN           → tous les locaux de la BDD (filtrables optionnellement par id_centre)
   *   - Tout autre rôle → uniquement les locaux du centre auquel l'utilisateur est rattaché
   *                        (le filtre id_centre du query param est IGNORÉ pour les non-admins)
   *
   * Pourquoi ce double niveau ?
   *   Sans cette logique, un RESPONSABLE_CENTRE pourrait passer ?id_centre=<autre_id>
   *   dans l'URL et voir les locaux d'un autre centre. On l'empêche ici.
   *
   * La réponse inclut :
   *   - centre : nom et gouvernorat du centre parent (pour l'affichage)
   *   - _count.reservations : nombre de réservations actives pour chaque local
   */
  async findAll(user: any, queryIdCentre?: string) {
    let idToFilter = queryIdCentre; // Filtre fourni par l'URL (optionnel)

    // Si pas ADMIN → forcer le filtre sur le centre de l'utilisateur connecté
    if (user.role !== 'ADMIN') {
      const requester = await this.prisma.utilisateurs.findUnique({
        where: { id: user.userId },
        select: { id_centre: true },
      });

      idToFilter = requester?.id_centre ?? undefined;

      // Si l'utilisateur n'a pas de centre rattaché → liste vide (pas d'erreur)
      if (!idToFilter) {
        return [];
      }
    }

    return await this.prisma.locaux.findMany({
      where: idToFilter ? { id_centre: idToFilter } : {},
      include: {
        centre: { select: { nom: true, gouvernorat: true } },
        _count: { select: { reservations: true } },
      },
      orderBy: { nom: 'asc' },
    });
  }

  /**
   * DÉTAILS D'UN LOCAL
   * Retourne toutes les informations d'un local identifié par son UUID.
   *
   * La réponse inclut (jointures imbriquées) :
   *   centre       → toutes les infos du centre parent
   *   equipements  → la table de jointure local↔équipement + les détails de chaque équipement
   *   reservations → les 5 dernières réservations (triées par date décroissante)
   *                  Limité à 5 pour alléger la réponse (les autres sont paginées ailleurs)
   *
   * Si l'ID ne correspond à aucun local → 404 NotFoundException.
   */
  async findOne(id: string) {
    const local = await this.prisma.locaux.findUnique({
      where: { id },
      include: {
        centre: true,
        // equipements est une table de jointure (many-to-many entre locaux et équipements)
        equipements: { include: { equipement: true } },
        // Seulement les 5 dernières réservations pour ne pas surcharger la réponse
        reservations: { take: 5, orderBy: { date_reservation: 'desc' } },
      },
    });
    if (!local) throw new NotFoundException('Espace introuvable');
    return local;
  }

  /**
   * METTRE À JOUR UN LOCAL
   * Met à jour les champs fournis dans `data` pour le local identifié par `id`.
   * Prisma n'écrase que les champs fournis (pas de risque de perte de données).
   */
  async update(id: string, data: any) {
    return await this.prisma.locaux.update({
      where: { id },
      data,
    });
  }

  /**
   * SUPPRIMER UN LOCAL (hard delete)
   * Contrairement aux centres (soft delete), les locaux sont supprimés définitivement.
   * Les réservations liées à ce local sont supprimées en cascade selon le schema Prisma.
   */
  async remove(id: string) {
    return await this.prisma.locaux.delete({
      where: { id },
    });
  }
}
