import { IsEmail, IsEnum, IsISO8601 } from 'class-validator';

export class UpdateProfileDto {
  @IsEmail()
  email: string;

  @IsEnum(['HOMME', 'FEMME'], { message: 'Le genre doit être HOMME ou FEMME' })
  genre: string;

  @IsISO8601({}, { message: 'Format de date invalide (YYYY-MM-DD)' })
  date_naissance: string;
}
