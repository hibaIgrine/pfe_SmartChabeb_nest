/**
 * ============================================================
 * FICHIER : messagerie.entity.ts
 * RÔLE    : Entité placeholder générée par le CLI NestJS.
 * ============================================================
 *
 * Les données de messagerie sont représentées directement par les types
 * Prisma générés depuis le schéma BDD. Les tables concernées sont :
 *
 *   conversations              — id, type, title, private_key, created_by, last_message_at
 *   conversation_participants  — conversation_id, user_id, role, last_read_at, last_typing_at,
 *                                archived_at, muted_at, muted_until
 *   messages                   — id, conversation_id, sender_id, type, content, media (JSON),
 *                                status, delivered_at, read_at, edited_at,
 *                                pinned_at, pinned_by, deleted_for_everyone_at
 *   message_deleted_for_users  — message_id, user_id, deleted_at (suppression côté utilisateur)
 *
 * Aucune classe d'entité NestJS n'est nécessaire car PrismaService fournit
 * des types générés à la compilation pour chaque modèle.
 */
export class Messagerie {}
