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

  private toSessionView(row: any): Session {
    return {
      id: row.id,
      club_id: row.id_club,
      club: {
        id: row.club.id,
        nom: row.club.nom,
        domaine: row.club.categorie,
      },
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
      select: { id: true, nom: true, categorie: true },
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
            categorie: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => this.toSessionView(row));
  }

  async findOne(id: number): Promise<Session> {
    const row = await this.prisma.recommendation_sessions.findUnique({
      where: { id },
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

    if (!row) {
      throw new NotFoundException(`Session ${id} introuvable`);
    }

    return this.toSessionView(row);
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

    return this.toSessionView(updated);
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
