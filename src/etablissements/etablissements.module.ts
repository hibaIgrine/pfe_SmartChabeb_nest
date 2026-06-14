/**
 * ============================================================
 * FICHIER : etablissements.module.ts
 * RÔLE    : Module de gestion des établissements scolaires.
 * ============================================================
 *
 * Un "Établissement" dans SmartChabeb est une école, lycée ou université
 * renseignée par l'utilisateur lors de la complétion de son profil.
 *
 * Ce module est SÉPARÉ des centres car les établissements sont des entités
 * indépendantes (une liste de référence partagée) que les utilisateurs
 * peuvent rechercher et sélectionner.
 *
 * EtablissementsService est exporté pour être utilisé par UsersModule
 * (lors de la mise à jour du profil, on peut créer un établissement à la volée).
 */

import { Module } from '@nestjs/common';
import { EtablissementsController } from './etablissements.controller';
import { EtablissementsService } from './etablissements.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EtablissementsController],
  providers: [EtablissementsService],
  // Exporté pour que UsersModule puisse utiliser findOrCreate() lors du profil
  exports: [EtablissementsService],
})
export class EtablissementsModule {}
