import { PartialType } from '@nestjs/swagger';
import { CreatePresenceDto } from './create-presence.dto';

/**
 * Variante partielle du DTO de creation.
 * Ici elle sert surtout de structure standard pour une future mise a jour.
 */
export class UpdatePresenceDto extends PartialType(CreatePresenceDto) {}
