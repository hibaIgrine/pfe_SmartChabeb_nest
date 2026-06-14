/**
 * DTO de mise à jour d'un rôle — tous les champs de CreateRoleDto deviennent optionnels.
 * Utilisé par PATCH /roles/:id.
 * Le service applique toUpperCase().trim() sur nom si fourni.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateRoleDto } from './create-role.dto';

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
