/**
 * ============================================================
 * FICHIER : roles.controller.ts
 * RÔLE    : Routes CRUD HTTP pour la gestion des rôles en base de données.
 * ============================================================
 *
 * BASE URL : /roles
 *
 * ROUTES EXPOSÉES :
 *
 *   POST /roles                    [@Roles('ADMIN', 'RESPONSABLE_CLUB')]
 *     → Crée un nouveau rôle (nom converti en MAJUSCULES).
 *     → ConflictException si le nom existe déjà (contrainte unique).
 *
 *   GET /roles
 *     → Liste tous les rôles avec leurs utilisateurs associés (et leur centre).
 *     → Triés par nom ASC.
 *
 *   GET /roles/:id
 *     → Retourne un rôle par son UUID.
 *
 *   PATCH /roles/:id
 *     → Met à jour nom et/ou description d'un rôle existant.
 *
 *   DELETE /roles/:id              [@Roles('ADMIN', 'RESPONSABLE_CLUB')]
 *     → Supprime un rôle UNIQUEMENT si aucun utilisateur ne le possède.
 *     → ConflictException si des utilisateurs portent encore ce rôle.
 *
 * SÉCURITÉ :
 *   @Roles() est appliqué sur POST et DELETE, mais il n'y a pas de
 *   @UseGuards(AuthGuard('jwt'), RolesGuard) sur ce controller.
 *   Les décorateurs @Roles() sans RolesGuard actif n'ont aucun effet —
 *   toutes les routes sont accessibles sans authentification.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Roles } from 'src/auth/roles.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * POST /roles — Crée un rôle (nom → MAJUSCULES). ConflictException si nom déjà utilisé.
   * NOTE : @Roles() sans RolesGuard actif → route accessible sans authentification.
   */
  @Post()
  @Roles('ADMIN', 'RESPONSABLE_CLUB')
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  /** GET /roles — Tous les rôles avec leurs utilisateurs et centres associés. */
  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  /** GET /roles/:id — Retourne un rôle par UUID. */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  /** PATCH /roles/:id — Met à jour nom et/ou description (nom → MAJUSCULES). */
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  /**
   * DELETE /roles/:id — Supprime un rôle si aucun utilisateur ne le possède.
   * ConflictException avec le compte exact des utilisateurs bloquants.
   */
  @Delete(':id')
  @Roles('ADMIN', 'RESPONSABLE_CLUB')
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
