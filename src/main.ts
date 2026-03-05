import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { json, urlencoded } from 'express';

async function bootstrap() {
  // On précise <NestExpressApplication> pour accéder aux fonctions de fichiers statiques
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Pour accepter d'énormes formulaires (Base64 Logo Uploads) sans avoir une erreur "Payload Too Large (413)"
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // 1. Configuration de Swagger
  const config = new DocumentBuilder()
    .setTitle('SmartChabeb API')
    .addBearerAuth()
    .setDescription("L'API pour le projet PFE SmartChabeb")
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // 2. Validation Globale
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 3. Rendre le dossier "uploads" public (Pour voir les photos de profil)
  // Assure-toi de créer un dossier nommé 'uploads' à la racine du projet (à côté de src)
 app.useStaticAssets(join(process.cwd(), 'uploads'), {
   prefix: '/uploads/',
 });

  app.enableCors();

  await app.listen(3000, '0.0.0.0');
}
bootstrap();
