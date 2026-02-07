import { IsEmail, IsNumber, Min, Max } from 'class-validator';

export class BiometricsDto {
  @IsEmail()
  email: string;

  @IsNumber()
  @Min(20)
  @Max(300) // Validation réaliste du poids
  poids: number;

  @IsNumber()
  @Min(50)
  @Max(250) // Validation réaliste de la taille
  taille: number;
}
