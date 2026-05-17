import { IsIn, IsString } from 'class-validator';

export class UpdateClubTaskStatusDto {
  @IsString()
  @IsIn(['EN_ATTENTE', 'EN_COURS', 'TERMINE', 'VALIDEE', 'REFUSE', 'ANNULE'])
  statut: string;
}
