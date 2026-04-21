import { IsBoolean } from 'class-validator';

export class UpdateMessagePinDto {
  @IsBoolean()
  is_pinned: boolean;
}
