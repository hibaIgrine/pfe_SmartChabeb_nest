import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateSeanceDto {
  @IsUUID()
  id_club!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_seance?: string;

  @IsOptional()
  @IsString()
  titre?: string;

  @IsOptional()
  @IsString()
  heure_debut?: string; // ISO datetime string

  @IsOptional()
  @IsString()
  heure_fin?: string; // ISO datetime string
}
