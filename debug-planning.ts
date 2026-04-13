// Script de diagnostic pour vérifier les réservations créées par la demande de club

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(
    '🔍 Vérification des réservations créées par demandes de club...\n',
  );

  // Compter les réservations VALIDEE
  const validatedCount = await prisma.reservations_locaux.count({
    where: { statut: 'VALIDEE' },
  });

  console.log(`Total réservations VALIDEE: ${validatedCount}`);

  // Chercher les réservations de club créées récemment
  const recentReservations = await prisma.reservations_locaux.findMany({
    where: {
      objet: { contains: 'Créneau club validé' },
      statut: 'VALIDEE',
    },
    include: {
      local: { select: { id: true, nom: true } },
      utilisateur: { select: { id: true, nom: true, prenom: true } },
    },
    orderBy: { date_creation: 'desc' },
    take: 20,
  });

  console.log(
    `\nRéservations de club trouvées: ${recentReservations.length}\n`,
  );

  for (const res of recentReservations) {
    console.log(`📅 ${res.date_reservation} | ${res.objet}`);
    console.log(`   Local: ${res.local.nom}`);
    console.log(
      `   Utilisateur: ${res.utilisateur.nom} ${res.utilisateur.prenom}`,
    );
    console.log(`   Statut: ${res.statut}`);
    console.log(`   Créée à: ${res.date_creation.toISOString()}\n`);
  }

  // Vérifier les demandes approuvées
  const approvedRequests = await prisma.demandes_creation_clubs.findMany({
    where: { statut: 'ACCEPTEE' },
    include: {
      demandeur: { select: { nom: true, prenom: true } },
      local_souhaite: { select: { nom: true } },
    },
    orderBy: { created_at: 'desc' },
    take: 5,
  });

  console.log(`\n✅ Demandes acceptées: ${approvedRequests.length}`);
  for (const req of approvedRequests) {
    console.log(`\nClub: ${req.nom_club}`);
    console.log(`   Demandeur: ${req.demandeur.nom} ${req.demandeur.prenom}`);
    console.log(`   Local: ${req.local_souhaite?.nom}`);
    console.log(`   Acceptée: ${req.created_at.toISOString()}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
