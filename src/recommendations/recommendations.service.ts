/**
 * ============================================================
 * FICHIER : recommendations.service.ts
 * RÔLE    : Logique métier — pont entre NestJS et le modèle ML (Flask).
 * ============================================================
 *
 * CONSTANTE :
 *   flaskUrl = config.get('FLASK_URL', 'http://localhost:5000')
 *     URL du micro-service ML Flask. Configurable via variable d'environnement.
 *
 * ─────────────────────────────────────────────────────────────────
 * HELPERS PRIVÉS
 * ─────────────────────────────────────────────────────────────────
 *
 * extractErrorMessage(error: unknown) → string
 *   Extraction sécurisée du message d'erreur depuis n'importe quel type
 *   (erreur Axios, erreur réseau, string...).
 *
 * toRecommendationItems(value: unknown) → RecommendationItem[]
 *   Convertit la réponse JSON brute de Flask en tableau de RecommendationItem typé.
 *   Vérifie que chaque item a bien les propriétés { activite, probabilite }.
 *   Filtre les items malformés (.filter(item => item !== null)).
 *   Protège contre une réponse Flask inattendue ou corrompue.
 *
 * ─────────────────────────────────────────────────────────────────
 * predict(session: Session, topK = 3) → Recommendation
 * ─────────────────────────────────────────────────────────────────
 *
 *   RÔLE : Appelle Flask /predict avec les 30 features de la session
 *   et persiste le résultat dans recommendation_history.
 *
 *   ÉTAPE 1 — Construction du payload Flask (mappage Session → JSON) :
 *     nom_dataset : session.club.nom_dataset ?? session.club.nom
 *       → Priorité au nom dataset (aligné sur le LabelEncoder Nom_Club).
 *       → Fallback sur le nom affiché si nom_dataset est null.
 *     club        : session.club.nom (fallback humain)
 *     domaine     : session.club.domaine (résolu par resolveDomaine())
 *     activite_j_minus_2, activite_precedente : null → 'Aucune' (attendu par Flask)
 *     top_k       : nombre de recommandations demandées (1-10)
 *
 *   ÉTAPE 2 — Appel HTTP avec HttpService (@nestjs/axios) :
 *     this.http.post(`${flaskUrl}/predict`, payload)
 *     firstValueFrom() : convertit Observable RxJS en Promise.
 *     Retourne { data } avec la réponse Flask.
 *
 *   ÉTAPE 3 — Extraction des recommandations :
 *     data.recommendations : tableau de { activite, probabilite } depuis Flask
 *     data.model           : nom du modèle ML utilisé
 *
 *   ÉTAPE 4 — Persistance dans recommendation_history :
 *     Crée un enregistrement avec :
 *       session_id       : ID de la session d'entrée
 *       recommandations  : JSON du tableau de RecommendationItem
 *       modele_utilise   : nom du modèle Flask
 *       activite_choisie : null (pas encore validé par le coach)
 *
 *   ÉTAPE 5 — Retour :
 *     Objet Recommendation typé avec recommandations parsées via toRecommendationItems().
 *
 *   ERREUR :
 *     HttpException 502 Bad Gateway si Flask est injoignable ou renvoie une erreur.
 *
 * ─────────────────────────────────────────────────────────────────
 * findBySession(sessionId: number) → Recommendation[]
 * ─────────────────────────────────────────────────────────────────
 *   Récupère toutes les recommandations générées pour une session donnée.
 *   Triées par created_at DESC (la plus récente en premier).
 *   Chaque ligne est mappée via toRecommendationItems().
 *   Utilisé pour afficher l'historique des prédictions d'une session.
 *
 * ─────────────────────────────────────────────────────────────────
 * updateChoice(recoId: number, activite: string) → Recommendation
 * ─────────────────────────────────────────────────────────────────
 *   Met à jour activite_choisie dans recommendation_history.
 *   NotFoundException si la recommandation n'existe pas.
 *   C'est l'action de VALIDATION du coach : il confirme quelle activité
 *   parmi les suggestions il va effectivement réaliser lors de la prochaine séance.
 *   Ce feedback (activite_choisie) constitue le "label terrain" qui pourra
 *   servir à réentraîner le modèle ML dans une future itération.
 *
 * ─────────────────────────────────────────────────────────────────
 * TABLE PRISMA : recommendation_history
 * ─────────────────────────────────────────────────────────────────
 *   id, session_id (FK), recommandations (Json), modele_utilise (string),
 *   activite_choisie (string | null), created_at
 */

import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Prisma } from '@prisma/client';
import {
  Recommendation,
  RecommendationItem,
} from './entities/recommendation.entity';
import { Session } from '../sessions/entities/session.entity';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RecommendationsService {
  private flaskUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.flaskUrl = this.config.get('FLASK_URL', 'http://localhost:5000');
  }

  private extractErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null) {
      const maybeError = error as { message?: string };
      return maybeError.message ?? 'Erreur inconnue';
    }
    return 'Erreur inconnue';
  }

  private toRecommendationItems(value: unknown): RecommendationItem[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (
          typeof item === 'object' &&
          item !== null &&
          'activite' in item &&
          'probabilite' in item
        ) {
          const typed = item as { activite: unknown; probabilite: unknown };
          return {
            activite: String(typed.activite),
            probabilite: Number(typed.probabilite),
          };
        }
        return null;
      })
      .filter((item): item is RecommendationItem => item !== null);
  }

  async predict(session: Session, topK = 3) {
    try {
      const payload = {
        nom_dataset: session.club.nom_dataset ?? session.club.nom,
        club: session.club.nom,
        domaine: session.club.domaine,
        tranche_age: session.tranche_age,
        niveau: session.niveau,
        num_seance: session.num_seance,
        phase_annee: session.phase_annee,
        saison: session.saison,
        mois: session.mois,
        jour_semaine: session.jour_semaine,
        format_seance: session.format_seance,
        lieu: session.lieu,
        duree_minutes: session.duree_minutes,
        activite_j_minus_2: session.activite_j_minus_2 ?? 'Aucune',
        activite_precedente: session.activite_precedente ?? 'Aucune',
        activite_actuelle: session.activite_actuelle,
        difficulte: session.difficulte,
        niveau_fatigue: session.niveau_fatigue,
        humeur_groupe: session.humeur_groupe,
        score_engagement: session.score_engagement,
        nb_membres_total: session.nb_membres_total,
        nb_presents: session.nb_presents,
        taux_presence: session.taux_presence,
        note_technique: session.note_technique,
        note_comportement: session.note_comportement,
        evaluation_coach: session.evaluation_coach,
        progression_observee: session.progression_observee,
        meteo: session.meteo,
        activite_exterieure: session.activite_exterieure,
        repetition_activite: session.repetition_activite,
        sequence_logique: session.sequence_logique,
        top_k: topK,
      };

      console.log('=== PAYLOAD FLASK ===');
      console.log('nom_dataset :', payload.nom_dataset);
      console.log('club        :', payload.club);
      console.log('domaine     :', payload.domaine);
      console.log('J-2         :', payload.activite_j_minus_2);
      console.log('precedente  :', payload.activite_precedente);
      console.log('actuelle    :', payload.activite_actuelle);

      const { data } = await firstValueFrom(
        this.http.post(`${this.flaskUrl}/predict`, payload),
      );

      const recommendations = (data?.recommendations ??
        []) as RecommendationItem[];
      const model = (data?.model ?? 'Unknown') as string;

      const created = await this.prisma.recommendation_history.create({
        data: {
          session_id: session.id,
          recommandations: recommendations as unknown as Prisma.InputJsonValue,
          modele_utilise: model,
        },
      });

      const reco: Recommendation = {
        id: created.id,
        sessionId: created.session_id,
        recommandations: this.toRecommendationItems(created.recommandations),
        modele_utilise: created.modele_utilise,
        activite_choisie: created.activite_choisie,
        created_at: created.created_at.toISOString(),
      };

      return reco;
    } catch (err: unknown) {
      throw new HttpException(
        `Erreur Flask: ${this.extractErrorMessage(err)}`,
        502,
      );
    }
  }

  async findBySession(sessionId: number) {
    const rows = await this.prisma.recommendation_history.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      recommandations: this.toRecommendationItems(row.recommandations),
      modele_utilise: row.modele_utilise,
      activite_choisie: row.activite_choisie,
      created_at: row.created_at.toISOString(),
    }));
  }

  async updateChoice(recoId: number, activite: string) {
    const existing = await this.prisma.recommendation_history.findUnique({
      where: { id: recoId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Recommendation ${recoId} introuvable`);
    }

    const updated = await this.prisma.recommendation_history.update({
      where: { id: recoId },
      data: { activite_choisie: activite },
    });

    return {
      id: updated.id,
      sessionId: updated.session_id,
      recommandations: this.toRecommendationItems(updated.recommandations),
      modele_utilise: updated.modele_utilise,
      activite_choisie: updated.activite_choisie,
      created_at: updated.created_at.toISOString(),
    };
  }
}
