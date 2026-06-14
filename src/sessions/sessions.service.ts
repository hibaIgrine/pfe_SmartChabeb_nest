/**
 * ============================================================
 * FICHIER : sessions.service.ts
 * RÔLE    : Logique métier de gestion des sessions de recommandation ML.
 * ============================================================
 *
 * Une session ML est créée par le coach/responsable avant de demander
 * une recommandation. Elle capture l'état complet de la séance (30 variables)
 * et est persistée dans la table recommendation_sessions.
 *
 * ─────────────────────────────────────────────────────────────────
 * HELPERS PRIVÉS
 * ─────────────────────────────────────────────────────────────────
 *
 * getLatestChosenActivity(sessionId: number) → string | null
 *   Cherche dans recommendation_history la DERNIÈRE recommandation liée à
 *   cette session (orderBy created_at DESC) et retourne activite_choisie.
 *   Retourne null si aucune recommandation n'a encore été faite ou validée.
 *   Utilisé pour enrichir la vue session avec le choix final du coach.
 *
 * resolveDomaine(categorie: string | null) → string
 *   Convertit la catégorie libre du club (ex: 'Football', 'Peinture', 'Robotique')
 *   en domaine normalisé compatible avec le dataset ML :
 *     - /sport|foot|basket|hand|volley|ping|natation|gym/  → 'Sport'
 *     - /art|peinture|dessin|sculpt|photo|vid|cin|musique|chant|danse|th[eé]/  → 'Arts'
 *     - /num[eé]rique|info|robot|bureau|web|code|tech/  → 'Numérique'
 *     - /langue|litt[eé]r|lecture|po[eé]sie/  → 'Culture'
 *     - /citoyen|enviro|leadership|entrep/  → 'Citoyenneté'
 *     - /[eé]checs|strat/  → 'Intellectuel'
 *     - Sinon → retourne la catégorie telle quelle (fallback)
 *   CRITIQUE : le domaine est l'une des 30 features ML. Une mauvaise
 *   résolution entraîne un [Miss] dans Flask et dégrade la prédiction.
 *
 * toSessionView(row, activiteChoisie?) → Session
 *   Mapper de la ligne Prisma (recommendation_sessions + club) vers
 *   l'interface Session exposée par l'API.
 *   Construit le sous-objet club { id, nom, nom_dataset, domaine }
 *   en appelant resolveDomaine(row.club.categorie).
 *   activiteChoisie : injecté depuis getLatestChosenActivity() — null par défaut.
 *
 * ─────────────────────────────────────────────────────────────────
 * MÉTHODES PUBLIQUES
 * ─────────────────────────────────────────────────────────────────
 *
 * create(createSessionDto, responsableId?)
 *   1. Vérifie que le club existe (BadRequestException sinon).
 *   2. Insère dans recommendation_sessions avec id_responsable = JWT userId.
 *   3. Valeurs par défaut :
 *      - activite_j_minus_2  : null (optionnel)
 *      - activite_precedente : null (optionnel)
 *      - activite_exterieure : 'Non'
 *      - repetition_activite : 0
 *      - sequence_logique    : 1
 *   4. Retourne toSessionView(created) sans activite_choisie (null).
 *
 * findAll() → Session[]
 *   Récupère toutes les sessions (orderBy created_at DESC).
 *   Pour chacune, charge getLatestChosenActivity() en parallèle (Promise.all).
 *   Retourne la liste enrichie avec activite_choisie.
 *
 * findOne(id) → Session
 *   NotFoundException si la session n'existe pas.
 *   Charge getLatestChosenActivity() et retourne la vue complète.
 *
 * update(id, updateSessionDto) → Session
 *   NotFoundException si inexistante.
 *   Met à jour avec spread { ...updateSessionDto } (PartialType — tous champs optionnels).
 *   Retourne la vue mise à jour avec activite_choisie courante.
 *
 * remove(id) → { deleted: boolean }
 *   NotFoundException si inexistante.
 *   Delete physique de la session (et cascade sur recommendation_history si FK définie).
 *
 * ─────────────────────────────────────────────────────────────────
 * TABLE PRISMA : recommendation_sessions
 * ─────────────────────────────────────────────────────────────────
 *   id (auto-increment), id_club (FK), id_responsable (FK nullable),
 *   + les 28 autres colonnes correspondant aux features ML (voir Session entity).
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { Session } from './entities/session.entity';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getLatestChosenActivity(
    sessionId: number,
  ): Promise<string | null> {
    const latestChoice = await this.prisma.recommendation_history.findFirst({
      where: { session_id: sessionId },
      orderBy: { created_at: 'desc' },
      select: { activite_choisie: true },
    });

    return latestChoice?.activite_choisie ?? null;
  }

  private resolveDomaine(categorie: string | null | undefined): string {
    if (!categorie) {
      return '';
    }

    const normalized = categorie.toLowerCase();

    if (/sport|foot|basket|hand|volley|ping|natation|gym/.test(normalized)) {
      return 'Sport';
    }

    if (
      /art|peinture|dessin|sculpt|photo|vid|cin|musique|chant|danse|th[eé]/.test(
        normalized,
      )
    ) {
      return 'Arts';
    }

    if (/num[eé]rique|info|robot|bureau|web|code|tech/.test(normalized)) {
      return 'Numérique';
    }

    if (/langue|litt[eé]r|lecture|po[eé]sie/.test(normalized)) {
      return 'Culture';
    }

    if (/citoyen|enviro|leadership|entrep/.test(normalized)) {
      return 'Citoyenneté';
    }

    if (/[eé]checs|strat/.test(normalized)) {
      return 'Intellectuel';
    }

    return categorie;
  }

  private toSessionView(
    row: any,
    activiteChoisie: string | null = null,
  ): Session {
    return {
      id: row.id,
      club_id: row.id_club,
      club: {
        id: row.club.id,
        nom: row.club.nom,
        nom_dataset: row.club.nom_dataset ?? null,
        domaine: this.resolveDomaine(row.club.categorie),
      },
      activite_choisie: activiteChoisie,
      tranche_age: row.tranche_age,
      niveau: row.niveau,
      num_seance: row.num_seance,
      phase_annee: row.phase_annee,
      saison: row.saison,
      mois: row.mois,
      jour_semaine: row.jour_semaine,
      format_seance: row.format_seance,
      lieu: row.lieu,
      duree_minutes: row.duree_minutes,
      activite_j_minus_2: row.activite_j_minus_2,
      activite_precedente: row.activite_precedente,
      activite_actuelle: row.activite_actuelle,
      difficulte: row.difficulte,
      niveau_fatigue: row.niveau_fatigue,
      humeur_groupe: row.humeur_groupe,
      score_engagement: row.score_engagement,
      nb_membres_total: row.nb_membres_total,
      nb_presents: row.nb_presents,
      taux_presence: row.taux_presence,
      note_technique: row.note_technique,
      note_comportement: row.note_comportement,
      evaluation_coach: row.evaluation_coach,
      progression_observee: row.progression_observee,
      meteo: row.meteo,
      activite_exterieure: row.activite_exterieure,
      repetition_activite: row.repetition_activite,
      sequence_logique: row.sequence_logique,
      created_at: row.created_at.toISOString(),
    };
  }

  async create(
    createSessionDto: CreateSessionDto,
    responsableId?: string,
  ): Promise<Session> {
    const club = await this.prisma.clubs.findUnique({
      where: { id: createSessionDto.club_id },
      select: { id: true, nom: true, nom_dataset: true, categorie: true },
    });

    if (!club) {
      throw new BadRequestException('Club introuvable pour ce club_id');
    }

    const created = await this.prisma.recommendation_sessions.create({
      data: {
        id_club: createSessionDto.club_id,
        id_responsable: responsableId ?? null,
        tranche_age: createSessionDto.tranche_age,
        niveau: createSessionDto.niveau,
        num_seance: createSessionDto.num_seance,
        phase_annee: createSessionDto.phase_annee,
        saison: createSessionDto.saison,
        mois: createSessionDto.mois,
        jour_semaine: createSessionDto.jour_semaine,
        format_seance: createSessionDto.format_seance,
        lieu: createSessionDto.lieu,
        duree_minutes: createSessionDto.duree_minutes,
        activite_j_minus_2: createSessionDto.activite_j_minus_2 ?? null,
        activite_precedente: createSessionDto.activite_precedente ?? null,
        activite_actuelle: createSessionDto.activite_actuelle,
        difficulte: createSessionDto.difficulte,
        niveau_fatigue: createSessionDto.niveau_fatigue,
        humeur_groupe: createSessionDto.humeur_groupe,
        score_engagement: createSessionDto.score_engagement,
        nb_membres_total: createSessionDto.nb_membres_total,
        nb_presents: createSessionDto.nb_presents,
        taux_presence: createSessionDto.taux_presence,
        note_technique: createSessionDto.note_technique,
        note_comportement: createSessionDto.note_comportement,
        evaluation_coach: createSessionDto.evaluation_coach,
        progression_observee: createSessionDto.progression_observee,
        meteo: createSessionDto.meteo,
        activite_exterieure: createSessionDto.activite_exterieure ?? 'Non',
        repetition_activite: createSessionDto.repetition_activite ?? 0,
        sequence_logique: createSessionDto.sequence_logique ?? 1,
      },
      include: {
        club: {
          select: {
            id: true,
            nom: true,
            nom_dataset: true,
            categorie: true,
          },
        },
      },
    });

    return this.toSessionView(created);
  }

  async findAll(): Promise<Session[]> {
    const rows = await this.prisma.recommendation_sessions.findMany({
      include: {
        club: {
          select: {
            id: true,
            nom: true,
            nom_dataset: true,
            categorie: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const enrichedRows = await Promise.all(
      rows.map(async (row) => ({
        row,
        activiteChoisie: await this.getLatestChosenActivity(row.id),
      })),
    );

    return enrichedRows.map(({ row, activiteChoisie }) =>
      this.toSessionView(row, activiteChoisie),
    );
  }

  async findOne(id: number): Promise<Session> {
    const row = await this.prisma.recommendation_sessions.findUnique({
      where: { id },
      include: {
        club: {
          select: {
            id: true,
            nom: true,
            nom_dataset: true,
            categorie: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Session ${id} introuvable`);
    }

    const activiteChoisie = await this.getLatestChosenActivity(row.id);
    return this.toSessionView(row, activiteChoisie);
  }

  async update(
    id: number,
    updateSessionDto: UpdateSessionDto,
  ): Promise<Session> {
    const existing = await this.prisma.recommendation_sessions.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Session ${id} introuvable`);
    }

    const updated = await this.prisma.recommendation_sessions.update({
      where: { id },
      data: {
        ...updateSessionDto,
      },
      include: {
        club: {
          select: {
            id: true,
            nom: true,
            categorie: true,
          },
        },
      },
    });

    const activiteChoisie = await this.getLatestChosenActivity(updated.id);
    return this.toSessionView(updated, activiteChoisie);
  }

  async remove(id: number): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.recommendation_sessions.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Session ${id} introuvable`);
    }

    await this.prisma.recommendation_sessions.delete({ where: { id } });
    return { deleted: true };
  }
}
