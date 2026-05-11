import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ClubsModule } from './clubs/clubs.module';
import { RolesModule } from './roles/roles.module';
import { CentresModule } from './centres/centres.module';
import { LocauxModule } from './locaux/locaux.module';
import { ReservationsModule } from './reservations/reservations.module';
import { ClubRolesModule } from './club-roles/club-roles.module';
import { PresencesModule } from './presences/presences.module';

import { NotificationsModule } from './notifications/notifications.module';
import { EventsModule } from './events/events.module';
import { ClubCreationRequestsModule } from './club-creation-requests/club-creation-requests.module';
import { SocialMediaModule } from './social-media/social-media.module';
import { MessagerieModule } from './messagerie/messagerie.module';
import { StoriesModule } from './stories/stories.module';
import { EtablissementsModule } from './etablissements/etablissements.module';
import { CertificatesModule } from './certificates/certificates.module';
import { PaymentsModule } from './payments/payments.module';
import { ClubTasksModule } from './club-tasks/club-tasks.module';

import { RecommendationsModule } from './recommendations/recommendations.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    // 1. Charger les variables d'environnement
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    UsersModule,
    AuthModule,

    // 2. Configuration Robuste du Mailer
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        transport: {
          host: configService.get('MAIL_HOST'),
          port: parseInt(configService.get('MAIL_PORT') || '587'),
          secure: false, // TLS
          auth: {
            user: configService.get('MAIL_USER'),
            pass: configService.get('MAIL_PASS'),
          },
        },
        defaults: {
          from: `"${configService.get('MAIL_FROM_NAME')}" <${configService.get('MAIL_FROM')}>`,
        },
      }),
      inject: [ConfigService],
    }),
    CentresModule,
    ClubsModule,
    ClubRolesModule,
    NotificationsModule,
    RolesModule,
    LocauxModule,
    ReservationsModule,
    PresencesModule,
    EventsModule,
    ClubCreationRequestsModule,
    SocialMediaModule,
    MessagerieModule,
    StoriesModule,
    EtablissementsModule,
    CertificatesModule,
    PaymentsModule,
    ClubTasksModule,
    SessionsModule,
    RecommendationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
