/**
 * ============================================================
 * FICHIER : users.module.ts
 * RÔLE    : Module de gestion complète des utilisateurs.
 * ============================================================
 *
 * Ce module couvre tout ce qui concerne un utilisateur dans SmartChabeb :
 *   - Inscription et vérification d'email
 *   - Profil personnel (photo, bio, genre, date de naissance)
 *   - Gamification (points, badges, classement)
 *   - Système social (follow/unfollow, profil public)
 *   - Actions admin (ban, changement de rôle, assignation de centre)
 *
 * IMPORTS :
 *   PrismaModule       → connexion PostgreSQL (toujours nécessaire)
 *   MailerModule       → envoi d'emails (mail de bienvenue à l'inscription)
 *   EtablissementsModule → exposé par établissementsModule pour findOrCreate()
 *                          utilisé quand l'utilisateur renseigne son école dans le profil
 *
 * UsersService est EXPORTÉ → AuthModule peut l'utiliser.
 */

import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { EtablissementsModule } from 'src/etablissements/etablissements.module';

@Module({
  imports: [
    PrismaModule,          // Accès à la base de données PostgreSQL
    MailerModule,          // Pour envoyer l'email de bienvenue lors de l'inscription
    EtablissementsModule,  // Pour findOrCreate() lors de la mise à jour du profil
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // Exporté pour que AuthModule puisse y accéder
})
export class UsersModule {}
