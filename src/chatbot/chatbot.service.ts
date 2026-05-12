import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { PrismaService } from '../prisma/prisma.service';
import { ChatbotHistoryMessage } from './chatbot.types';

type ClubRecord = {
  nom: string;
  description: string | null;
  categorie: string;
  capacite: number | null;
  locale_fixe: string | null;
  centre: {
    nom: string;
    gouvernorat: string;
  };
};

type EventRecord = {
  nom: string;
  description: string | null;
  date_event: Date;
  start_time: Date;
  end_time: Date;
  capacity: number | null;
  club: {
    nom: string;
  } | null;
  local: {
    nom: string;
    centre: {
      nom: string;
      gouvernorat: string;
    };
  };
};

@Injectable()
export class ChatbotService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;
  private readonly modelName: string;
  private readonly refusalMessage =
    'Désolé, je suis uniquement qualifié pour vous aider avec les activités de la Maison des Jeunes en Tunisie. Tu peux me demander les clubs, les événements ou les inscriptions.';
  private readonly historyLimit = 10;
  private readonly tunisianDateFormatter = new Intl.DateTimeFormat('fr-TN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Tunis',
  });

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    const apiKey = configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in the environment.');
    }

    this.modelName =
      configService.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: `
Tu es l'assistant officiel des Maisons des Jeunes en Tunisie.
Tu réponds uniquement en français ou en derja tunisienne.
Tu es strictement limité aux clubs, événements, inscriptions, locaux et activités de la Maison des Jeunes.
Si la demande sort de ce périmètre, tu refuses brièvement et tu rediriges vers les activités de la Maison des Jeunes.
Tu ne donnes jamais de réponse sur le code, la cuisine, les devoirs, la politique ou tout autre sujet hors domaine.
Quand tu utilises les données fournies, base-toi uniquement sur le contexte de base de données injecté dans le prompt.
Si une information n'existe pas dans le contexte, dis clairement qu'elle n'est pas encore disponible ou programmée.
      `.trim(),
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: 512,
      },
    });
  }

  async getChatResponse(
    history: ChatbotHistoryMessage[] = [],
    userMessage: string,
  ): Promise<string> {
    const trimmedMessage = userMessage.trim();

    if (!trimmedMessage) {
      return this.refusalMessage;
    }

    if (this.isClearlyOutOfScope(trimmedMessage)) {
      return this.refusalMessage;
    }

    try {
      const [clubs, events] = await Promise.all([
        this.prisma.clubs.findMany({
          where: { est_actif: true },
          orderBy: { nom: 'asc' },
          select: {
            id: true,
            nom: true,
            description: true,
            categorie: true,
            capacite: true,
            locale_fixe: true,
            planning: true,
            centre: {
              select: {
                nom: true,
                gouvernorat: true,
              },
            },
          },
        }) as Promise<ClubRecord[]>,
        this.prisma.events.findMany({
          where: { is_active: true },
          orderBy: [{ date_event: 'asc' }, { start_time: 'asc' }],
          take: 12,
          select: {
            id: true,
            nom: true,
            description: true,
            date_event: true,
            start_time: true,
            end_time: true,
            capacity: true,
            club: {
              select: {
                nom: true,
              },
            },
            local: {
              select: {
                nom: true,
                centre: {
                  select: {
                    nom: true,
                    gouvernorat: true,
                  },
                },
              },
            },
          },
        }) as Promise<EventRecord[]>,
      ]);

      const contextPrompt = this.buildContextPrompt(clubs, events);
      const normalizedHistory = this.normalizeHistory(history);
      const chatSession = this.model.startChat({ history: normalizedHistory });
      const prompt = [
        contextPrompt,
        'Rappel: tu restes strictement dans le domaine de la Maison des Jeunes.',
        `Question utilisateur: ${trimmedMessage}`,
      ].join('\n\n');

      const result = await chatSession.sendMessage(prompt);
      const response = await result.response;
      const answer = response.text().trim();

      return answer || this.refusalMessage;
    } catch (error) {
      console.error('Erreur Chatbot Gemini:', error);
      throw new InternalServerErrorException(
        'Erreur lors de la communication avec le chatbot.',
      );
    }
  }

  private normalizeHistory(history: ChatbotHistoryMessage[]): Content[] {
    const trimmedHistory = history
      .slice(-this.historyLimit)
      .map((message) => ({
        role: message.role,
        parts: message.parts
          .map((part) => ({ text: part.text.trim() }))
          .filter((part) => part.text.length > 0),
      }))
      .filter((message) => message.parts.length > 0);

    const normalizedHistory: Content[] = [];

    for (const message of trimmedHistory) {
      if (normalizedHistory.length === 0 && message.role !== 'user') {
        continue;
      }

      const lastMessage = normalizedHistory[normalizedHistory.length - 1];
      if (lastMessage && lastMessage.role === message.role) {
        continue;
      }

      normalizedHistory.push(message);
    }

    while (
      normalizedHistory.length > 0 &&
      normalizedHistory[0].role !== 'user'
    ) {
      normalizedHistory.shift();
    }

    return normalizedHistory;
  }

  private buildContextPrompt(
    clubs: ClubRecord[],
    events: EventRecord[],
  ): string {
    const clubsContext = clubs.length
      ? clubs
          .map(
            (club) =>
              `- ${club.nom} | Catégorie: ${club.categorie} | Centre: ${club.centre.nom} (${club.centre.gouvernorat}) | ` +
              `Local fixe: ${club.locale_fixe ?? 'Non précisé'} | Capacité: ${club.capacite ?? 'Non précisée'} | ` +
              `Description: ${club.description?.trim() || 'Aucune description disponible'}`,
          )
          .join('\n')
      : '- Aucun club actif trouvé en base pour le moment.';

    const eventsContext = events.length
      ? events
          .map((event) => {
            const dateLabel = this.tunisianDateFormatter.format(
              event.date_event,
            );
            const startLabel = this.tunisianDateFormatter.format(
              event.start_time,
            );
            const endLabel = this.tunisianDateFormatter.format(event.end_time);

            return (
              `- ${event.nom} | Date: ${dateLabel} | Horaire: ${startLabel} - ${endLabel} | ` +
              `Club: ${event.club?.nom ?? 'Non lié'} | Local: ${event.local.nom} | ` +
              `Centre: ${event.local.centre.nom} (${event.local.centre.gouvernorat}) | ` +
              `Capacité: ${event.capacity ?? 'Non précisée'} | Description: ${
                event.description?.trim() || 'Aucune description disponible'
              }`
            );
          })
          .join('\n')
      : '- Aucun événement actif trouvé en base pour le moment.';

    return [
      'Contexte officiel injecté depuis la base de données PostgreSQL de la Maison des Jeunes.',
      "N'utilise que ces informations pour répondre aux questions sur les clubs et les événements.",
      "Si le contexte ne contient pas la réponse, dis que l'information n'est pas encore disponible.",
      `CLUBS:\n${clubsContext}`,
      `ÉVÉNEMENTS:\n${eventsContext}`,
    ].join('\n\n');
  }

  private isClearlyOutOfScope(message: string): boolean {
    const hasAllowedContext =
      /\b(club|clubs|événement|evenement|activité|activités|inscription|inscriptions|maison des jeunes|centre|local)\b/i.test(
        message,
      );

    const outOfScopePatterns = [
      /\b(code|programmation|développement|developpement|javascript|typescript|python)\b/i,
      /\b(cuisine|recette|devoirs?|exercice[s]?|maths?|physique|chimie|politique)\b/i,
      /\b(histoire|géographie|geographie|philosophie|santé|sante)\b/i,
    ];

    return (
      !hasAllowedContext &&
      outOfScopePatterns.some((pattern) => pattern.test(message))
    );
  }
}
