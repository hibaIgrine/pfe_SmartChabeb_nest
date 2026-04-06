import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class EventTimelineStepDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'timeline.start_time doit respecter le format HH:mm ou HH:mm:ss',
  })
  start_time!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'timeline.end_time doit respecter le format HH:mm ou HH:mm:ss',
  })
  end_time!: string;

  @IsOptional()
  @IsString()
  details?: string;
}
