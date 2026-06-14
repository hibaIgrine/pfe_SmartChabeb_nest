/**
 * DTO pour modifier une session ML (PartialType → tous champs optionnels).
 * Utilisé si le coach détecte une erreur de saisie avant de lancer la prédiction,
 * ou pour enrichir la session avec des données complémentaires après la création.
 * Même structure que CreateSessionDto — aucune contrainte supplémentaire.
 */
import { PartialType } from '@nestjs/swagger';
import { CreateSessionDto } from './create-session.dto';

export class UpdateSessionDto extends PartialType(CreateSessionDto) {}
