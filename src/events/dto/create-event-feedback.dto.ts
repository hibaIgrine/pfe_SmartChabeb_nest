import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEventFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  note: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
