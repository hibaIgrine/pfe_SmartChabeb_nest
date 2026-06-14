/**
 * DTO pour modifier une publication existante (auteur uniquement).
 * Hérite de CreatePostDto via PartialType → tous les champs sont optionnels.
 * Comportement du service updatePost() :
 *   - Champ présent dans le body → remplace la valeur existante.
 *   - Champ absent              → valeur actuelle conservée.
 * Pour les hashtags/mentions/hidden_users : si fournis → deleteMany + createMany en $transaction.
 * Seules les nouvelles mentions (diff) reçoivent une notification.
 */
import { PartialType } from '@nestjs/swagger';
import { CreatePostDto } from '../../social-media/dto/create-post.dto';

export class UpdatePostDto extends PartialType(CreatePostDto) {}
