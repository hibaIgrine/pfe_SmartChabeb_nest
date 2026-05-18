-- CreateTable
CREATE TABLE "club_tache_commentaires" (
    "id" UUID NOT NULL,
    "id_tache" UUID NOT NULL,
    "id_utilisateur" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "club_tache_commentaires_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_tache_commentaires_id_tache_created_at_idx" ON "club_tache_commentaires"("id_tache", "created_at");

-- CreateIndex
CREATE INDEX "club_tache_commentaires_id_utilisateur_created_at_idx" ON "club_tache_commentaires"("id_utilisateur", "created_at");

-- AddForeignKey
ALTER TABLE "club_tache_commentaires" ADD CONSTRAINT "club_tache_commentaires_id_tache_fkey" FOREIGN KEY ("id_tache") REFERENCES "club_taches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_tache_commentaires" ADD CONSTRAINT "club_tache_commentaires_id_utilisateur_fkey" FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;