import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {

  const app = await NestFactory.create(AppModule);
  //configuration de swagger
  const config = new DocumentBuilder()
    .setTitle('SmartChabeb API')
    .addBearerAuth()
    .setDescription("L'API pour le projet PFE SmartChabeb")
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Supprime les données envoyées qui ne sont pas dans le DTO
      forbidNonWhitelisted: true, // Renvoie une erreur si on envoie des données en trop
      transform: true, // Transforme les types (ex: string en number) automatiquement
    }),
  );

  app.enableCors();
  
  await app.listen(3000, '0.0.0.0');

}
bootstrap();
