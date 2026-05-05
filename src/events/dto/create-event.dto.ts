import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EventTimelineStepDto } from './event-timeline-step.dto';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  nom!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date_event doit respecter le format YYYY-MM-DD',
  })
  date_event!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'start_time doit respecter le format HH:mm ou HH:mm:ss',
  })
  start_time!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'end_time doit respecter le format HH:mm ou HH:mm:ss',
  })
  end_time!: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsUUID()
  club_id?: string;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.filter((item) => item !== '' && item !== null)
      : value,
  )
  @IsUUID('all', { each: true })
  club_ids?: string[];

  @IsUUID()
  locaux_id!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventTimelineStepDto)
  timeline?: EventTimelineStepDto[];
}
