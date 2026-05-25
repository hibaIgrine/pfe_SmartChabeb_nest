import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSeanceFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  note_coach: number;

  @IsInt()
  @Min(1)
  @Max(5)
  note_activites: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
