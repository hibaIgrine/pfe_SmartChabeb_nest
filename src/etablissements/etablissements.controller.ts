/**
 * ============================================================
 * FICHIER : etablissements.controller.ts
 * RÔLE    : Routes HTTP pour la recherche d'établissements scolaires.
 * ============================================================
 *
 * Ces routes sont protégées par JWT car elles sont utilisées
 * uniquement depuis l'app Flutter par un utilisateur déjà connecté,
 * lors de la complétion de son profil (champ "établissement fréquenté").
 *
 * ROUTES :
 *   GET /etablissements            → retourne tous les établissements (trié par nom)
 *   GET /etablissements/search?q=  → recherche par nom (insensible à la casse)
 *
 * ORDRE IMPORTANT des routes :
 *   /search doit être AVANT /:id si on ajoute une route par ID,
 *   sinon NestJS interpréterait "search" comme un paramètre :id.
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EtablissementsService } from './etablissements.service';

@Controller('etablissements')
export class EtablissementsController {
  constructor(private readonly etablissementsService: EtablissementsService) {}

  /**
   * GET /etablissements
   * Retourne la liste complète de tous les établissements, triée par nom.
   * Utilisé pour pré-remplir une liste déroulante dans le profil Flutter.
   * Protégé par JWT → seul un utilisateur connecté peut y accéder.
   */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  async getAll() {
    return await this.etablissementsService.findAll();
  }

  /**
   * GET /etablissements/search?q=lycee
   * Recherche des établissements dont le nom contient le terme `q`.
   * La recherche est insensible à la casse (mode: 'insensitive' dans Prisma).
   * Si `q` est vide → retourne tous les établissements (comme getAll).
   * Limité à 50 résultats pour éviter les réponses trop volumineuses.
   */
  @Get('search')
  @UseGuards(AuthGuard('jwt'))
  async search(@Query('q') query: string) {
    return await this.etablissementsService.searchByName(query || '');
  }
}
