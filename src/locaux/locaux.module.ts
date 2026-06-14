/**
 * ============================================================
 * FICHIER : locaux.module.ts
 * RÔLE    : Module de gestion des locaux (salles/espaces d'un centre).
 * ============================================================
 *
 * Un "Local" est un espace physique à l'intérieur d'un centre (Dar Chabab) :
 * salle de sport, théâtre, salle de réunion, espace polyvalent, etc.
 *
 * Les locaux peuvent être réservés par les adhérents (module réservations).
 * Ils sont liés à un centre via `id_centre` (clé étrangère).
 *
 * Contrairement à CentresModule, LocauxModule n'exporte pas LocauxService
 * car il n'est utilisé par aucun autre module pour l'instant.
 */

import { Module } from '@nestjs/common';
import { LocauxService } from './locaux.service';
import { LocauxController } from './locaux.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LocauxController],
  providers: [LocauxService],
  // Pas d'exports : LocauxService n'est pas utilisé par d'autres modules
})
export class LocauxModule {}
