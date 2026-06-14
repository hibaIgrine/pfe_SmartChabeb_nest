/**
 * ============================================================
 * FICHIER : certificates.module.ts
 * RÔLE    : Module de génération de certificats de participation.
 * ============================================================
 *
 * CONCEPT :
 *   Ce module permet à un participant confirmé et présent à un événement passé
 *   de générer et télécharger son certificat de participation.
 *   La génération graphique est déléguée à un micro-service Python/Flask
 *   (certificate-service/) qui produit un SVG.
 *
 * FLUX COMPLET DE GÉNÉRATION D'UN CERTIFICAT :
 *
 *   1. Utilisateur appelle GET /certificates/event/:eventId [JWT]
 *   2. CertificatesService vérifie 3 conditions (BadRequestException sinon) :
 *        a. event.end_time < now          → l'événement est bien terminé
 *        b. event_participants WHERE event_id + user_id existe
 *        c. participant.status === 'CONFIRME' ET participant.checkin === true
 *   3. Construction du payload JSON :
 *        { nom_complet, nom_etudiant, prenom, nom, nom_club, nom_centre,
 *          maison_jeune, nom_evenement, date_event, date }
 *   4. Appel HTTP POST http://localhost:5000/generate-certificate-binary (Flask)
 *   5. Flask renvoie : { success, image: "data:image/svg+xml;base64,...", nom_fichier }
 *   6. NestJS retourne au frontend : { success, image, filename, eventName, participantName }
 *
 * MICRO-SERVICE FLASK (certificate-service/app.py) :
 *   - Génère un SVG 1600×1131 px avec Pillow (Image) + SVG natif
 *   - Police arabe : Amiri-Bold (téléchargée automatiquement depuis Google Fonts si absente)
 *   - Tampon officiel SVG : 2 cercles concentriques + texte circulaire (arcs SVG textPath)
 *   - Route utilisée : POST /generate-certificate-binary → base64 SVG
 *
 * TABLES PRISMA :
 *   events             — id, nom, date_event, start_time, end_time, club, local (avec centre)
 *   event_participants — event_id, user_id, status (CONFIRME), checkin (boolean), points_awarded
 *   utilisateurs       — nom, prenom
 *
 * ROUTES EXPOSÉES :
 *   GET /certificates/event/:eventId   [JWT] → Générer et retourner le certificat SVG en base64
 *   GET /certificates/my-attendance    [JWT] → Historique des événements passés avec présence confirmée
 *
 * NOTE : PrismaService est injecté directement (pas via PrismaModule) dans ce module.
 */

import { Module } from '@nestjs/common';
import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [CertificatesService, PrismaService],
  controllers: [CertificatesController],
  exports: [CertificatesService],
})
export class CertificatesModule {}
