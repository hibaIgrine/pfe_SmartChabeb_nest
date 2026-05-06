CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE "club_taches" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "id_club" UUID NOT NULL,
    "titre" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "priorite" VARCHAR(20) NOT NULL,
    "date_limite" DATE NOT NULL,
    "type_tache" VARCHAR(80) NOT NULL,
    "statut" VARCHAR(20) NOT NULL DEFAULT 'A_FAIRE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id_createur" UUID,

    CONSTRAINT "club_taches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "club_taches_id_club_date_limite_idx" ON "club_taches"("id_club", "date_limite");
CREATE INDEX "club_taches_id_club_priorite_idx" ON "club_taches"("id_club", "priorite");
CREATE INDEX "club_taches_id_club_statut_idx" ON "club_taches"("id_club", "statut");

ALTER TABLE "club_taches"
  ADD CONSTRAINT "club_taches_id_club_fkey"
  FOREIGN KEY ("id_club") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_taches"
  ADD CONSTRAINT "club_taches_id_createur_fkey"
  FOREIGN KEY ("id_createur") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;