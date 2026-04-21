import { IsBoolean } from 'class-validator';

export class UpdateTypingDto {
  @IsBoolean()
  is_typing: boolean;
}
