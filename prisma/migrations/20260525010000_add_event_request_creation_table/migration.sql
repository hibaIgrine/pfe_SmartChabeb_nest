CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "event_request_creation" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "nom" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "date_event" DATE NOT NULL,
  "start_time" TIMESTAMP(6) NOT NULL,
  "end_time" TIMESTAMP(6) NOT NULL,
  "capacity" INTEGER,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(6),
  "club_id" UUID,
  "locaux_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "reviewed_by" UUID,
  "event_id" UUID,
  "timeline" JSONB,
  "collaborating_club_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  CONSTRAINT "event_request_creation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_request_creation_event_id_key" UNIQUE ("event_id")
);

ALTER TABLE "event_request_creation"
  ADD CONSTRAINT "event_request_creation_club_id_fkey"
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_request_creation"
  ADD CONSTRAINT "event_request_creation_locaux_id_fkey"
  FOREIGN KEY ("locaux_id") REFERENCES "locaux"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_request_creation"
  ADD CONSTRAINT "event_request_creation_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_request_creation"
  ADD CONSTRAINT "event_request_creation_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_request_creation"
  ADD CONSTRAINT "event_request_creation_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "event_request_creation_status_created_at_idx"
  ON "event_request_creation" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "event_request_creation_club_id_idx"
  ON "event_request_creation" ("club_id");

CREATE INDEX IF NOT EXISTS "event_request_creation_locaux_id_idx"
  ON "event_request_creation" ("locaux_id");
