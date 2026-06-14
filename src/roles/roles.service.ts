/**
 * ============================================================
 * FICHIER : roles.service.ts
 * RÔLE    : Logique métier CRUD pour la table `roles` en base de données.
 * ============================================================
 *
 * MÉTHODES :
 *
 *   create(dto)
 *     INSERT dans `roles` avec nom.toUpperCase().trim().
 *     Capture l'erreur Prisma P2002 (unique constraint sur nom) → ConflictException.
 *
 *   findAll()
 *     SELECT avec include utilisateurs { include centre }.
 *     Permet de voir combien d'utilisateurs portent chaque rôle et dans quel centre.
 *     Trié par nom ASC.
 *
 *   findOne(id)
 *     SELECT par UUID. Retourne null si introuvable (pas de NotFoundException ici).
 *
 *   update(id, dto)
 *     UPDATE nom et/ou description. nom.toUpperCase().trim() si fourni.
 *
 *   remove(id)
 *     Vérifie d'abord count(utilisateurs WHERE id_role = id).
 *     Si count > 0 → ConflictException (message avec le nombre exact).
 *     Si count = 0 → DELETE.
 *     Cette protection évite de casser la relation FK utilisateurs.id_role → roles.id.
 *
 * TABLE PRISMA : roles
 *   Relation : utilisateurs.id_role → roles.id (FK, 1 rôle → N utilisateurs)
 */

import { ConflictException, Injectable } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Crée un rôle (nom converti en MAJUSCULES + trim).
   * ConflictException si le nom existe déjà (Prisma P2002 = unique constraint violated).
   */
  async create(createRoleDto: CreateRoleDto) {
    try {
      return await this.prisma.roles.create({
        data: {
          nom: createRoleDto.nom.toUpperCase().trim(),
          description: createRoleDto.description,
        },
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Ce rôle existe déjà dans le système.');
      }
      throw error;
    }
  }

  /**
   * Tous les rôles avec leurs utilisateurs et le centre de chaque utilisateur.
   * Triés par nom ASC. Utile pour un tableau de bord des rôles attribués.
   */
  async findAll() {
    return await this.prisma.roles.findMany({
      include: {
        utilisateurs: {
          include: {
            centre: true, // 💡 Doit être identique au nom dans le modèle utilisateurs
          },
        },
      },
      orderBy: { nom: 'asc' },
    });
  }

  /**
   * Supprime un rôle UNIQUEMENT si aucun utilisateur ne le possède.
   * Vérifie count(utilisateurs WHERE id_role=id) avant de supprimer.
   * ConflictException avec le nombre exact si des utilisateurs bloquent la suppression.
   */
  async remove(id: string) {
    // Protection FK : on ne peut pas supprimer un rôle encore utilisé
    const count = await this.prisma.utilisateurs.count({
      where: { id_role: id },
    });

    if (count > 0) {
      throw new ConflictException(
        `Impossible de supprimer : ${count} utilisateur(s) possèdent encore ce grade.`,
      );
    }

    return this.prisma.roles.delete({
      where: { id },
    });
  }

  /** Retourne un rôle par UUID. Retourne null si introuvable (pas de NotFoundException). */
  findOne(id: string) {
    return this.prisma.roles.findUnique({ where: { id } });
  }

  /** Met à jour nom et/ou description. nom.toUpperCase().trim() appliqué si fourni. */
  async update(id: string, updateRoleDto: UpdateRoleDto) {
    return await this.prisma.roles.update({
      where: { id },
      data: {
        nom: updateRoleDto.nom?.toUpperCase().trim(),
        description: updateRoleDto.description,
      },
    });
  }
}
