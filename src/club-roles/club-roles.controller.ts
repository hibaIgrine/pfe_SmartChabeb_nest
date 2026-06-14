/**
 * ============================================================
 * FICHIER : club-roles.controller.ts
 * RÔLE    : Routes HTTP pour la gestion des rôles de club.
 * ============================================================
 *
 * BASE URL : /club-roles
 * Pas de AuthGuard → ces routes sont publiques (les rôles club sont une liste de référence).
 *
 * ROUTES :
 *   POST   /club-roles          → créer un nouveau rôle club
 *   GET    /club-roles          → lister tous les rôles avec leur staff associé
 *   GET    /club-roles/:id      → détails d'un rôle (avec staff + clubs associés)
 *   PATCH  /club-roles/:id      → modifier nom ou description du rôle
 *   PATCH  /club-roles/:id/deactivate → désactiver un rôle (is_active = false)
 *   PATCH  /club-roles/:id/reactivate → réactiver un rôle (is_active = true)
 *   DELETE /club-roles/:id      → supprimer (impossible si des staff l'utilisent encore)
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ClubRolesService } from './club-roles.service';
import { CreateClubRoleDto } from './dto/create-club-role.dto';
import { UpdateClubRoleDto } from './dto/update-club-role.dto';

@Controller('club-roles')
export class ClubRolesController {
  constructor(private readonly clubRolesService: ClubRolesService) {}

  /**
   * POST /club-roles
   * Crée un nouveau rôle club (ex: ENTRAINEUR, SECRETAIRE, ARBITRE...).
   * Le nom est normalisé : majuscules + espaces/tirets → underscore.
   * RESPONSABLE_CLUB est réservé comme rôle global → rejeté avec 409.
   */
  @Post()
  create(@Body() createClubRoleDto: CreateClubRoleDto) {
    return this.clubRolesService.create(createClubRoleDto);
  }

  /**
   * GET /club-roles
   * Retourne tous les rôles club triés par nom, avec pour chaque rôle
   * la liste des staff qui l'utilisent (utilisateur + club).
   */
  @Get()
  findAll() {
    return this.clubRolesService.findAll();
  }

  /**
   * GET /club-roles/:id
   * Détails d'un rôle spécifique avec son staff associé.
   * Retourne 404 si le rôle n'existe pas.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clubRolesService.findOne(id);
  }

  /**
   * PATCH /club-roles/:id
   * Modifie le nom et/ou la description d'un rôle.
   * Si le nom change → met aussi à jour role_dans_club dans club_staff
   * pour tous les membres qui avaient ce rôle (cohérence des données).
   */
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateClubRoleDto: UpdateClubRoleDto) {
    return this.clubRolesService.update(id, updateClubRoleDto);
  }

  /**
   * PATCH /club-roles/:id/deactivate
   * Désactive le rôle (is_active = false).
   * Le rôle n'est plus proposé dans les listes mais ses assignations existantes sont conservées.
   * Idempotent : si déjà désactivé → retourne le rôle tel quel sans erreur.
   */
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.clubRolesService.deactivate(id);
  }

  /**
   * PATCH /club-roles/:id/reactivate
   * Réactive un rôle désactivé (is_active = true).
   * Idempotent : si déjà actif → retourne le rôle tel quel sans erreur.
   */
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.clubRolesService.reactivate(id);
  }

  /**
   * DELETE /club-roles/:id
   * Supprime définitivement un rôle club.
   * BLOQUÉ si des membres du staff l'utilisent encore → 409 ConflictException
   * avec le nombre d'affectations actives.
   */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clubRolesService.remove(id);
  }
}
