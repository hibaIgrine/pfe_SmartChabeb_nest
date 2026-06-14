/**
 * ============================================================
 * FICHIER : centres.service.ts
 * RÔLE    : Logique métier complète pour la gestion des centres (Dar Chabab).
 * ============================================================
 *
 * Ce service est appelé par CentresController. Il effectue toutes les
 * opérations en base de données via PrismaService.
 *
 * FONCTIONS :
 *   create()          → crée un nouveau centre en BDD
 *   findAll()         → liste les centres (filtre par gouvernorat + stats)
 *   findOne()         → détails complets d'un centre (locaux, clubs, responsables)
 *   update()          → met à jour les champs d'un centre
 *   remove()          → désactive un centre (soft delete, est_actif = false)
 *   activate()        → réactive un centre désactivé
 *   assignToCentre()  → lie un utilisateur à un centre (lors de l'inscription)
 *
 * STRATÉGIE SOFT DELETE :
 *   On ne supprime jamais un centre en BDD (DELETE SQL).
 *   On passe est_actif = false → le centre disparaît des listes mais l'historique est conservé.
 *   Pour le réactiver : est_actif = true via activate().
 *
 * CODES D'ERREUR PRISMA :
 *   P2002 → violation de contrainte unique (nom de centre déjà pris)
 *   P2025 → enregistrement introuvable (update/delete sur un ID inexistant)
 */

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CentresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CRÉER UN CENTRE
   * Insère un nouvel enregistrement dans la table `centres`.
   * Si le nom est déjà pris (contrainte unique en BDD), Prisma lève P2002
   * qu'on transforme en 409 ConflictException lisible par le frontend.
   */
  async create(createCentreDto: any) {
    try {
      return await this.prisma.centres.create({
        data: createCentreDto,
      });
    } catch (error) {
      // P2002 = violation de contrainte unique (nom déjà existant)
      if (error.code === 'P2002') {
        throw new ConflictException('Un centre avec ce nom existe déjà.');
      }
      throw error;
    }
  }

  /**
   * LISTER TOUS LES CENTRES
   * Retourne la liste des centres, triée par nom alphabétique.
   *
   * - Filtre optionnel : si `gouvernorat` est fourni, seuls les centres de ce
   *   gouvernorat sont retournés (utile pour l'onboarding Flutter).
   *
   * - _count : Prisma inclut automatiquement le nombre de :
   *     utilisateurs → nb d'adhérents/coachs rattachés au centre
   *     clubs        → nb de clubs actifs
   *     locaux       → nb de salles/espaces
   *     inventaire   → nb d'équipements
   *   Ces compteurs sont affichés dans le dashboard admin web.
   */
  async findAll(gouvernorat?: string) {
    return await this.prisma.centres.findMany({
      where: gouvernorat ? { gouvernorat } : undefined,
      include: {
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

  /**
   * DÉTAILS D'UN CENTRE
   * Retourne toutes les informations d'un centre identifié par son UUID.
   *
   * La réponse est enrichie (include) avec :
   *   _count         → compteurs (même que findAll)
   *   utilisateurs   → uniquement les RESPONSABLE_CENTRE (pas tous les adhérents)
   *                    avec seulement les champs nécessaires (select)
   *   locaux         → toutes les salles du centre
   *   inventaire     → tout le matériel du centre
   *   clubs          → les clubs avec le nom du responsable de chaque club
   *
   * Si l'ID ne correspond à aucun centre → 404 NotFoundException.
   */
  async findOne(id: string) {
    const centre = await this.prisma.centres.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            utilisateurs: true,
            clubs: true,
            locaux: true,
            inventaire: true,
          },
        },
        // Récupère seulement les responsables du centre (pas tous les utilisateurs)
        utilisateurs: {
          where: { role: 'RESPONSABLE_CENTRE' },
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            photo_profil_url: true,
            role: true,
          },
        },
        locaux: true,
        inventaire: true,
        // Pour chaque club, on inclut le nom du responsable (jointure imbriquée)
        clubs: {
          include: { responsable: { select: { nom: true, prenom: true } } },
        },
      },
    });
    if (!centre) throw new NotFoundException('Centre introuvable');
    return centre;
  }

  /**
   * METTRE À JOUR UN CENTRE
   * Modifie les champs modifiables d'un centre.
   * On énumère les champs explicitement (pas de spread dto) pour éviter
   * qu'un utilisateur malveillant ne modifie des champs non prévus.
   *
   * Champs modifiables : nom, gouvernorat, delegation, code_postal, adresse, telephone_centre.
   * Champs non modifiables ici : est_actif (géré par remove/activate), id, etc.
   */
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
          telephone_centre: dto.telephone_centre,
        },
      });
    } catch (error) {
      throw new NotFoundException(
        'Impossible de mettre à jour : centre introuvable.',
      );
    }
  }

  /**
   * DÉSACTIVER UN CENTRE (soft delete)
   * Au lieu de supprimer la ligne en BDD (DELETE), on passe est_actif = false.
   * Avantages :
   *   - L'historique (réservations passées, membres, clubs) est conservé
   *   - On peut réactiver le centre plus tard
   *   - Pas de risque de cascade accidentelle sur les données liées
   *
   * Erreur P2025 = l'ID fourni n'existe pas en BDD → 404.
   */
  async remove(id: string) {
    try {
      return await this.prisma.centres.update({
        where: { id },
        data: { est_actif: false },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(
          'Impossible de désactiver : centre introuvable.',
        );
      }
      throw error;
    }
  }

  /**
   * RÉACTIVER UN CENTRE
   * Inverse de remove() : passe est_actif = true pour rendre le centre
   * de nouveau visible dans les listes et utilisable par les adhérents.
   */
  async activate(id: string) {
    try {
      return await this.prisma.centres.update({
        where: { id },
        data: { est_actif: true },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(
          'Impossible de réactiver : centre introuvable.',
        );
      }
      throw error;
    }
  }

  /**
   * ASSIGNER UN UTILISATEUR À UN CENTRE
   * Met à jour le champ id_centre de l'utilisateur identifié par son email.
   * Appelé lors de l'inscription (onboarding) quand l'utilisateur choisit son centre.
   * Cette méthode est aussi utilisable par UsersService (via export du module).
   */
  async assignToCentre(email: string, id_centre: string) {
    try {
      return await this.prisma.utilisateurs.update({
        where: { email },
        data: { id_centre },
      });
    } catch (error) {
      throw new Error("Erreur lors de l'assignation du centre");
    }
  }
}
