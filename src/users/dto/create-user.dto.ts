import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinDate,
  MinLength,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  nom: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  prenom: string;

  @ApiProperty()
  @IsEmail({}, { message: 'Format email invalide' })
  email: string;

  @ApiProperty()
  @MinLength(8, { message: 'Le mot de passe doit faire au moins 8 caractères' })
  mot_de_passe: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date_naissance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  id_centre?: string;
}
