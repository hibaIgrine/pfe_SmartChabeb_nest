import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  IsUUID,
} from 'class-validator';

export class UpdateClubTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  titre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['HAUTE', 'MOYENNE', 'FAIBLE'])
  priorite?: string;

  @IsOptional()
  @IsDateString()
  date_limite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  type_tache?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  utilisateurs?: string[];
}
