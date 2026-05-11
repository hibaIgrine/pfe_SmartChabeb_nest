-- Create recommendation sessions table
CREATE TABLE "recommendation_sessions" (
  "id" SERIAL NOT NULL,
  "id_club" UUID NOT NULL,
  "id_responsable" UUID,
  "tranche_age" VARCHAR(50) NOT NULL,
  "niveau" VARCHAR(50) NOT NULL,
  "num_seance" INTEGER NOT NULL,
  "phase_annee" VARCHAR(80) NOT NULL,
  "saison" VARCHAR(30) NOT NULL,
  "mois" INTEGER NOT NULL,
  "jour_semaine" VARCHAR(30) NOT NULL,
  "format_seance" VARCHAR(80) NOT NULL,
  "lieu" VARCHAR(120) NOT NULL,
  "duree_minutes" INTEGER NOT NULL,
  "activite_j_minus_2" VARCHAR(120),
  "activite_precedente" VARCHAR(120),
  "activite_actuelle" VARCHAR(120) NOT NULL,
  "difficulte" VARCHAR(50) NOT NULL,
  "niveau_fatigue" VARCHAR(50) NOT NULL,
  "humeur_groupe" VARCHAR(50) NOT NULL,
  "score_engagement" DOUBLE PRECISION NOT NULL,
  "nb_membres_total" INTEGER NOT NULL,
  "nb_presents" INTEGER NOT NULL,
  "taux_presence" DOUBLE PRECISION NOT NULL,
  "note_technique" DOUBLE PRECISION NOT NULL,
  "note_comportement" DOUBLE PRECISION NOT NULL,
  "evaluation_coach" VARCHAR(80) NOT NULL,
  "progression_observee" VARCHAR(80) NOT NULL,
  "meteo" VARCHAR(50) NOT NULL,
  "activite_exterieure" VARCHAR(20) NOT NULL DEFAULT 'Non',
  "repetition_activite" INTEGER NOT NULL DEFAULT 0,
  "sequence_logique" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recommendation_sessions_pkey" PRIMARY KEY ("id")
);

-- Create recommendation history table
CREATE TABLE "recommendation_history" (
  "id" SERIAL NOT NULL,
  "session_id" INTEGER NOT NULL,
  "recommandations" JSONB NOT NULL,
  "modele_utilise" VARCHAR(120) NOT NULL,
  "activite_choisie" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recommendation_history_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "recommendation_sessions_id_club_created_at_idx"
  ON "recommendation_sessions"("id_club", "created_at");
CREATE INDEX "recommendation_sessions_id_responsable_created_at_idx"
  ON "recommendation_sessions"("id_responsable", "created_at");
CREATE INDEX "recommendation_history_session_id_created_at_idx"
  ON "recommendation_history"("session_id", "created_at");

-- Foreign keys
ALTER TABLE "recommendation_sessions"
  ADD CONSTRAINT "recommendation_sessions_id_club_fkey"
  FOREIGN KEY ("id_club") REFERENCES "clubs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recommendation_sessions"
  ADD CONSTRAINT "recommendation_sessions_id_responsable_fkey"
  FOREIGN KEY ("id_responsable") REFERENCES "utilisateurs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recommendation_history"
  ADD CONSTRAINT "recommendation_history_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "recommendation_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
