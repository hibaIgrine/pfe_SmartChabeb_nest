CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "seance_feedbacks" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "id_seance" UUID NOT NULL,
  "id_utilisateur" UUID NOT NULL,
  "note_coach" SMALLINT NOT NULL,
  "note_activites" SMALLINT NOT NULL,
  "commentaire" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seance_feedbacks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seance_feedbacks_id_seance_id_utilisateur_key" UNIQUE ("id_seance", "id_utilisateur")
);

ALTER TABLE "seance_feedbacks"
  ADD CONSTRAINT "seance_feedbacks_id_seance_fkey"
  FOREIGN KEY ("id_seance") REFERENCES "seances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seance_feedbacks"
  ADD CONSTRAINT "seance_feedbacks_id_utilisateur_fkey"
  FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "seance_feedbacks_id_seance_created_at_idx"
  ON "seance_feedbacks" ("id_seance", "created_at");

CREATE INDEX IF NOT EXISTS "seance_feedbacks_id_utilisateur_created_at_idx"
  ON "seance_feedbacks" ("id_utilisateur", "created_at");
