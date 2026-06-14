/**
 * ============================================================
 * FICHIER : club-roles.service.ts
 * RÔLE    : Logique métier des rôles internes de club.
 * ============================================================
 *
 * CONCEPT : Rôles libres vs Rôles globaux
 * ────────────────────────────────────────
 * Les rôles club (cette table) sont distincts des rôles système.
 * Un adhérent peut être ADHERENT dans le système mais avoir
 * le rôle "ENTRAINEUR" dans un club spécifique.
 *
 * NORMALISATION DU NOM DE RÔLE :
 *   "Entraîneur Principal" → "ENTRAINEUR_PRINCIPAL"
 *   - Tout en majuscules (toUpperCase)
 *   - Trim des espaces en début/fin
 *   - Espaces et tirets remplacés par underscore (/[\s-]+/g → '_')
 *
 * PROTECTION SPÉCIALE :
 *   Le nom "RESPONSABLE_CLUB" est réservé comme rôle GLOBAL du système.
 *   Il ne peut pas être créé comme rôle club → ConflictException.
 *
 * GESTION DES CONFLITS DE NOM (code P2002) :
 *   Le nom est une colonne UNIQUE dans la BDD.
 *   Si on essaie de créer un rôle déjà existant → ConflictException.
 *
 * MISE À JOUR EN CASCADE (update) :
 *   Si on renomme un rôle → on met aussi à jour club_staff.role_dans_club
 *   pour tous les membres qui avaient ce rôle_dans_club.
 *   (Cohérence entre club_roles.nom et club_staff.role_dans_club)
 *
 * PROTECTION SUPPRESSION :
 *   Un rôle ne peut être supprimé que si aucun club_staff ne l'utilise.
 *   → Vérifié via role.staff.length > 0 → ConflictException.
 */

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateClubRoleDto } from './dto/create-club-role.dto';
import { UpdateClubRoleDto } from './dto/update-club-role.dto';

@Injectable()
export class ClubRolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * NORMALISER LE NOM D'UN RÔLE CLUB
   * Applique : toUpperCase + trim + remplacement espaces/tirets par underscore.
   * "Entraîneur" → "ENTRAÎNEUR"
   * "coach-principal" → "COACH_PRINCIPAL"
   */
  private normalizeRoleName(value: string) {
    return value.toUpperCase().trim().replace(/[\s-]+/g, '_');
  }

  /**
   * CRÉER UN RÔLE CLUB
   * Normalise le nom → vérifie que ce n'est pas RESPONSABLE_CLUB
   * → insère dans la BDD avec is_active = true.
   * Lance ConflictException si le nom est déjà pris (erreur Prisma P2002).
   */
  async create(createClubRoleDto: CreateClubRoleDto) {
    const roleName = this.normalizeRoleName(createClubRoleDto.nom);

    if (roleName === 'RESPONSABLE_CLUB') {
      throw new ConflictException(
        'RESPONSABLE_CLUB est un rôle global et ne peut pas être créé comme rôle de club.',
      );
    }

    try {
      return await this.prisma.club_roles.create({
        data: {
          nom: roleName,
          description: createClubRoleDto.description?.trim() ?? '',
          is_active: true,
        },
      });
    } catch (error: unknown) {
      if (
        error && typeof error === 'object' && 'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Ce rôle club existe déjà.');
      }
      throw error;
    }
  }

  /**
   * LISTER TOUS LES RÔLES CLUB
   * Retourne les rôles triés par nom alphabétique.
   * Inclut pour chaque rôle : le staff qui l'utilise (avec utilisateur + club associé).
   * Utile pour le dashboard admin : voir qui a quel rôle dans quel club.
   */
  async findAll() {
    return await this.prisma.club_roles.findMany({
      include: {
        staff: {
          include: {
            utilisateur: { select: { id: true, nom: true, prenom: true, email: true } },
            club:        { select: { id: true, nom: true } },
          },
        },
      },
      orderBy: { nom: 'asc' },
    });
  }

  /**
   * TROUVER UN RÔLE PAR SON ID
   * Inclut le staff associé (même format que findAll).
   * Lance NotFoundException si le rôle n'existe pas.
   */
  async findOne(id: string) {
    const clubRole = await this.prisma.club_roles.findUnique({
      where: { id },
      include: {
        staff: {
          include: {
            utilisateur: { select: { id: true, nom: true, prenom: true, email: true } },
            club:        { select: { id: true, nom: true } },
          },
        },
      },
    });
    if (!clubRole) throw new NotFoundException('Rôle club introuvable.');
    return clubRole;
  }

  /**
   * MODIFIER UN RÔLE CLUB
   * Normalise le nouveau nom si fourni → vérifie que ce n'est pas RESPONSABLE_CLUB.
   *
   * MISE À JOUR EN CASCADE :
   * Si le nom change → tous les enregistrements club_staff qui référençaient ce rôle
   * (via id_club_role) voient leur colonne role_dans_club mise à jour.
   * Cela assure la cohérence entre le rôle et son nom "dénormalisé" dans club_staff.
   */
  async update(id: string, updateClubRoleDto: UpdateClubRoleDto) {
    await this.findOne(id); // Vérifie l'existence avant modification

    const roleName = updateClubRoleDto.nom
      ? this.normalizeRoleName(updateClubRoleDto.nom)
      : undefined;

    if (roleName === 'RESPONSABLE_CLUB') {
      throw new ConflictException(
        'RESPONSABLE_CLUB est un rôle global et ne peut pas être utilisé comme rôle de club.',
      );
    }

    try {
      const updatedRole = await this.prisma.club_roles.update({
        where: { id },
        data: {
          nom: roleName,
          description:
            updateClubRoleDto.description !== undefined
              ? (updateClubRoleDto.description?.trim() ?? '')
              : undefined,
        },
      });

      // Mise à jour en cascade : si le nom a changé, mettre à jour club_staff
      if (roleName) {
        await this.prisma.club_staff.updateMany({
          where: { id_club_role: id },
          data: { role_dans_club: roleName },
        });
      }

      return updatedRole;
    } catch (error: unknown) {
      if (
        error && typeof error === 'object' && 'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Ce rôle club existe déjà.');
      }
      throw error;
    }
  }

  /**
   * DÉSACTIVER UN RÔLE CLUB
   * Soft-désactivation : is_active = false.
   * Le rôle n'est plus proposé dans les sélecteurs mais les affectations existantes
   * sont conservées (compatibilité historique).
   * Idempotent : si déjà désactivé → retourne le rôle sans faire de requête UPDATE.
   */
  async deactivate(id: string) {
    const role = await this.findOne(id);
    if (role.is_active === false) return role; // Déjà désactivé → pas de changement
    return await this.prisma.club_roles.update({
      where: { id },
      data: { is_active: false },
    });
  }

  /**
   * RÉACTIVER UN RÔLE CLUB
   * Inverse de deactivate : is_active = true.
   * Idempotent : si déjà actif → retourne le rôle sans UPDATE.
   */
  async reactivate(id: string) {
    const role = await this.findOne(id);
    if (role.is_active !== false) return role; // Déjà actif → pas de changement
    return await this.prisma.club_roles.update({
      where: { id },
      data: { is_active: true },
    });
  }

  /**
   * SUPPRIMER UN RÔLE CLUB
   * Vérifie d'abord qu'aucun membre du staff n'utilise encore ce rôle.
   * role.staff est déjà chargé par findOne → pas besoin de requête supplémentaire.
   * Si des affectations existent → ConflictException avec le compte.
   * Sinon → hard delete dans club_roles.
   */
  async remove(id: string) {
    const role = await this.findOne(id);
    if (role.staff.length > 0) {
      throw new ConflictException(
        `Impossible de supprimer : ${role.staff.length} affectation(s) staff utilisent encore ce rôle club.`,
      );
    }
    return await this.prisma.club_roles.delete({ where: { id } });
  }
}
