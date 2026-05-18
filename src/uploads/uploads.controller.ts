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

function filename(
  req: any,
  file: Express.Multer.File,
  cb: (err: Error | null, filename: string) => void,
) {
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = extname(file.originalname);
  cb(null, `${name}${ext}`);
}

@Controller('uploads')
export class UploadsController {
  @Post('task-proof')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: './uploads/task-proofs', filename }),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    }),
  )
  async uploadProof(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Fichier manquant');
    }

    const url = `/uploads/task-proofs/${file.filename}`;
    return { url, filename: file.filename, type: file.mimetype };
  }
}
