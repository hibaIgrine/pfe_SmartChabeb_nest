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
