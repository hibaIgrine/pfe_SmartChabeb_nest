import { IsEnum } from 'class-validator';

export enum DeleteMessageScope {
  ME = 'ME',
  EVERYONE = 'EVERYONE',
}

export class DeleteMessageDto {
  @IsEnum(DeleteMessageScope)
  scope!: DeleteMessageScope;
}
