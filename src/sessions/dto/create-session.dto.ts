import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateSessionDto {
  @IsUUID()
  club_id: string;

  @IsString()
  tranche_age: string;

  @IsString()
  niveau: string;

  @IsInt()
  @Min(1)
  num_seance: number;

  @IsString()
  phase_annee: string;

  @IsString()
  saison: string;

  @IsInt()
  @Min(1)
  @Max(12)
  mois: number;

  @IsString()
  jour_semaine: string;

  @IsString()
  format_seance: string;

  @IsString()
  lieu: string;

  @IsInt()
  @Min(1)
  duree_minutes: number;

  @IsOptional()
  @IsString()
  activite_j_minus_2?: string;

  @IsOptional()
  @IsString()
  activite_precedente?: string;

  @IsString()
  activite_actuelle: string;

  @IsString()
  difficulte: string;

  @IsString()
  niveau_fatigue: string;

  @IsString()
  humeur_groupe: string;

  @IsNumber()
  score_engagement: number;

  @IsInt()
  @Min(0)
  nb_membres_total: number;

  @IsInt()
  @Min(0)
  nb_presents: number;

  @IsNumber()
  taux_presence: number;

  @IsNumber()
  note_technique: number;

  @IsNumber()
  note_comportement: number;

  @IsString()
  evaluation_coach: string;

  @IsString()
  progression_observee: string;

  @IsString()
  meteo: string;

  @IsOptional()
  @IsString()
  activite_exterieure?: string;

  @IsOptional()
  @IsInt()
  repetition_activite?: number;

  @IsOptional()
  @IsInt()
  sequence_logique?: number;
}
