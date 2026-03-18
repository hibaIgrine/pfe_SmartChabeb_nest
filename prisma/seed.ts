import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const centresArabes = [
    {
      nom: 'دار الشباب أريانة',
      gouvernorat: 'أريانة',
      delegation: 'أريانة المدينة', // Ajouté
      code_postal: '2080', // Ajouté
      adresse: '27 شارع فرحات حشاد',
      tel: '70730454',
    },
    {
      nom: 'دار الشباب حي التضامن',
      gouvernorat: 'أريانة',
      delegation: 'حي التضامن', // Ajouté
      code_postal: '2041', // Ajouté
      adresse: 'التضامن',
      tel: '71545378',
    },
    {
      nom: 'دار الشباب قلعة الأندلس',
      gouvernorat: 'أريانة',
      delegation: 'قلعة الأندلس',
      code_postal: '2022',
      adresse: 'حي طارق ابن زياد',
      tel: '71558002',
    },
    // Tu peux continuer à ajouter tes autres centres ici...
  ];

  console.log(
    '🚀 Remplissage de la table salles avec Gouvernorat, Délégation et Code Postal...',
  );

  for (const c of centresArabes) {
    await prisma.centres.create({
      data: {
        nom: c.nom,
        gouvernorat: c.gouvernorat,
        delegation: c.delegation,
        code_postal: c.code_postal,
        adresse: c.adresse,
        telephone_centre: c.tel, // On lie 'tel' du JSON à 'telephone_salle' de la BDD
      },
    });
  }

  console.log(`✅ ${centresArabes.length} centres ajoutés avec succès !`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors du remplissage :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
