/**
 * ============================================================
 * FICHIER : chatbot.module.ts
 * RÔLE    : Module d'assistant IA intégré — propulsé par Groq (LLaMA 3.3 70B).
 * ============================================================
 *
 * CONCEPT :
 *   Ce module expose un chatbot contextuel limité au périmètre métier de la
 *   plateforme : clubs, événements, locaux, disponibilité des locaux, activités.
 *   Il utilise l'API Groq avec le modèle llama-3.3-70b-versatile.
 *
 * FLUX D'UNE REQUÊTE (POST /chatbot/ask) :
 *   1. Chargement en parallèle des données BDD (clubs, events, locaux, réservations, eventRequests)
 *   2. Appel Groq classifier → détermine si le message est IN_SCOPE ou OUT_OF_SCOPE
 *      - OUT_OF_SCOPE → réponse fixe, pas d'appel LLM principal
 *   3. Construction du prompt système (injecte les données JSON réelles)
 *   4. Appel Groq principal (llama-3.3-70b, temperature 0.2)
 *   5. Sauvegarde en BDD : conversation (type='chatbot') + messages dans $transaction
 *   6. Retourne { response, conversationId }
 *
 * PERSISTANCE DES CONVERSATIONS :
 *   Les conversations sont stockées dans les tables Prisma `conversations` et `messages`
 *   (partagées avec le module de messagerie humaine, distinguées par type='chatbot').
 *   Un utilisateur virtuel (chatbot@smartchabeb.local, role='CHATBOT') est créé en BDD
 *   pour représenter l'IA comme expéditeur des messages de réponse.
 *
 * ROUTES EXPOSÉES :
 *   POST /chatbot/ask                         [JWT requis]
 *   GET  /chatbot/conversations               [JWT requis]
 *   GET  /chatbot/conversations/:id           [JWT requis]
 *
 * VARIABLES D'ENVIRONNEMENT :
 *   GROQ_API_KEY → clé API Groq (lue via ConfigService, fourni par ConfigModule dans AppModule)
 *
 * NOTE : ConfigModule n'est pas importé ici car il est global dans AppModule.
 *   ConfigService est accessible sans import explicite grâce à @Module({ isGlobal: true }).
 */

import { Module } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule], // Accès BDD : conversations, messages, clubs, events, locaux...
  controllers: [ChatbotController],
  providers: [ChatbotService],
})
export class ChatbotModule {}
