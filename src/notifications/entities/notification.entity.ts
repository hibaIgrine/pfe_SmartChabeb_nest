/**
 * Entité TypeScript minimale — générée par NestJS CLI, actuellement vide.
 * L'accès à la table `notifications` se fait directement via PrismaService.
 *
 * Structure réelle de la table (définie dans schema.prisma) :
 *   id            String   @id @default(uuid())
 *   id_utilisateur String  (FK → utilisateurs.id)
 *   type          String   (ex: 'ADHESION_ACCEPTED', 'EVENT_REMINDER', ...)
 *   titre         String
 *   message       String
 *   data          Json?    (métadonnées spécifiques au type, ex: { eventId, clubNom, ... })
 *   is_read       Boolean  @default(false)
 *   created_at    DateTime @default(now())
 */
export class Notification {}
