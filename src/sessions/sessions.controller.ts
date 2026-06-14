/**
 * ============================================================
 * FICHIER : sessions.controller.ts
 * RÔLE    : Routes HTTP pour la gestion des sessions ML.
 * ============================================================
 *
 * BASE URL : /sessions
 * Tout le controller est protégé par @UseGuards(AuthGuard('jwt')).
 *
 * ROUTES :
 *
 *   POST /sessions                              body: CreateSessionDto
 *     → Crée une nouvelle session ML (saisie du coach avant demande de recommandation).
 *     → req.user.userId est passé comme responsableId (traçabilité du créateur).
 *     → Retourne la Session créée avec activite_choisie = null.
 *
 *   GET  /sessions
 *     → Liste toutes les sessions, triées par created_at DESC.
 *     → Chaque session est enrichie avec activite_choisie (dernier choix validé).
 *
 *   GET  /sessions/:id
 *     → Détail d'une session. :id est converti en nombre (+id).
 *     → NotFoundException si inexistante.
 *
 *   PATCH /sessions/:id                         body: UpdateSessionDto (PartialType)
 *     → Mise à jour partielle — tout champ de CreateSessionDto est optionnel.
 *     → Utile si le coach veut corriger une valeur avant de lancer la prédiction.
 *
 *   DELETE /sessions/:id
 *     → Suppression physique de la session.
 *     → NotFoundException si inexistante.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

@Controller('sessions')
@UseGuards(AuthGuard('jwt'))
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(@Request() req: any, @Body() createSessionDto: CreateSessionDto) {
    return this.sessionsService.create(createSessionDto, req.user?.userId);
  }

  @Get()
  findAll() {
    return this.sessionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSessionDto: UpdateSessionDto) {
    return this.sessionsService.update(+id, updateSessionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessionsService.remove(+id);
  }
}
