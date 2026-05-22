import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  HttpStatus,
} from '@nestjs/common';
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

type FallbackPlan = {
  title: string;
  objective: string;
  duration: string;
  materials: string[];
  steps: string[];
  timidVariant: string[];
  tip: string;
};

@Injectable()
export class ChatbotService {
  private readonly apiKeys: string[];
  private readonly modelNames: string[];
  private readonly useLocalFallback: boolean;
  private readonly refusalMessage =
    "Désolé, je suis uniquement qualifié pour vous aider avec les activités de la Maison des Jeunes en Tunisie. Tu peux me demander les clubs, les événements, les inscriptions, des idées de séance ou une roadmap d'animation.";
  private readonly historyLimit = 6;
  private readonly maxClubsInContext = 8;
  private readonly maxEventsInContext = 8;
  private readonly maxDescriptionLength = 180;
  private readonly tunisianDateFormatter = new Intl.DateTimeFormat('fr-TN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Tunis',
  });

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    const primaryApiKey = configService.get<string>('GEMINI_API_KEY')?.trim();
    const extraApiKeys = (configService.get<string>('GEMINI_API_KEYS') ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key.length > 0);

    this.apiKeys = [primaryApiKey, ...extraApiKeys].filter(
      (key): key is string => Boolean(key),
    );

    if (this.apiKeys.length === 0) {
      throw new Error('GEMINI_API_KEY is not defined in the environment.');
    }

    const primaryModel =
      configService.get<string>('GEMINI_MODEL')?.trim() ?? 'gemini-2.5-flash';
    const fallbackModels = (
      configService.get<string>('GEMINI_MODEL_FALLBACKS') ?? 'gemini-2.0-flash'
    )
      .split(',')
      .map((model) => model.trim())
      .filter((model) => model.length > 0);

    this.modelNames = [...new Set([primaryModel, ...fallbackModels])];
    this.useLocalFallback =
      configService.get<string>('CHATBOT_LOCAL_FALLBACK') === 'true';
  }

  private buildModelConfig(modelName: string) {
    return {
      model: modelName,
      systemInstruction: `
Tu es l'assistant officiel des Maisons des Jeunes en Tunisie.
Tu réponds uniquement en français ou en derja tunisienne.
Tu es strictement limité aux clubs, événements, inscriptions, locaux, activités et séances de la Maison des Jeunes.
Tu peux proposer librement des activités d'animation, des idées d'ateliers, des jeux, des formats interactifs et des roadmaps de séance pour aider un club à préparer une rencontre.
Quand l'utilisateur demande une recommandation d'activité ou un plan de séance, donne une réponse concrète et exploitable avec des étapes claires, une durée indicative, le matériel nécessaire et une variante de secours si possible.
Tu peux aussi créer une proposition complète même si la base de données ne contient pas un modèle exact, tant que cela reste dans le cadre des clubs et séances.
Réponds avec une structure utile: objectif, durée, matériel, déroulé, variante, conseil pratique.
Si la demande sort de ce périmètre, tu refuses brièvement et tu rediriges vers les activités de la Maison des Jeunes.
Tu ne donnes jamais de réponse sur le code, la cuisine, les devoirs, la politique ou tout autre sujet hors domaine.
Quand tu utilises les données fournies, base-toi uniquement sur le contexte de base de données injecté dans le prompt.
Si une information n'existe pas dans le contexte, dis clairement qu'elle n'est pas encore disponible ou programmée.
      `.trim(),
      generationConfig: {
        temperature: 0.45,
        topP: 0.9,
        maxOutputTokens: 1024,
      },
    };
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

      const contextPrompt = this.buildContextPrompt(
        clubs.slice(0, this.maxClubsInContext),
        events.slice(0, this.maxEventsInContext),
      );
      const normalizedHistory = this.normalizeHistory(history);
      const prompt = [
        contextPrompt,
        'Rappel: tu restes strictement dans le domaine de la Maison des Jeunes.',
        'Si la question porte sur une séance de club, une animation ou une roadmap, propose une réponse structurée, complète et exploitable, même si tu dois compléter avec une proposition originale adaptée au contexte.',
        `Question utilisateur: ${trimmedMessage}`,
      ].join('\n\n');

      const geminiAnswer = await this.tryGeminiModels(
        normalizedHistory,
        prompt,
        trimmedMessage,
        history,
      );

      if (geminiAnswer) {
        return geminiAnswer;
      }

      return this.refusalMessage;
    } catch (error) {
      if (this.isGeminiQuotaError(error)) {
        console.warn('Quota Gemini atteint (429).');
      } else {
        console.error('Erreur Chatbot Gemini:', error);
      }

      if (
        this.useLocalFallback &&
        this.isActivityOrSessionRequest(trimmedMessage)
      ) {
        return this.buildFallbackActivityReply(
          trimmedMessage,
          history,
          false,
          this.isGeminiQuotaError(error),
        );
      }

      if (this.isGeminiQuotaError(error)) {
        throw new HttpException(
          'Le quota Gemini est atteint. Ajoute une autre clé API d un autre projet ou active le billing pour continuer à obtenir des réponses du chatbot.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new InternalServerErrorException(
        'Erreur lors de la communication avec le chatbot.',
      );
    }
  }

  private async tryGeminiModels(
    history: Content[],
    prompt: string,
    trimmedMessage: string,
    fullHistory: ChatbotHistoryMessage[],
  ): Promise<string | null> {
    let sawQuotaError = false;

    for (const apiKey of this.apiKeys) {
      const genAI = new GoogleGenerativeAI(apiKey);

      for (const modelName of this.modelNames) {
        try {
          const model = genAI.getGenerativeModel(
            this.buildModelConfig(modelName),
          );
          const chatSession = model.startChat({ history });
          const result = await chatSession.sendMessage(prompt);
          const response = await result.response;
          const answer = response.text().trim();

          if (this.shouldUseFallbackAnswer(answer, trimmedMessage)) {
            continue;
          }

          if (answer) {
            return answer;
          }
        } catch (error) {
          if (this.isGeminiQuotaError(error)) {
            sawQuotaError = true;
            continue;
          }

          console.warn(`Gemini model ${modelName} skipped:`, error);
          continue;
        }
      }
    }

    if (sawQuotaError) {
      if (
        this.useLocalFallback &&
        this.isActivityOrSessionRequest(trimmedMessage)
      ) {
        return this.buildFallbackActivityReply(
          trimmedMessage,
          fullHistory,
          true,
          true,
        );
      }

      throw new HttpException(
        'Le quota Gemini est atteint. Ajoute une autre clé API d un autre projet ou active le billing pour continuer à obtenir des réponses du chatbot.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return null;
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
              `Description: ${this.truncateForContext(club.description)}`,
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
              `Capacité: ${event.capacity ?? 'Non précisée'} | Description: ${this.truncateForContext(
                event.description,
              )}`
            );
          })
          .join('\n')
      : '- Aucun événement actif trouvé en base pour le moment.';

    return [
      'Contexte officiel injecté depuis la base de données PostgreSQL de la Maison des Jeunes.',
      "N'utilise que ces informations pour répondre aux questions sur les clubs et les événements.",
      `Contexte condensé: ${clubs.length} clubs et ${events.length} événements les plus pertinents/récents.`,
      "Si le contexte ne contient pas la réponse, dis que l'information n'est pas encore disponible.",
      `CLUBS:\n${clubsContext}`,
      `ÉVÉNEMENTS:\n${eventsContext}`,
    ].join('\n\n');
  }

  private truncateForContext(value: string | null): string {
    const normalized = value?.trim();
    if (!normalized) {
      return 'Aucune description disponible';
    }

    if (normalized.length <= this.maxDescriptionLength) {
      return normalized;
    }

    return `${normalized.slice(0, this.maxDescriptionLength).trim()}...`;
  }

  private isClearlyOutOfScope(message: string): boolean {
    const hasAllowedContext =
      /\b(club|clubs|événement|evenement|activité|activités|inscription|inscriptions|séance|seance|roadmap|animation|atelier|ateliers|jeu|jeux|plan|programme|idée|idee|maison des jeunes|centre|local)\b/i.test(
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

  private shouldUseFallbackAnswer(answer: string, message: string): boolean {
    if (!answer) {
      return true;
    }

    const endsAbruptly =
      /\b(de|du|des|pour|et|avec|sur|dans|au|aux|la|le|les)\s*$/i.test(
        answer,
      ) ||
      answer.endsWith(':') ||
      answer.endsWith('...');

    // If Gemini stops too early on activity/session requests, serve a full fallback.
    return (
      this.isActivityOrSessionRequest(message) &&
      (answer.length < 260 || endsAbruptly)
    );
  }

  private isGeminiQuotaError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const possibleError = error as { status?: number; message?: string };
    if (possibleError.status === 429) {
      return true;
    }

    const message = possibleError.message?.toLowerCase() ?? '';
    return message.includes('quota') || message.includes('too many requests');
  }

  private isActivityOrSessionRequest(message: string): boolean {
    return /\b(club|activité|activite|séance|seance|roadmap|atelier|animation|recommander|idée|idee|lecture|peinture|musique|théâtre|theatre|sport)\b/i.test(
      message,
    );
  }

  private extractClubLabel(message: string): string {
    const match = message.match(/club\s+([a-zA-ZÀ-ÿ'\-\s]{2,40})/i);
    const label = match?.[1]
      ?.replace(/\b(recommander?|recommandation|donne|moi|idee?s?)\b/gi, '')
      .trim();
    return label && label.length > 1 ? label : 'ton club';
  }

  private pickThemeKey(
    message: string,
  ): 'peinture' | 'lecture' | 'musique' | 'theatre' | 'sport' | 'general' {
    const normalized = message.toLowerCase();

    if (/\b(peinture|dessin|art|arts plastiques)\b/i.test(normalized)) {
      return 'peinture';
    }

    if (/\b(lecture|livre|po[eè]me|poesie|conte|roman)\b/i.test(normalized)) {
      return 'lecture';
    }

    if (
      /\b(musique|chant|instrument|guitare|piano|rythme)\b/i.test(normalized)
    ) {
      return 'musique';
    }

    if (
      /\b(th[eé]atre|impro|scene|sc[eè]ne|jeu d'acteur)\b/i.test(normalized)
    ) {
      return 'theatre';
    }

    if (
      /\b(sport|foot|football|basket|volley|fitness|athletisme)\b/i.test(
        normalized,
      )
    ) {
      return 'sport';
    }

    return 'general';
  }

  private getPlansForTheme(
    theme: ReturnType<ChatbotService['pickThemeKey']>,
  ): FallbackPlan[] {
    const commonTimid = [
      'Démarrer en binômes avant le partage en grand groupe.',
      'Laisser 3 minutes d’écriture silencieuse avant chaque prise de parole.',
    ];

    const byTheme: Record<
      ReturnType<ChatbotService['pickThemeKey']>,
      FallbackPlan[]
    > = {
      peinture: [
        {
          title: "Palette d'émotions",
          objective:
            'Exprimer des émotions à travers les couleurs et la composition.',
          duration: '90 minutes',
          materials: [
            'Feuilles A3',
            'Gouache/acrylique',
            'Pinceaux',
            'Palettes',
            'Chiffons',
          ],
          steps: [
            '10 min: échauffement visuel (associer une émotion à 3 couleurs).',
            "25 min: création individuelle d'une mini-oeuvre abstraite.",
            '30 min: travail en duo, fusionner les deux oeuvres en une composition commune.',
            '15 min: galerie murale + vote coup de coeur.',
            '10 min: feedback et photo des productions.',
          ],
          timidVariant: commonTimid,
          tip: 'Prévois un thème simple (joie, courage, calme) pour aider ceux qui hésitent.',
        },
        {
          title: 'Peinture collaborative en relais',
          objective: "Développer l'esprit d'équipe et la créativité rapide.",
          duration: '75 à 90 minutes',
          materials: ['Grande feuille kraft', 'Peinture', 'Feutres', 'Timer'],
          steps: [
            '10 min: définir un thème collectif.',
            '40 min: relais créatif (chaque membre peint 4-5 min puis passe).',
            '20 min: retouches finales en sous-groupes.',
            '15 min: présentation + discussion sur les choix artistiques.',
          ],
          timidVariant: commonTimid,
          tip: 'Mets une musique douce pour fluidifier la concentration pendant le relais.',
        },
      ],
      lecture: [
        {
          title: 'Cercle de lecture active',
          objective: "Renforcer la compréhension, l'écoute et l'argumentation.",
          duration: '90 minutes',
          materials: ['Extraits imprimés', 'Post-it', 'Stylos', 'Tableau'],
          steps: [
            '10 min: icebreaker autour de la phrase préférée.',
            '20 min: lecture silencieuse puis annotation individuelle.',
            '25 min: discussion en groupes de 4 (thèmes, personnages, message).',
            '20 min: mini-débat entre groupes.',
            '15 min: synthèse collective + recommandation de lecture.',
          ],
          timidVariant: commonTimid,
          tip: 'Donne des rôles (animateur, gardien du temps, rapporteur) pour équilibrer la parole.',
        },
        {
          title: 'Lecture théâtralisée',
          objective:
            "Rendre la lecture vivante via la voix et l'interprétation.",
          duration: '75 minutes',
          materials: ['Texte court', 'Fiches de rôles', 'Chronomètre'],
          steps: [
            '10 min: échauffement vocal rapide.',
            '25 min: préparation des scènes en petits groupes.',
            '25 min: passages des groupes.',
            "15 min: feedback positif et axes d'amélioration.",
          ],
          timidVariant: commonTimid,
          tip: 'Commence par des scènes de 1 minute pour réduire le stress.',
        },
      ],
      musique: [
        {
          title: 'Atelier rythme et création',
          objective:
            'Créer un morceau collectif simple avec percussions et voix.',
          duration: '90 minutes',
          materials: [
            'Percussions légères',
            'Téléphone métronome',
            'Paperboard',
          ],
          steps: [
            '10 min: échauffement corporel et rythmique.',
            '25 min: création de patterns en groupes.',
            '30 min: assemblage en morceau commun.',
            '15 min: répétition générale.',
            '10 min: mini performance interne.',
          ],
          timidVariant: commonTimid,
          tip: 'Autorise des rôles non exposés (tempo, arrangement) pour les plus réservés.',
        },
      ],
      theatre: [
        {
          title: 'Impro guidée',
          objective: "Développer l'expression orale et la confiance en scène.",
          duration: '90 minutes',
          materials: ['Cartes situations', 'Espace libre', 'Chronomètre'],
          steps: [
            "15 min: jeux d'échauffement.",
            '30 min: impros en binômes avec contraintes simples.',
            '25 min: impros en groupe avec public.',
            '20 min: debrief sur posture, voix et écoute.',
          ],
          timidVariant: commonTimid,
          tip: 'Introduis la règle du feedback bienveillant: 1 point fort + 1 suggestion.',
        },
      ],
      sport: [
        {
          title: 'Circuit coopératif',
          objective: 'Améliorer la condition physique et la coopération.',
          duration: '60 à 75 minutes',
          materials: ['Plots', 'Cordes', 'Ballons', 'Sifflet'],
          steps: [
            '10 min: échauffement complet.',
            '30 min: circuit en ateliers (agilité, passes, coordination).',
            '20 min: mini-challenge collectif.',
            '10 min: retour au calme + hydratation.',
          ],
          timidVariant: commonTimid,
          tip: 'Mixe les niveaux dans les équipes pour garder une dynamique inclusive.',
        },
      ],
      general: [
        {
          title: "Sprint d'idées de club",
          objective:
            "Produire des idées d'activités concrètes et planifiables.",
          duration: '90 minutes',
          materials: ['Post-it', 'Tableau', 'Stylos', 'Timer'],
          steps: [
            '10 min: cadrage du thème de la séance.',
            '25 min: brainstorming en groupes.',
            '25 min: sélection des idées avec critères simples.',
            "20 min: construction d'un mini-plan d'action.",
            '10 min: restitution et choix de la prochaine étape.',
          ],
          timidVariant: commonTimid,
          tip: 'Termine par un engagement concret par membre pour la séance suivante.',
        },
      ],
    };

    return byTheme[theme];
  }

  private getStableIndex(seed: string, modulo: number): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }

    const normalized = Math.abs(hash);
    return modulo > 0 ? normalized % modulo : 0;
  }

  private buildFallbackActivityReply(
    message: string,
    history: ChatbotHistoryMessage[] = [],
    fromShortAnswer = false,
    quotaLimited = false,
  ): string {
    const club = this.extractClubLabel(message);
    const theme = this.pickThemeKey(message);
    const plans = this.getPlansForTheme(theme);
    const planIndex = this.getStableIndex(
      `${message.toLowerCase()}|${history.length}|${theme}`,
      plans.length,
    );
    const plan = plans[planIndex];

    const preface = fromShortAnswer
      ? 'Je te donne une version plus complète et actionnable:'
      : '';

    return [
      `Très bonne idée pour le club ${club}.`,
      quotaLimited
        ? 'Le service IA est momentanément limité (quota), donc je te propose un plan local fiable et prêt à utiliser.'
        : '',
      preface,
      '',
      `Activité recommandée: ${plan.title}`,
      '',
      'Objectif:',
      `- ${plan.objective}`,
      '',
      'Durée:',
      `- ${plan.duration}.`,
      '',
      'Matériel:',
      ...plan.materials.map((material) => `- ${material}`),
      '',
      'Déroulé:',
      ...plan.steps.map((step, index) => `${index + 1}. ${step}`),
      '',
      'Variante si groupe timide:',
      ...plan.timidVariant.map((variant) => `- ${variant}`),
      '',
      'Conseil pratique:',
      `- ${plan.tip}`,
    ]
      .filter((line) => line !== '')
      .join('\n');
  }
}
