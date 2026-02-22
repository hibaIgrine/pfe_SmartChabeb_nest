import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const centresArabes = [
    {
      nom: 'دار الشباب أريانة',
      ville: 'أريانة',
      adresse: '27 شارع فرحات حشاد',
      tel: '70730454',
    },
    {
      nom: 'دار الشباب حي التضامن',
      ville: 'أريانة',
      adresse: 'التضامن',
      tel: '71545378',
    },
    // Ajoute tes autres lignes ici...
  ];

  console.log('Remplissage des centres...');

  for (const c of centresArabes) {
    await prisma.salles.create({
      data: {
        nom: c.nom,
        ville: c.ville,
        adresse: c.adresse,
        telephone_salle: c.tel,
        // On ne met pas de latitude/longitude pour l'instant
      },
    });
  }
  console.log('✅ Centres ajoutés avec succès !');
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
