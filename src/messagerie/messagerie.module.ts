/**
 * ============================================================
 * FICHIER : messagerie.module.ts
 * RÔLE    : Module de messagerie temps-réel (conversations privées & groupes).
 * ============================================================
 *
 * CONCEPT :
 *   Ce module fournit une messagerie complète : conversations privées (1-à-1)
 *   et conversations de groupe, avec indicateurs de présence, statuts de messages
 *   (SENT → DELIVERED → READ), épinglage, archivage, mise en sourdine et typing.
 *
 * COMPOSANTS :
 *   MessagerieService       — Logique métier HTTP (CRUD conversations, messages, membres...)
 *   MessagerieMuteService   — Gestion de la mise en sourdine (1H / indéfinie / nettoyage)
 *   MessagerieGateway       — Serveur WebSocket Socket.IO (typing temps-réel, join/leave room)
 *   MessagerieController    — Routes HTTP REST (base /messagerie)
 *
 * TABLES PRISMA IMPLIQUÉES :
 *   conversations                — type: 'private' | 'group' | 'chatbot'
 *   conversation_participants    — rôle ADMIN/MEMBER, last_read_at, muted_at, muted_until, archived_at
 *   messages                     — type TEXT/IMAGE/VIDEO/DOCUMENT, status SENT/DELIVERED/READ
 *   message_deleted_for_users    — suppression "rien que pour moi"
 *
 * DÉPENDANCES :
 *   PrismaModule → accès BDD
 *   UsersModule  → findAllForMessaging (liste des utilisateurs contactables)
 *
 * ROUTES HTTP (MessagerieController) :
 *   GET    /messagerie/users
 *   GET    /messagerie/unread-count
 *   PATCH  /messagerie/presence/heartbeat | /offline
 *   POST   /messagerie/conversations/private | /group
 *   GET    /messagerie/conversations/me
 *   GET    /messagerie/conversations/:id
 *   DELETE /messagerie/conversations/:id
 *   GET    /messagerie/conversations/:id/messages
 *   POST   /messagerie/conversations/:id/messages
 *   PATCH  /messagerie/conversations/:id/messages/:messageId
 *   PATCH  /messagerie/conversations/:id/messages/:messageId/pin
 *   DELETE /messagerie/conversations/:id/messages/:messageId
 *   PATCH  /messagerie/conversations/:id/read | /archive | /mute | /title | /typing
 *   POST   /messagerie/conversations/:id/members
 *   DELETE /messagerie/conversations/:id/members/:memberUserId
 *
 * ÉVÉNEMENTS WEBSOCKET (MessagerieGateway) :
 *   → conversation:join    (client → serveur) : rejoindre une room Socket.IO
 *   → conversation:leave   (client → serveur) : quitter une room
 *   → conversation:typing  (bidirectionnel)   : indicateur "en train d'écrire" (window 8s)
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UsersModule } from 'src/users/users.module';
import { MessagerieController } from './messagerie.controller';
import { MessagerieGateway } from './messagerie.gateway';
import { MessagerieMuteService } from './messagerie-mute.service';
import { MessagerieService } from './messagerie.service';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [MessagerieController],
  providers: [MessagerieService, MessagerieMuteService, MessagerieGateway],
  exports: [MessagerieService],
})
export class MessagerieModule {}
