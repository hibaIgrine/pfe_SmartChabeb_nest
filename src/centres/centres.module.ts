/**
 * ============================================================
 * FICHIER : centres.module.ts
 * RÔLE    : Point d'entrée du module de gestion des centres.
 * ============================================================
 *
 * Un "Centre" dans SmartChabeb correspond à une Dar Chabab (maison des jeunes),
 * c'est l'entité géographique principale qui regroupe :
 *   - des utilisateurs (adhérents, coachs, responsables)
 *   - des locaux (salles, espaces)
 *   - des clubs (associations, activités)
 *   - un inventaire (matériel)
 *
 * Ce module exporte CentresService pour qu'il puisse être utilisé
 * par d'autres modules (ex: UsersModule pour assigner un utilisateur à un centre).
 */

import { Module } from '@nestjs/common';
import { CentresService } from './centres.service';
import { CentresController } from './centres.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  // PrismaModule fournit PrismaService (connexion à la base de données PostgreSQL)
  imports: [PrismaModule],

  // Expose les routes HTTP : GET/POST/PATCH/DELETE /centres
  controllers: [CentresController],

  // CentresService contient toute la logique métier des centres
  providers: [CentresService],

  // exports : rend CentresService disponible pour les autres modules qui importent CentresModule
  // Ex: UsersModule l'utilise pour assignToCentre()
  exports: [CentresService],
})
export class CentresModule {}
