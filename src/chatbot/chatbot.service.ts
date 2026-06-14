/**
 * ============================================================
 * FICHIER : chatbot.service.ts
 * RÔLE    : Logique métier du chatbot IA — Groq LLM + persistance BDD.
 * ============================================================
 *
 * MODÈLE IA : llama-3.3-70b-versatile (Groq API)
 *   temperature = 0.2 pour des réponses précises et peu créatives
 *   temperature = 0   pour le classifier de scope (réponse déterministe)
 *
 * CONSTANTES CLÉS :
 *   maxHistoryMessages      = 8  → limite l'historique passé au LLM (tokens)
 *   availabilityLookaheadDays = 30 → fenêtre de disponibilité des locaux chargée en BDD
 *   chatbotUserEmail = 'chatbot@smartchabeb.local' → email du bot virtuel en BDD
 *
 * TYPES INTERNES (non exposés en HTTP) :
 *   ChatbotAgendaItem          → un créneau dans l'agenda d'un local (event ou réservation)
 *   ChatbotLocalContext        → local enrichi de son agenda des 30 prochains jours
 *   ChatbotEventPlanningContext → event_request_creation formaté pour le prompt
 *   ChatbotStoredMessage       → message brut tel que stocké en BDD
 *   ChatbotStoredConversation  → conversation brute avec messages + participants
 *   ChatbotConversation        → conversation formatée retournée au front
 *
 * MÉTHODES PUBLIQUES :
 *
 *   getUserConversations(userId)
 *     findMany conversations WHERE type='chatbot' AND created_by=userId (20 max, DESC).
 *     Chaque conversation est formatée via formatConversation().
 *
 *   getUserConversation(userId, conversationId)
 *     findFirst conversation par id + userId. NotFoundException si absente.
 *
 *   getChatResponse(userId, history, userMessage, conversationId?)
 *     PIPELINE COMPLET :
 *     1. Valide le message (BadRequestException si vide)
 *     2. Promise.all → 5 requêtes BDD en parallèle :
 *        - clubs (actifs, max 12)
 *        - events (actifs, date ≥ aujourd'hui, max 20)
 *        - locaux (actifs, max 20)
 *        - réservations (30 prochains jours, max 80)
 *        - event_request_creations (date ≥ aujourd'hui, max 40)
 *     3. getOrCreateChatbotUserId → upsert utilisateur bot en BDD
 *     4. findConversationForUser si conversationId fourni
 *     5. classifyMessageScope → appel Groq classifier (temperature=0)
 *        - OUT_OF_SCOPE → retourne outOfScopeReply sans appel LLM principal
 *     6. buildLocalContexts → enrichit chaque local avec son agenda (events + réservations triés)
 *     7. buildEventPlanningContexts → formate les event_request_creations
 *     8. buildSystemPrompt → prompt système avec données JSON injectées
 *     9. generateGroqReply → appel Groq principal (temperature=0.2)
 *     10. createConversationWithMessages OU appendToExistingConversation ($transaction)
 *     11. Retourne { response, conversationId }
 *
 * MÉTHODES PRIVÉES :
 *
 *   getGroqClient()             → lazy init du client Groq (singleton)
 *   generateGroqReply(messages) → appel API Groq chat.completions.create
 *   getOrCreateChatbotUserId()  → upsert utilisateur virtuel chatbot (role='CHATBOT')
 *   findConversationForUser()   → findFirst conversation par (id, type, created_by)
 *   formatConversation()        → convertit ChatbotStoredConversation → ChatbotConversation
 *   formatStoredMessages()      → messages BDD → ChatbotHistoryMessage[] (sender_id=botUserId → role='model')
 *   buildConversationTitle()    → premier message utilisateur tronqué à 42 chars
 *   createConversationWithMessages() → $transaction : create conversation + createMany messages + update last_message_at
 *   appendToExistingConversation()   → $transaction : createMany messages + update last_message_at
 *   normalizeHistory()          → ChatbotHistoryMessage[] → Groq messages (role 'model' → 'assistant'), filtre vides, prend les 8 derniers
 *   toGroqMessages()            → alias de normalizeHistory (convertion historique BDD vers Groq)
 *   buildSystemPrompt()         → prompt système complet avec clubs/events/locaux/planification en JSON
 *   buildLocalContexts()        → pour chaque local : filtre events + réservations → agenda trié chronologiquement
 *   buildEventPlanningContexts() → map event_request_creations → ChatbotEventPlanningContext[]
 *   classifyMessageScope()      → appel Groq classifier → { inScope: boolean }
 *   getTodayStart()             → new Date() avec heures à 00:00:00
 *   getLookaheadDate()          → getTodayStart() + 30 jours
 *   toDateString()              → Date → "YYYY-MM-DD"
 *   toIsoString()               → Date → ISO 8601 complet
 *
 * TABLE PRISMA : conversations (type='chatbot'), messages, conversation_participants, utilisateurs
 */

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChatbotHistoryMessage,
  ChatbotResponseDto,
} from './chatbot.types';

/** Créneau dans l'agenda d'un local (issu d'un événement ou d'une réservation) */
type ChatbotAgendaItem = {
  source: 'event' | 'reservation';
  title: string;
  date: string;
  start: string;
  end: string;
  status?: string;
  club?: string | null;
};

/** Local enrichi avec son agenda des 30 prochains jours (events + réservations) injecté dans le prompt */
type ChatbotLocalContext = {
  id: string;
  nom: string;
  type: string;
  capacite: number | null;
  localisation: string | null;
  prix_heure: string | null;
  centre: string | null;
  est_actif: boolean;
  agenda: ChatbotAgendaItem[];
};

/** Demande d'événement (event_request_creation) formatée pour le prompt de planification */
type ChatbotEventPlanningContext = {
  id: string;
  nom: string;
  date_event: string;
  start_time: string;
  end_time: string;
  status: string;
  capacity: number | null;
  club: string | null;
  local: string | null;
  timeline: unknown;
  collaborating_club_ids: string[];
};

/** Message brut tel que stocké dans la table `messages` de Prisma */
type ChatbotStoredMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  created_at: Date;
};

/** Conversation brute depuis Prisma, avec messages et participants inclus */
type ChatbotStoredConversation = {
  id: string;
  title: string | null;
  updated_at: Date;
  messages: ChatbotStoredMessage[];
  participants: { user_id: string }[];
};

/** Conversation formatée retournée au front-end via le controller */
type ChatbotConversation = {
  id: string;
  title: string;
  messages: ChatbotHistoryMessage[];
  updatedAt: string;
};

@Injectable()
export class ChatbotService {
  private groqClient: Groq | null = null;
  private readonly model = 'llama-3.3-70b-versatile';
  private readonly maxHistoryMessages = 8;
  private readonly availabilityLookaheadDays = 30;
  private readonly outOfScopeReply =
    "Désolé, je n'ai pas l'accès pour répondre à cette question hors sujet. Je peux seulement aider sur les maisons des jeunes, les clubs, les événements, les locaux, la disponibilité des locaux et les activités de club.";
  private readonly chatbotUserEmail = 'chatbot@smartchabeb.local';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 20 dernières conversations chatbot de l'utilisateur (type='chatbot', DESC).
   * Inclut messages (ASC) et participants pour le formatage.
   */
  async getUserConversations(userId: string): Promise<ChatbotConversation[]> {
    const botUserId = await this.getOrCreateChatbotUserId();
    const conversations = await this.prisma.conversations.findMany({
      where: {
        type: 'chatbot',
        created_by: userId,
      },
      include: {
        messages: {
          orderBy: {
            created_at: 'asc',
          },
        },
        participants: {
          select: {
            user_id: true,
          },
        },
      },
      orderBy: {
        updated_at: 'desc',
      },
      take: 20,
    });

    return conversations.map((conversation) =>
      this.formatConversation(
        conversation as ChatbotStoredConversation,
        botUserId,
      ),
    );
  }

  /** Retourne une conversation spécifique. NotFoundException si non trouvée ou n'appartient pas à userId. */
  async getUserConversation(userId: string, conversationId: string) {
    const botUserId = await this.getOrCreateChatbotUserId();
    const conversation = await this.findConversationForUser(
      userId,
      conversationId,
    );

    if (!conversation) {
      throw new NotFoundException('Conversation introuvable');
    }

    return this.formatConversation(
      conversation as ChatbotStoredConversation,
      botUserId,
    );
  }

  /**
   * Pipeline complet : charge BDD → classifier scope → prompt → Groq → sauvegarde conversation.
   * Si OUT_OF_SCOPE → retourne outOfScopeReply sans appel LLM principal.
   * Si conversationId fourni → continue la conversation existante, sinon en crée une nouvelle.
   */
  async getChatResponse(
    userId: string,
    history: ChatbotHistoryMessage[] = [],
    userMessage: string,
    conversationId?: string,
  ): Promise<ChatbotResponseDto> {
    try {
      const normalizedMessage = userMessage.toLowerCase().trim();

      if (!normalizedMessage) {
        throw new BadRequestException('Le message ne peut pas être vide.');
      }

      const [clubs, events, locaux, reservations, eventRequests] =
        await Promise.all([
          this.prisma.clubs.findMany({
            where: { est_actif: true },
            select: {
              id: true,
              nom: true,
              categorie: true,
              description: true,
              capacite: true,
              locale_fixe: true,
              est_actif: true,
              centre: { select: { nom: true } },
            },
            orderBy: { nom: 'asc' },
            take: 12,
          }),
          this.prisma.events.findMany({
            where: {
              is_active: true,
              date_event: { gte: this.getTodayStart() },
            },
            select: {
              id: true,
              nom: true,
              description: true,
              date_event: true,
              start_time: true,
              end_time: true,
              capacity: true,
              club: { select: { nom: true } },
              local: { select: { nom: true } },
            },
            orderBy: [{ date_event: 'asc' }, { start_time: 'asc' }],
            take: 20,
          }),
          this.prisma.locaux.findMany({
            where: { est_actif: true },
            select: {
              id: true,
              nom: true,
              type: true,
              capacite: true,
              localisation: true,
              prix_heure: true,
              est_actif: true,
              centre: { select: { nom: true } },
            },
            orderBy: { nom: 'asc' },
            take: 20,
          }),
          this.prisma.reservations_locaux.findMany({
            where: {
              date_reservation: {
                gte: this.getTodayStart(),
                lte: this.getLookaheadDate(),
              },
            },
            select: {
              id: true,
              date_reservation: true,
              heure_debut: true,
              heure_fin: true,
              objet: true,
              statut: true,
              local: { select: { id: true, nom: true } },
            },
            orderBy: [{ date_reservation: 'asc' }, { heure_debut: 'asc' }],
            take: 80,
          }),
          this.prisma.event_request_creations.findMany({
            where: {
              date_event: {
                gte: this.getTodayStart(),
              },
            },
            select: {
              id: true,
              nom: true,
              date_event: true,
              start_time: true,
              end_time: true,
              status: true,
              capacity: true,
              timeline: true,
              collaborating_club_ids: true,
              club: { select: { nom: true } },
              local: { select: { nom: true } },
            },
            orderBy: [{ date_event: 'asc' }, { start_time: 'asc' }],
            take: 40,
          }),
        ]);

      const botUserId = await this.getOrCreateChatbotUserId();
      const existingConversation = conversationId
        ? await this.findConversationForUser(userId, conversationId)
        : null;

      if (conversationId && !existingConversation) {
        throw new NotFoundException('Conversation introuvable');
      }

      const previousMessages = existingConversation
        ? this.toGroqMessages(
            this.formatStoredMessages(existingConversation.messages, botUserId),
          )
        : this.normalizeHistory(history);

      const scopeDecision = await this.classifyMessageScope(normalizedMessage);

      if (!scopeDecision.inScope) {
        return {
          response: this.outOfScopeReply,
          conversationId:
            conversationId ??
            existingConversation?.id ??
            (
              await this.createConversationWithMessages({
                userId,
                botUserId,
                title: this.buildConversationTitle([
                  { role: 'user', parts: [{ text: userMessage.trim() }] },
                ]),
                userMessage: userMessage.trim(),
                assistantMessage: this.outOfScopeReply,
              })
            ).id,
        };
      }

      const localContexts = this.buildLocalContexts(
        locaux,
        events,
        reservations,
      );
      const eventPlanningContexts =
        this.buildEventPlanningContexts(eventRequests);
      const systemPrompt = this.buildSystemPrompt(
        clubs,
        events,
        localContexts,
        eventPlanningContexts,
      );
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        ...previousMessages,
        { role: 'user', content: userMessage.trim() },
      ];

      const assistantReply = await this.generateGroqReply(messages);

      const savedConversation = existingConversation
        ? await this.appendToExistingConversation({
            conversation: existingConversation,
            userId,
            botUserId,
            userMessage: userMessage.trim(),
            assistantMessage: assistantReply,
          })
        : await this.createConversationWithMessages({
            userId,
            botUserId,
            title: this.buildConversationTitle([
              { role: 'user', parts: [{ text: userMessage.trim() }] },
            ]),
            userMessage: userMessage.trim(),
            assistantMessage: assistantReply,
          });

      return {
        response: assistantReply,
        conversationId: savedConversation.id,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      console.error('Erreur Groq:', error);
      throw new InternalServerErrorException('Service IA indisponible.');
    }
  }

  /** Lazy init du client Groq (singleton) — lit GROQ_API_KEY depuis ConfigService. */
  private getGroqClient() {
    if (this.groqClient) {
      return this.groqClient;
    }

    const apiKey = this.configService.get<string>('GROQ_API_KEY');

    if (!apiKey) {
      throw new InternalServerErrorException(
        'Configuration Groq manquante. Définis GROQ_API_KEY dans le fichier .env.',
      );
    }

    this.groqClient = new Groq({ apiKey });
    return this.groqClient;
  }

  /** Appelle l'API Groq avec les messages et retourne le texte généré. temperature=0.2 */
  private async generateGroqReply(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ) {
    const groq = this.getGroqClient();
    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: this.model,
      temperature: 0.2,
    });

    return (
      chatCompletion.choices[0]?.message?.content ||
      'Désolé, je ne peux pas répondre.'
    );
  }

  /**
   * Upsert de l'utilisateur virtuel chatbot (email: chatbot@smartchabeb.local, role='CHATBOT').
   * Cet utilisateur représente l'IA comme expéditeur des messages de réponse en BDD.
   */
  private async getOrCreateChatbotUserId() {
    const botUser = await this.prisma.utilisateurs.upsert({
      where: { email: this.chatbotUserEmail },
      update: {},
      create: {
        nom: 'Chatbot',
        prenom: 'Assistant',
        email: this.chatbotUserEmail,
        mot_de_passe: null,
        role: 'CHATBOT',
        compte_actif: false,
        est_verifie: true,
      },
      select: { id: true },
    });

    return botUser.id;
  }

  /** findFirst conversation par (id, type='chatbot', created_by=userId) avec messages + participants. */
  private async findConversationForUser(
    userId: string,
    conversationId: string,
  ): Promise<ChatbotStoredConversation | null> {
    const conversation = await this.prisma.conversations.findFirst({
      where: {
        id: conversationId,
        type: 'chatbot',
        created_by: userId,
      },
      include: {
        messages: {
          orderBy: {
            created_at: 'asc',
          },
        },
        participants: {
          select: {
            user_id: true,
          },
        },
      },
    });

    return conversation as ChatbotStoredConversation | null;
  }

  /** Convertit une conversation brute (BDD) en ChatbotConversation formatée pour le front. */
  private formatConversation(
    conversation: ChatbotStoredConversation,
    botUserId: string,
  ): ChatbotConversation {
    return {
      id: conversation.id,
      title: conversation.title ?? 'Nouvelle conversation',
      messages: this.formatStoredMessages(conversation.messages, botUserId),
      updatedAt: conversation.updated_at.toISOString(),
    };
  }

  /** Convertit les messages BDD en ChatbotHistoryMessage[]. sender_id=botUserId → role='model', sinon 'user'. */
  private formatStoredMessages(
    messages: ChatbotStoredMessage[],
    botUserId: string,
  ): ChatbotHistoryMessage[] {
    return messages
      .filter((message) => Boolean(message.content?.trim()))
      .map((message) => ({
        role: message.sender_id === botUserId ? 'model' : 'user',
        parts: [{ text: message.content ?? '' }],
      }));
  }

  /** Premier message utilisateur, tronqué à 42 chars + "..." si dépassé. Défaut: 'Nouvelle conversation'. */
  private buildConversationTitle(messages: ChatbotHistoryMessage[]) {
    const firstUserMessage = messages
      .find((message) => message.role === 'user')
      ?.parts[0]?.text?.trim();

    if (!firstUserMessage) {
      return 'Nouvelle conversation';
    }

    return firstUserMessage.length > 42
      ? `${firstUserMessage.slice(0, 42).trim()}...`
      : firstUserMessage;
  }

  /**
   * $transaction : crée la conversation + 2 messages (user + bot) + met à jour last_message_at.
   * Participants créés : userId (MEMBER) + botUserId (BOT).
   */
  private async createConversationWithMessages(params: {
    userId: string;
    botUserId: string;
    title: string;
    userMessage: string;
    assistantMessage: string;
  }) {
    const { userId, botUserId, title, userMessage, assistantMessage } = params;

    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversations.create({
        data: {
          type: 'chatbot',
          title,
          created_by: userId,
          participants: {
            create: [
              {
                user_id: userId,
                role: 'MEMBER',
              },
              {
                user_id: botUserId,
                role: 'BOT',
              },
            ],
          },
        },
      });

      await tx.messages.createMany({
        data: [
          {
            conversation_id: conversation.id,
            sender_id: userId,
            content: userMessage,
          },
          {
            conversation_id: conversation.id,
            sender_id: botUserId,
            content: assistantMessage,
          },
        ],
      });

      await tx.conversations.update({
        where: { id: conversation.id },
        data: {
          last_message_at: new Date(),
        },
      });

      return conversation;
    });
  }

  /**
   * $transaction : ajoute 2 messages (user + bot) à une conversation existante + met à jour last_message_at.
   */
  private async appendToExistingConversation(params: {
    conversation: ChatbotStoredConversation;
    userId: string;
    botUserId: string;
    userMessage: string;
    assistantMessage: string;
  }) {
    const { conversation, userId, botUserId, userMessage, assistantMessage } =
      params;

    await this.prisma.$transaction(async (tx) => {
      await tx.messages.createMany({
        data: [
          {
            conversation_id: conversation.id,
            sender_id: userId,
            content: userMessage,
          },
          {
            conversation_id: conversation.id,
            sender_id: botUserId,
            content: assistantMessage,
          },
        ],
      });

      await tx.conversations.update({
        where: { id: conversation.id },
        data: {
          last_message_at: new Date(),
        },
      });
    });

    return conversation;
  }

  /**
   * Convertit ChatbotHistoryMessage[] → format Groq (role 'model' → 'assistant').
   * Filtre les messages vides, prend les 8 derniers (maxHistoryMessages), joint les parts en \n.
   */
  private normalizeHistory(
    history: ChatbotHistoryMessage[],
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    return history
      .filter((message) => message.parts.length > 0)
      .slice(-this.maxHistoryMessages)
      .flatMap((message) => {
        const content = message.parts
          .map((part) => part.text)
          .filter(Boolean)
          .join('\n')
          .trim();

        if (!content) {
          return [];
        }

        return [
          {
            role: message.role === 'model' ? 'assistant' : 'user',
            content,
          },
        ];
      });
  }

  /** Alias de normalizeHistory — utilisé pour convertir l'historique chargé depuis la BDD. */
  private toGroqMessages(
    history: ChatbotHistoryMessage[],
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.normalizeHistory(history);
  }

  /**
   * Construit le prompt système en français avec les données JSON injectées.
   * Contient les règles métier + CLUBS, EVENEMENTS, LOCAUX_ET_DISPONIBILITE, PLANIFICATION_EVENEMENTS.
   * Le modèle est instructed à refuser les sujets hors périmètre.
   */
  private buildSystemPrompt(
    clubs: any[],
    events: any[],
    locaux: ChatbotLocalContext[],
    eventRequests: ChatbotEventPlanningContext[],
  ) {
    return [
      "Tu es l'assistant officiel de notre plateforme associative en Tunisie.",
      "Réponds en français ou en derja tunisienne selon la langue de l'utilisateur.",
      'Tu ne réponds que sur la maison des jeunes et son périmètre métier.',
      "Les seuls sujets autorisés sont: clubs, événements, locaux, disponibilité des locaux, activités de club, recommandation d'activités pour une séance, et planification d'événements avec timeline.",
      'Appuie-toi uniquement sur les données de la base fournies ci-dessous pour répondre avec précision.',
      "Pour la disponibilité des locaux, considère qu'un local est occupé si un événement ou une réservation chevauche le créneau demandé.",
      "Pour la planification d'événements, aide à structurer les étapes, les horaires, les ressources, les locaux et la timeline à partir des données fournies.",
      "Si une information n'est pas présente dans les données, dis-le clairement et propose de vérifier auprès de l'administration plutôt que d'inventer.",
      "Si l'utilisateur demande un sujet hors de ce périmètre, refuse poliment avec une phrase courte.",
      '',
      'DONNÉES RÉELLES DE LA BASE :',
      `CLUBS = ${JSON.stringify(clubs, null, 2)}`,
      `EVENEMENTS = ${JSON.stringify(events, null, 2)}`,
      `LOCAUX_ET_DISPONIBILITE = ${JSON.stringify(locaux, null, 2)}`,
      `PLANIFICATION_EVENEMENTS = ${JSON.stringify(eventRequests, null, 2)}`,
    ].join('\n');
  }

  /** Formate les event_request_creations pour le prompt : dates ISO, noms de club/local. */
  private buildEventPlanningContexts(
    eventRequests: any[],
  ): ChatbotEventPlanningContext[] {
    return eventRequests.map((eventRequest) => ({
      id: eventRequest.id,
      nom: eventRequest.nom,
      date_event: this.toDateString(eventRequest.date_event),
      start_time: this.toIsoString(eventRequest.start_time),
      end_time: this.toIsoString(eventRequest.end_time),
      status: eventRequest.status,
      capacity: eventRequest.capacity,
      club: eventRequest.club?.nom ?? null,
      local: eventRequest.local?.nom ?? null,
      timeline: eventRequest.timeline,
      collaborating_club_ids: eventRequest.collaborating_club_ids ?? [],
    }));
  }

  /**
   * Appel Groq classifier (temperature=0) → répond IN_SCOPE ou OUT_OF_SCOPE.
   * En cas d'erreur Groq → fallback inScope=true (ne bloque pas l'utilisateur).
   */
  private async classifyMessageScope(
    userMessage: string,
  ): Promise<{ inScope: boolean }> {
    const classifierMessages = [
      {
        role: 'system' as const,
        content:
          "Tu es un classificateur d'intention. Réponds uniquement par IN_SCOPE ou OUT_OF_SCOPE. IN_SCOPE si le message concerne la maison des jeunes, les clubs, les événements, la planification d'événements, les timelines, les locaux, la disponibilité, les activités de club, les recommandations d'activités, ou toute aide liée à cette application. OUT_OF_SCOPE uniquement si le message parle d'un sujet extérieur à cette application.",
      },
      {
        role: 'user' as const,
        content: userMessage,
      },
    ];

    try {
      const groq = this.getGroqClient();
      const result = await groq.chat.completions.create({
        messages: classifierMessages,
        model: this.model,
        temperature: 0,
      });

      const rawDecision =
        result.choices[0]?.message?.content?.trim().toUpperCase() ?? '';

      return {
        inScope: rawDecision !== 'OUT_OF_SCOPE',
      };
    } catch (error) {
      console.warn(
        'Classification scope failed, falling back to in-scope:',
        error,
      );
      return { inScope: true };
    }
  }

  /**
   * Enrichit chaque local avec son agenda des 30 prochains jours.
   * Fusionne events (filtrés par local.nom) et réservations (filtrées par local.id).
   * Trie l'agenda chronologiquement par "YYYY-MM-DDThh:mm" via localeCompare.
   */
  private buildLocalContexts(
    locaux: any[],
    events: any[],
    reservations: any[],
  ): ChatbotLocalContext[] {
    return locaux.map((local) => {
      const localEvents = events.filter(
        (event) => event.local?.nom === local.nom,
      );
      const localReservations = reservations.filter(
        (reservation) => reservation.local?.id === local.id,
      );

      const agenda: ChatbotAgendaItem[] = [
        ...localEvents.map((event) => ({
          source: 'event' as const,
          title: event.nom,
          date: this.toDateString(event.date_event),
          start: this.toIsoString(event.start_time),
          end: this.toIsoString(event.end_time),
          club: event.club?.nom ?? null,
        })),
        ...localReservations.map((reservation) => ({
          source: 'reservation' as const,
          title: reservation.objet,
          date: this.toDateString(reservation.date_reservation),
          start: this.toIsoString(reservation.heure_debut),
          end: this.toIsoString(reservation.heure_fin),
          status: reservation.statut,
        })),
      ].sort((left, right) => {
        const leftStamp = `${left.date}T${left.start}`;
        const rightStamp = `${right.date}T${right.start}`;

        return leftStamp.localeCompare(rightStamp);
      });

      return {
        id: local.id,
        nom: local.nom,
        type: local.type,
        capacite: local.capacite,
        localisation: local.localisation,
        prix_heure: local.prix_heure?.toString() ?? null,
        centre: local.centre?.nom ?? null,
        est_actif: local.est_actif,
        agenda,
      };
    });
  }

  /** Retourne aujourd'hui à 00:00:00 (heure locale). Borne inférieure des requêtes BDD. */
  private getTodayStart() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /** Retourne aujourd'hui + availabilityLookaheadDays (30j). Borne supérieure des réservations. */
  private getLookaheadDate() {
    const date = this.getTodayStart();
    date.setDate(date.getDate() + this.availabilityLookaheadDays);
    return date;
  }

  /** Convertit une Date en "YYYY-MM-DD" (10 premiers chars ISO). */
  private toDateString(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  /** Convertit une Date en chaîne ISO 8601 complète (ex: "2024-01-15T09:00:00.000Z"). */
  private toIsoString(value: Date) {
    return value.toISOString();
  }
}
