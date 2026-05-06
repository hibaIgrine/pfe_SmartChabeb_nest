import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateClubTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  titre: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsIn(['HAUTE', 'MOYENNE', 'FAIBLE'])
  priorite: string;

  @IsDateString()
  date_limite: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  type_tache: string;
}
