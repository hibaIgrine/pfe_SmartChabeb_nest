import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Début du remplissage de la base ---');

  // 1. CRÉATION DES RÔLES
  const rolesData = [
    { nom: 'ADMIN', description: 'Administrateur National - Ministère' },
    { nom: 'COACH', description: 'Entraîneur et responsable sportif' },
    { nom: 'ANIMATEUR', description: 'Animateur de club socio-culturel' },
    {
      nom: 'RESPONSABLE_CLUB',
      description: 'Gestionnaire administratif d un club',
    },
    {
      nom: 'RESPONSABLE_CENTRE',
      description: 'Gestionnaire administratif d un centre de jeunesse',
    },
    { nom: 'ADHERENT', description: 'Jeune membre du centre' },
  ];

  for (const r of rolesData) {
    await prisma.roles.upsert({
      where: { nom: r.nom },
      update: {},
      create: r,
    });
  }
  console.log('✅ Rôles créés.');

  // 2. RÉCUPÉRER L'ID DU RÔLE ADMIN
  const roleAdmin = await prisma.roles.findUnique({ where: { nom: 'ADMIN' } });

  // 3. CRÉATION D'UN UTILISATEUR ADMIN (Pour toi)
  const passwordHache = await bcrypt.hash('hiba12345', 10);

  await prisma.utilisateurs.upsert({
    where: { email: 'igrinehiba22@gmail.com' },
    update: {},
    create: {
      nom: 'igrine',
      prenom: 'Hiba',
      email: 'igrinehiba22@gmail.com',
      mot_de_passe: passwordHache,
      role: 'ADMIN', // On remplit le champ texte pour ton RolesGuard
      id_role: roleAdmin?.id, // On lie à la table roles
      est_verifie: true,
      compte_actif: true,
    },
  });

  console.log('✅ Utilisateur Admin créé : igrinehiba22@gmail.com / hiba12345');
  console.log('--- Fin du remplissage ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
