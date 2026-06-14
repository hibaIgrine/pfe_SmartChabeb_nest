/**
 * ============================================================
 * FICHIER : roles.module.ts
 * RÔLE    : Module CRUD pour la gestion des rôles en base de données.
 * ============================================================
 *
 * CONCEPT : deux systèmes de rôles coexistent dans l'application
 *
 *   1. RÔLES STATIQUES (hardcodés dans le code NestJS) :
 *      Définis par @Roles('ADMIN', 'RESPONSABLE_CLUB', ...) sur les routes.
 *      Ce sont les rôles que JwtStrategy injecte dans req.user.role et que
 *      RolesGuard lit pour autoriser ou refuser l'accès.
 *      Exemples : 'ADMIN', 'RESPONSABLE_CENTRE', 'RESPONSABLE_CLUB', 'ADHERENT'
 *
 *   2. RÔLES DYNAMIQUES (table `roles` en BDD) :
 *      Ce module gère cette table. Les rôles y sont stockés avec un nom + description.
 *      La table `utilisateurs` a une foreign key id_role → roles.id.
 *      Ce sont les grades affectés aux utilisateurs, complémentaires aux rôles statiques.
 *
 * TABLE PRISMA : roles
 *   Champs : id (UUID), nom (STRING unique), description (STRING optionnel)
 *   Relation : utilisateurs.id_role → roles.id (1 rôle → N utilisateurs)
 *
 * ROUTES (BASE URL : /roles) :
 *   POST   /roles      [ADMIN, RESPONSABLE_CLUB] → créer un rôle
 *   GET    /roles                                → lister tous les rôles
 *   GET    /roles/:id                            → trouver un rôle par ID
 *   PATCH  /roles/:id                            → mettre à jour un rôle
 *   DELETE /roles/:id  [ADMIN, RESPONSABLE_CLUB] → supprimer un rôle (vérifie qu'il est inutilisé)
 *
 * IMPORTS :
 *   PrismaModule → accès à la table `roles` et `utilisateurs` (pour compter avant suppression)
 */

import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule], // Accès aux tables `roles` et `utilisateurs`
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
