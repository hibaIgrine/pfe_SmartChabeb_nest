-- Create club_tache_preuves table
CREATE TABLE "club_tache_preuves" (
  "id" UUID NOT NULL PRIMARY KEY,
  "id_tache" UUID NOT NULL,
  "id_utilisateur" UUID NOT NULL,
  "url" VARCHAR(255) NOT NULL,
  "type" VARCHAR(50),
  "filename" VARCHAR(255),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "club_tache_preuves_id_tache_created_at_idx" ON "club_tache_preuves"("id_tache", "created_at");
CREATE INDEX "club_tache_preuves_id_utilisateur_created_at_idx" ON "club_tache_preuves"("id_utilisateur", "created_at");

ALTER TABLE "club_tache_preuves" ADD CONSTRAINT "club_tache_preuves_id_tache_fkey" FOREIGN KEY ("id_tache") REFERENCES "club_taches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "club_tache_preuves" ADD CONSTRAINT "club_tache_preuves_id_utilisateur_fkey" FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
