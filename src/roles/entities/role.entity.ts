/**
 * Entité TypeScript minimale — générée par NestJS CLI, actuellement vide.
 * L'accès à la table `roles` se fait directement via PrismaService dans RolesService.
 * Ce fichier est conservé comme squelette pour une future couche ORM si nécessaire.
 *
 * Structure réelle de la table `roles` (définie dans schema.prisma) :
 *   id          String   @id @default(uuid())
 *   nom         String   @unique
 *   description String?
 *   utilisateurs utilisateurs[]
 */
export class Role {}
