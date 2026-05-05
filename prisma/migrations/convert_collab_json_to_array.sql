-- Migration: convert collaborating_club_ids from JSON to text[]
-- 1) Add temporary column
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS collaborating_club_ids_tmp text[];

-- 2) Populate temporary column from existing JSON values (if any)
UPDATE public.events
SET collaborating_club_ids_tmp = (
  SELECT array_agg(value)
  FROM jsonb_array_elements_text((collaborating_club_ids::jsonb) ) as t(value)
)
WHERE collaborating_club_ids IS NOT NULL;

-- 3) Drop old column
ALTER TABLE public.events DROP COLUMN IF EXISTS collaborating_club_ids;

-- 4) Rename temporary column
ALTER TABLE public.events RENAME COLUMN collaborating_club_ids_tmp TO collaborating_club_ids;

-- 5) Ensure default is empty array
ALTER TABLE public.events ALTER COLUMN collaborating_club_ids SET DEFAULT ARRAY[]::text[];

-- 6) Optional: ensure not null (depending on schema needs)
-- ALTER TABLE public.events ALTER COLUMN collaborating_club_ids SET NOT NULL;
