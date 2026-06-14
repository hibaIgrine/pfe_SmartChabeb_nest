/**
 * ============================================================
 * FICHIER : club-roles.module.ts
 * RÔLE    : Module de gestion des rôles internes des clubs.
 * ============================================================
 *
 * Concept : Les clubs peuvent définir leurs propres rôles internes (libres),
 * différents des rôles globaux du système (ADMIN, COACH, ADHERENT...).
 *
 * Exemples de rôles club : ENTRAINEUR, ARBITRE, ANIMATEUR, SECRETAIRE...
 *
 * Ces rôles sont stockés dans la table `club_roles` et référencés par
 * la table `club_staff` (colonne id_club_role).
 *
 * DIFFÉRENCE IMPORTANTE :
 *   - Rôle global (table utilisateurs.role) → RESPONSABLE_CLUB, COACH, ADHERENT...
 *     Géré par le module users.
 *   - Rôle club (table club_roles) → rôle libre DANS un club spécifique
 *     Géré par CE module.
 *
 * EXPORTS :
 *   ClubRolesService est exporté pour être utilisé si d'autres modules
 *   ont besoin de créer ou vérifier des rôles club.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ClubRolesController } from './club-roles.controller';
import { ClubRolesService } from './club-roles.service';

@Module({
  imports: [PrismaModule], // Connexion PostgreSQL
  controllers: [ClubRolesController],
  providers: [ClubRolesService],
  exports: [ClubRolesService], // Exporté pour les modules qui créent des staff de club
})
export class ClubRolesModule {}
