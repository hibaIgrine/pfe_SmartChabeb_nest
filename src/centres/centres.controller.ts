/**
 * ============================================================
 * FICHIER : centres.controller.ts
 * RÔLE    : Expose les routes HTTP pour la gestion des centres (Dar Chabab).
 * ============================================================
 *
 * Ce controller gère deux niveaux d'accès :
 *
 * 1. ROUTES PUBLIQUES (sans token JWT)
 *    → Accessibles depuis l'app Flutter avant que l'utilisateur soit connecté
 *    → Utilisées lors de l'onboarding : l'utilisateur choisit son centre
 *
 * 2. ROUTES ADMINISTRATIVES (protégées par JWT + rôle)
 *    → Réservées à l'ADMIN (super-admin) ou au RESPONSABLE_CENTRE
 *    → Accessibles depuis le dashboard web d'administration
 *
 * ROUTES COMPLÈTES :
 *   GET    /centres                    → liste tous les centres (public, filtre par gouvernorat)
 *   GET    /centres/:id                → détails d'un centre + locaux + clubs (public)
 *   POST   /centres                    → créer un centre       [ADMIN seulement]
 *   PATCH  /centres/:id                → modifier un centre    [ADMIN ou RESPONSABLE_CENTRE]
 *   DELETE /centres/:id                → désactiver un centre  [ADMIN seulement]
 *   PATCH  /centres/:id/activate       → réactiver un centre  [ADMIN seulement]
 *
 * GUARDS utilisés :
 *   AuthGuard('jwt')  → vérifie que le token JWT est valide (via JwtStrategy)
 *   RolesGuard        → vérifie que le rôle de l'utilisateur est dans @Roles(...)
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
} from '@nestjs/common';
import { CentresService } from './centres.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('centres')
export class CentresController {
  constructor(private readonly centresService: CentresService) {}

  // ─── ROUTES PUBLIQUES ────────────────────────────────────────────────────────

  /**
   * GET /centres?gouvernorat=Tunis
   * Liste tous les centres, avec un filtre optionnel par gouvernorat.
   * Pas de token requis → utilisé lors de l'onboarding Flutter (choix du centre).
   * La réponse inclut des statistiques (_count) pour le dashboard admin.
   */
  @Get()
  findAll(@Query('gouvernorat') gouvernorat?: string) {
    return this.centresService.findAll(gouvernorat);
  }

  /**
   * GET /centres/:id
   * Retourne tous les détails d'un centre spécifique :
   *   - ses locaux (salles)
   *   - ses clubs et leur responsable
   *   - ses responsables (RESPONSABLE_CENTRE)
   *   - son inventaire
   *   - les compteurs (_count)
   * Pas de token requis → utilisé aussi bien en mobile qu'en web.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.centresService.findOne(id);
  }

  // ─── ROUTES ADMINISTRATIVES (protégées) ──────────────────────────────────────

  /**
   * POST /centres
   * Crée un nouveau centre (Dar Chabab).
   * Réservé à l'ADMIN uniquement.
   * Le body peut contenir : nom, gouvernorat, delegation, adresse, etc.
   */
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  create(@Body() createCentreDto: any) {
    return this.centresService.create(createCentreDto);
  }

  /**
   * PATCH /centres/:id
   * Modifie les informations d'un centre existant.
   * Accessible par l'ADMIN ou le RESPONSABLE_CENTRE (qui gère son propre centre).
   */
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'RESPONSABLE_CENTRE')
  update(@Param('id') id: string, @Body() updateCentreDto: any) {
    return this.centresService.update(id, updateCentreDto);
  }

  /**
   * DELETE /centres/:id
   * Désactive un centre (soft delete : est_actif = false).
   * On ne supprime jamais un centre en BDD pour préserver l'historique.
   * Réservé à l'ADMIN uniquement.
   */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.centresService.remove(id);
  }

  /**
   * PATCH /centres/:id/activate
   * Réactive un centre qui avait été désactivé (est_actif = true).
   * Réservé à l'ADMIN uniquement.
   */
  @Patch(':id/activate')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  activate(@Param('id') id: string) {
    return this.centresService.activate(id);
  }
}
