import { IsBoolean } from 'class-validator';

export class UpdateConversationArchiveDto {
  @IsBoolean()
  is_archived: boolean;
}
