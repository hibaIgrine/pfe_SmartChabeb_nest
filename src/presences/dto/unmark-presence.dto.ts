import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class UnmarkPresenceDto {
  @IsUUID()
  id_club!: string;

  @IsUUID()
  id_utilisateur!: string;

  @IsOptional()
  @IsUUID()
  id_seance?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_presence?: string;
}
