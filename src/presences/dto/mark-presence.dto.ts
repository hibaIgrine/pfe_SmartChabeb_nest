import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class MarkPresenceDto {
  @IsUUID()
  id_club: string;

  @IsUUID()
  id_utilisateur: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_presence?: string;

  @IsString()
  @IsIn(['PRESENT', 'ABSENT'])
  statut: 'PRESENT' | 'ABSENT';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarque?: string;
}
