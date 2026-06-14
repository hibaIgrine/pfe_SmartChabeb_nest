/**
 * ============================================================
 * FICHIER : etablissements.service.ts
 * RÔLE    : Logique métier pour la gestion des établissements scolaires.
 * ============================================================
 *
 * Un établissement est une école, lycée, université ou centre de formation
 * que l'utilisateur renseigne dans son profil ("établissement fréquenté").
 *
 * FONCTIONS :
 *   findAll()      → liste tous les établissements triés par nom
 *   findOrCreate() → cherche ou crée un établissement par son nom exact
 *   searchByName() → recherche insensible à la casse avec limite de 50 résultats
 *
 * PATTERN "findOrCreate" :
 *   Lors de la mise à jour du profil utilisateur, si l'utilisateur tape un
 *   nom d'établissement qui n'existe pas encore, on le crée automatiquement.
 *   Si il existe déjà → on retourne l'existant.
 *   Cela évite les doublons tout en permettant à la liste de s'enrichir.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class EtablissementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * LISTER TOUS LES ÉTABLISSEMENTS
   * Retourne l'intégralité de la table `etablissements`, triée alphabétiquement.
   * Utilisé pour pré-remplir une liste dans l'UI Flutter.
   */
  async findAll() {
    return await this.prisma.etablissements.findMany({
      orderBy: { nom: 'asc' },
    });
  }

  /**
   * TROUVER OU CRÉER UN ÉTABLISSEMENT
   * Utilisé par UsersService lors de la complétion du profil.
   *
   * Flux :
   *   1. Si le nom est vide ou null → on retourne null (champ optionnel)
   *   2. On nettoie le nom (trim() pour supprimer les espaces superflus)
   *   3. On cherche en BDD par nom exact (contrainte unique sur la colonne `nom`)
   *   4. Si trouvé → on retourne l'enregistrement existant
   *   5. Si non trouvé → on crée un nouvel établissement
   *
   * Pourquoi trim() ?
   *   "Lycée Pilote " (avec espace) ≠ "Lycée Pilote" en BDD,
   *   donc on normalise avant de chercher.
   */
  async findOrCreate(nom: string) {
    if (!nom || nom.trim().length === 0) {
      return null; // Le champ établissement est optionnel dans le profil
    }

    const trimmedNom = nom.trim();

    // Chercher un établissement avec ce nom exact (findUnique car nom est unique en BDD)
    const existing = await this.prisma.etablissements.findUnique({
      where: { nom: trimmedNom },
    });

    if (existing) {
      return existing; // Déjà dans la base → on retourne l'existant
    }

    // Pas trouvé → on le crée automatiquement
    return await this.prisma.etablissements.create({
      data: { nom: trimmedNom },
    });
  }

  /**
   * RECHERCHE PAR NOM (autocomplete)
   * Cherche les établissements dont le nom CONTIENT le terme recherché.
   *
   * - mode: 'insensitive' → "lycée" trouve aussi "Lycée" ou "LYCÉE"
   * - take: 50 → limite à 50 résultats pour ne pas surcharger l'API
   * - Si la query est vide → retourne tout (comme findAll)
   *
   * La variable `trimmedQuery` (avec les %) est construite mais non utilisée
   * car Prisma gère le LIKE en interne via `contains`.
   */
  async searchByName(query: string) {
    if (!query || query.trim().length === 0) {
      return await this.findAll();
    }

    return await this.prisma.etablissements.findMany({
      where: {
        nom: {
          contains: query.trim(),   // Équivalent SQL : WHERE nom LIKE '%query%'
          mode: 'insensitive',      // Insensible à la casse (PostgreSQL : ILIKE)
        },
      },
      orderBy: { nom: 'asc' },
      take: 50, // Maximum 50 résultats retournés
    });
  }
}
