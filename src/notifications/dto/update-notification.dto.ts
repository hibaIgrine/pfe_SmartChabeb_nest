/**
 * DTO de mise à jour de notification — généré par NestJS CLI, actuellement vide.
 * La seule mise à jour possible sur une notification est is_read → true,
 * effectuée via PATCH /notifications/:id/read et PATCH /notifications/me/read-all
 * (updateMany directement dans le service, sans DTO).
 */
import { PartialType } from '@nestjs/swagger';
import { CreateNotificationDto } from './create-notification.dto';

export class UpdateNotificationDto extends PartialType(CreateNotificationDto) {}
