import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateClubCreationRequestStatusDto {
  @IsString()
  @IsIn(['ACCEPTEE', 'REFUSEE'])
  statut: 'ACCEPTEE' | 'REFUSEE';

  @IsOptional()
  @IsString()
  commentaire_decision?: string;
}
