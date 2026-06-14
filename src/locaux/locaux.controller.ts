/**
 * ============================================================
 * FICHIER : locaux.controller.ts
 * RÔLE    : Routes HTTP pour la gestion des locaux (salles/espaces).
 * ============================================================
 *
 * ROUTES :
 *   GET    /locaux               → liste les locaux (filtrée selon le rôle)  [connecté]
 *   GET    /locaux/:id           → détails d'un local précis                 [public]
 *   POST   /locaux               → créer un local                            [ADMIN ou RESPONSABLE_CENTRE]
 *   PATCH  /locaux/:id           → modifier un local                         [ADMIN]
 *   DELETE /locaux/:id           → supprimer un local                        [ADMIN]
 *
 * PARTICULARITÉ SÉCURITÉ (findAll) :
 *   On passe `req.user` (l'utilisateur connecté) au service.
 *   Le service applique une règle RBAC :
 *     - ADMIN       → voit tous les locaux (peut filtrer par id_centre)
 *     - Autre rôle  → voit uniquement les locaux de SON centre
 *   C'est pourquoi @UseGuards(AuthGuard('jwt')) est obligatoire même pour la lecture.
 *
 * PARTICULARITÉ SÉCURITÉ (create) :
 *   On passe aussi `req.user.userId` et `req.user.role` au service.
 *   Le service résout automatiquement le centre du RESPONSABLE_CENTRE
 *   sans lui permettre de créer un local dans un autre centre.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Request,
} from '@nestjs/common';
import { LocauxService } from './locaux.service';
import { CreateLocalDto } from './dto/create-local.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';

@Controller('locaux')
export class LocauxController {
  constructor(private readonly locauxService: LocauxService) {}

  /**
   * GET /locaux?id_centre=uuid
   * Retourne les locaux selon le rôle de l'utilisateur connecté :
   *   - ADMIN           → tous les locaux (filtrables par id_centre)
   *   - RESPONSABLE/COACH → seulement les locaux de son propre centre
   *
   * On passe `req.user` complet au service car la logique de filtrage
   * est basée sur le rôle — c'est le service qui décide ce qu'on voit.
   */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Request() req: any, @Query('id_centre') id_centre?: string) {
    return this.locauxService.findAll(req.user, id_centre);
  }

  /**
   * POST /locaux
   * Crée un nouveau local dans un centre.
   * Accessible par ADMIN et RESPONSABLE_CENTRE.
   *
   * On passe req.user.userId et req.user.role pour que le service puisse :
   *   - Si RESPONSABLE_CENTRE → ignorer id_centre du body et utiliser son propre centre
   *   - Si ADMIN → utiliser l'id_centre du body
   */
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  create(@Request() req: any, @Body() dto: CreateLocalDto) {
    return this.locauxService.create(dto, req.user.userId, req.user.role);
  }

  /**
   * GET /locaux/:id
   * Retourne les détails complets d'un local :
   *   - son centre parent
   *   - ses équipements (avec les détails de chaque équipement)
   *   - ses 5 dernières réservations
   * Pas de guard → accessible sans être connecté (consultation publique).
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.locauxService.findOne(id);
  }

  /**
   * PATCH /locaux/:id
   * Met à jour les champs d'un local existant.
   * Réservé à l'RESPONSABLE_CENTRE uniquement.
   */
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CENTRE')
  update(@Param('id') id: string, @Body() data: any) {
    return this.locauxService.update(id, data);
  }

  /**
   * DELETE /locaux/:id
   * Supprime définitivement un local (hard delete, pas de soft delete ici).
   * Réservé à l'RESPONSABLE_CENTRE uniquement.
   * Attention : les réservations liées sont supprimées en cascade (configuré dans Prisma schema).
   */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('RESPONSABLE_CENTRE')
  remove(@Param('id') id: string) {
    return this.locauxService.remove(id);
  }
}
