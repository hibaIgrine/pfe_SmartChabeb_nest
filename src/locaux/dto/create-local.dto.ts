import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateLocalDto {
  @IsString()
  @IsNotEmpty()
  nom: string;

  @IsString()
  @IsNotEmpty()
  type: string; // ex: THEATRE, SPORT, REUNION

  @IsNumber()
  @IsOptional()
  capacite: number;

  @IsString()
  @IsOptional()
  localisation: string; // ex: "Bâtiment A, 1er étage"

  @IsNumber()
  @IsOptional()
  prix_heure: number;

  @IsString()
  @IsOptional()
  description: string;

  @IsString()
  @IsOptional()
  image_url: string;

  @IsUUID()
  @IsNotEmpty()
  id_centre: string; // Le lien avec le centre parent
}
