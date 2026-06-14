/**
 * ============================================================
 * FICHIER : presences.module.ts
 * RÔLE    : Module de gestion des présences aux séances de clubs.
 * ============================================================
 *
 * CONCEPT : séance + présence
 *   Une séance (table `seances`) représente une réunion/cours d'un club à une date précise.
 *   Une présence (table `presences_clubs`) lie un membre à une séance avec un statut :
 *     PRESENT | ABSENT | (NON_MARQUE si aucun enregistrement)
 *
 * FLUX PRINCIPAL (marquer une présence) :
 *   1. RESP_CLUB ou RESP_CENTRE appelle POST /presences/mark avec { id_club, id_utilisateur, date_presence?, id_seance?, statut }
 *   2. PresencesService.markPresence() :
 *      a. Vérifie que l'utilisateur est bien inscrit au club (inscription ACCEPTE)
 *      b. Trouve ou crée automatiquement la séance pour (id_club, date_presence)
 *      c. Upsert sur presences_clubs (clé composite : id_club + id_utilisateur + id_seance)
 *   3. Pour annuler un marquage : POST /presences/unmark → deleteMany
 *
 * SÉANCES :
 *   - Créées automatiquement si absentes lors du marquage (createSeance est idempotent)
 *   - Peuvent être créées manuellement via POST /presences/seances
 *   - Ont un titre, heure_debut, heure_fin (optionnels)
 *   - TABLE : seances (id, id_club, date_seance, titre, heure_debut, heure_fin)
 *
 * FEEDBACKS SÉANCE (ADHERENT uniquement) :
 *   - L'adhérent voit les séances où il était PRESENT et dont la date est passée
 *   - Il peut soumettre un feedback : note_coach 1-5, note_activites 1-5, commentaire ≤ 500c
 *   - Upsert sur seance_feedbacks (clé composite : id_seance + id_utilisateur)
 *   - Table accédée via `this.prisma as any` (modèle non typé dans Prisma Client)
 *
 * RBAC :
 *   - RESPONSABLE_CLUB : gère les présences de son club (id_coach OU staff actif)
 *   - RESPONSABLE_CENTRE : gère les présences de tous les clubs de son centre
 *   - ADHERENT : accède uniquement à ses propres séances + soumission de feedback
 *
 * EXPORT CSV :
 *   GET /presences/:clubId/export → CSV 26 colonnes (club, centre, membre, statut, remarque, etc.)
 *   L'échappement CSV gère les guillemets, virgules et sauts de ligne embarqués.
 *
 * STATISTIQUES :
 *   GET /presences/:clubId/stats → taux_presence, par_jour (Map date→{presents,absents}),
 *   par_membre (Map userId→{presents,absents,taux})
 *
 * TABLE PRISMA : presences_clubs, seances, seance_feedbacks
 * IMPORTS : PrismaModule → accès PostgreSQL
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PresencesController } from './presences.controller';
import { PresencesService } from './presences.service';

@Module({
  imports: [PrismaModule], // Connexion PostgreSQL (presences_clubs, seances, seance_feedbacks)
  controllers: [PresencesController],
  providers: [PresencesService],
})
export class PresencesModule {}
