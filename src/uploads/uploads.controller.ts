/**
 * ============================================================
 * FICHIER : uploads.controller.ts
 * RÔLE    : Gestion de l'upload de fichiers sur disque via Multer.
 * ============================================================
 *
 * BASE URL : /uploads
 *
 * ROUTE EXPOSÉE :
 *
 *   POST /uploads/task-proof                    [Pas d'authentification]
 *     → Upload d'un fichier (champ multipart/form-data nommé 'file').
 *     → Limite : 20 Mo (fileSize: 20 * 1024 * 1024 octets).
 *     → Stockage : ./uploads/task-proofs/<nom_unique>.<ext>
 *     → Retourne : { url, filename, type }
 *         url      : chemin public pour accéder au fichier (ex: /uploads/task-proofs/1700000000-abc123.pdf)
 *         filename : nom du fichier sur le disque
 *         type     : MIME type (ex: 'image/png', 'application/pdf')
 *     → Lève BadRequestException si aucun fichier n'est fourni.
 *
 * FONCTIONNEMENT DE MULTER :
 *   FileInterceptor('file', config) intercepte le champ 'file' du formulaire multipart.
 *   diskStorage → stocke directement sur disque (pas en mémoire).
 *   destination : dossier de destination (créé manuellement si inexistant).
 *   filename    : fonction de nommage personnalisée (voir ci-dessous).
 *
 * GÉNÉRATION DU NOM DE FICHIER (fonction `filename`) :
 *   Format : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extname(original)}`
 *   - Date.now()            → timestamp en millisecondes (unicité temporelle)
 *   - Math.random().toString(36).slice(2,8) → 6 caractères aléatoires base36
 *   - extname(file.originalname) → extension d'origine conservée (ex: .jpg, .pdf)
 *   Exemple : "1700000000000-k3x9mz.pdf"
 *   Le callback cb(null, filename) est le mécanisme Multer pour passer le nom calculé.
 *
 * ACCÈS AUX FICHIERS UPLOADÉS :
 *   Pour que l'URL retournée soit accessible depuis le front-end, NestJS doit
 *   servir le dossier ./uploads/ comme fichiers statiques.
 *   Configuration dans main.ts : app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' })
 *   ou via ServeStaticModule.
 */

import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

/**
 * Génère un nom de fichier unique pour éviter les collisions.
 * Format : <timestamp_ms>-<6chars_base36><.extension_originale>
 * Exemple : "1700000000000-k3x9mz.pdf"
 */
function filename(
  req: any,
  file: Express.Multer.File,
  cb: (err: Error | null, filename: string) => void,
) {
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = extname(file.originalname); // Conserve l'extension d'origine (.jpg, .pdf, ...)
  cb(null, `${name}${ext}`);
}

@Controller('uploads')
export class UploadsController {
  /**
   * POST /uploads/task-proof
   * Reçoit un fichier multipart (champ 'file'), le sauvegarde sur disque.
   * Limite 20 Mo. Retourne { url, filename, type }.
   */
  @Post('task-proof')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/task-proofs', // Dossier de stockage (relatif à la racine backend)
        filename,
      }),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 Mo maximum
    }),
  )
  async uploadProof(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Fichier manquant');
    }

    // URL relative pour accéder au fichier (nécessite que /uploads soit servi statiquement)
    const url = `/uploads/task-proofs/${file.filename}`;
    return { url, filename: file.filename, type: file.mimetype };
  }
}
