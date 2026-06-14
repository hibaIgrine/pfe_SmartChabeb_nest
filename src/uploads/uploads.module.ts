/**
 * ============================================================
 * FICHIER : uploads.module.ts
 * RÔLE    : Module de gestion des fichiers uploadés via Multer.
 * ============================================================
 *
 * CONCEPT :
 *   Ce module expose des routes pour uploader des fichiers sur le serveur
 *   et les stocker sur le disque local (diskStorage Multer).
 *
 * ROUTE EXPOSÉE :
 *   POST /uploads/task-proof
 *     → Upload d'une pièce jointe (preuve de tâche).
 *     → Limite : 20 Mo par fichier.
 *     → Stockage : ./uploads/task-proofs/<timestamp>-<random>.<ext>
 *     → Retourne : { url, filename, type }
 *
 * STOCKAGE PHYSIQUE :
 *   Les fichiers sont sauvegardés dans le dossier ./uploads/task-proofs/
 *   (relatif à la racine du projet backend, pas dans src/).
 *   Pour servir ces fichiers statiquement, NestJS doit être configuré
 *   avec ServeStaticModule ou useStaticAssets() dans main.ts.
 *
 * NOMMAGE DES FICHIERS :
 *   `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
 *   → Évite les collisions de noms (timestamp + 6 chars aléatoires base36).
 *   → L'extension d'origine est conservée.
 *
 * AUCUN SERVICE :
 *   Ce module n'a pas de service dédié — la logique d'upload est entièrement
 *   gérée dans le controller via FileInterceptor (Multer).
 */

import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';

@Module({
  controllers: [UploadsController],
})
export class UploadsModule {}
