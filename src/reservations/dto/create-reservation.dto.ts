import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  id_local: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date_reservation doit respecter le format YYYY-MM-DD',
  })
  date_reservation: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'heure_debut doit respecter le format HH:mm ou HH:mm:ss',
  })
  heure_debut: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'heure_fin doit respecter le format HH:mm ou HH:mm:ss',
  })
  heure_fin: string;

  @IsString()
  @IsNotEmpty()
  objet: string;
}
