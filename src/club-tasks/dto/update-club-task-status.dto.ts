import {
  IsIn,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TaskProofDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  filename?: string;
}

export class UpdateClubTaskStatusDto {
  @IsString()
  @IsIn(['EN_ATTENTE', 'EN_COURS', 'TERMINE', 'VALIDEE', 'REFUSE', 'ANNULE'])
  statut: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskProofDto)
  proofs?: TaskProofDto[];
}
