import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * DTO utilise pour enregistrer la presence d'un membre.
 * Les identifiants de club et d'utilisateur sont obligatoires, la date reste optionnelle.
 */
export class MarkPresenceDto {
  @IsUUID()
  id_club!: string;

  @IsUUID()
  id_utilisateur!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_presence?: string;

  @IsOptional()
  @IsUUID()
  id_seance?: string;

  @IsString()
  @IsIn(['PRESENT', 'ABSENT'])
  statut!: 'PRESENT' | 'ABSENT';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarque?: string;
}
