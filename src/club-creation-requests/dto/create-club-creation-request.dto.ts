import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class CreateClubCreationRequestDto {
  @IsString()
  @IsNotEmpty()
  nom_club: string;

  @IsString()
  @IsNotEmpty()
  categorie: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  planning_souhaite?: string;

  @IsUUID()
  id_local_souhaite?: string;

  @IsIn([
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ])
  jour_recurrent: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date_souhaitee doit respecter le format YYYY-MM-DD',
  })
  date_souhaitee?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'heure_debut_souhaitee doit respecter le format HH:mm ou HH:mm:ss',
  })
  heure_debut_souhaitee?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'heure_fin_souhaitee doit respecter le format HH:mm ou HH:mm:ss',
  })
  heure_fin_souhaitee?: string;
}
