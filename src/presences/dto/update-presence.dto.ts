import { PartialType } from '@nestjs/swagger';
import { CreatePresenceDto } from './create-presence.dto';

/**
 * DTO de mise à jour de présence — généré par NestJS CLI.
 * Étend CreatePresenceDto avec tous les champs optionnels via PartialType.
 * Actuellement vide car la logique de mise à jour utilise MarkPresenceDto (upsert).
 */
export class UpdatePresenceDto extends PartialType(CreatePresenceDto) {}
