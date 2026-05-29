import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { PrismaService } from '../prisma/prisma.service';
import type { ChatbotHistoryMessage } from './chatbot.types';

type ChatbotAgendaItem = {
  source: 'event' | 'reservation';
  title: string;
  date: string;
  start: string;
  end: string;
  status?: string;
  club?: string | null;
};

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

@Injectable()
export class ChatbotService {
  private groqClient: Groq | null = null;
  private readonly model = 'llama-3.3-70b-versatile';
  private readonly maxHistoryMessages = 8;
  private readonly availabilityLookaheadDays = 30;
  private readonly outOfScopeReply =
    "Désolé, je n'ai pas l'accès pour répondre à cette question hors sujet. Je peux seulement aider sur les maisons des jeunes, les clubs, les événements, les locaux, la disponibilité des locaux et les activités de club.";

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getChatResponse(
    history: ChatbotHistoryMessage[] = [],
    userMessage: string,
  ): Promise<string> {
    try {
      const normalizedMessage = userMessage.toLowerCase().trim();

      if (!this.isInScope(normalizedMessage)) {
        return this.outOfScopeReply;
      }

      const [clubs, events, locaux, reservations] = await Promise.all([
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
      ]);

      const localContexts = this.buildLocalContexts(
        locaux,
        events,
        reservations,
      );
      const systemPrompt = this.buildSystemPrompt(clubs, events, localContexts);
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        ...this.normalizeHistory(history),
        { role: 'user', content: userMessage.trim() },
      ];

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
    } catch (error) {
      console.error('Erreur Groq:', error);
      throw new InternalServerErrorException('Service IA indisponible.');
    }
  }

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

  private buildSystemPrompt(
    clubs: any[],
    events: any[],
    locaux: ChatbotLocalContext[],
  ) {
    return [
      "Tu es l'assistant officiel de notre plateforme associative en Tunisie.",
      "Réponds en français ou en derja tunisienne selon la langue de l'utilisateur.",
      'Tu ne réponds que sur la maison des jeunes et son périmètre métier.',
      "Les seuls sujets autorisés sont: clubs, événements, locaux, disponibilité des locaux, activités de club, recommandation d'activités pour une séance, et informations présentes dans la base.",
      'Appuie-toi uniquement sur les données de la base fournies ci-dessous pour répondre avec précision.',
      "Pour la disponibilité des locaux, considère qu'un local est occupé si un événement ou une réservation chevauche le créneau demandé.",
      "Si une information n'est pas présente dans les données, dis-le clairement et propose de vérifier auprès de l'administration plutôt que d'inventer.",
      "Si l'utilisateur demande un sujet hors de ce périmètre, refuse poliment avec une phrase courte.",
      '',
      'DONNÉES RÉELLES DE LA BASE :',
      `CLUBS = ${JSON.stringify(clubs, null, 2)}`,
      `EVENEMENTS = ${JSON.stringify(events, null, 2)}`,
      `LOCAUX_ET_DISPONIBILITE = ${JSON.stringify(locaux, null, 2)}`,
    ].join('\n');
  }

  private isInScope(message: string) {
    const allowedPatterns = [
      /\bclub(s)?\b/u,
      /\bactivit(e|é|es|és)\b/u,
      /\bseance|séance\b/u,
      /\brecommand/i,
      /\bevent(s)?\b/u,
      /\b(e|é)v(e|é)nement(s)?\b/u,
      /\blocal(aux)?\b/u,
      /\bdisponibilit(e|é)\b/u,
      /\br(e|é)servation(s)?\b/u,
      /\bmaison des jeunes\b/u,
      /\bmdj\b/u,
      /\bcentre(s)?\b/u,
    ];

    return allowedPatterns.some((pattern) => pattern.test(message));
  }

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

  private getTodayStart() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private getLookaheadDate() {
    const date = this.getTodayStart();
    date.setDate(date.getDate() + this.availabilityLookaheadDays);
    return date;
  }

  private toDateString(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private toIsoString(value: Date) {
    return value.toISOString();
  }
}
