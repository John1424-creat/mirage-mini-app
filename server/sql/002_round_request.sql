ALTER TABLE game_rounds
  ADD COLUMN IF NOT EXISTS request jsonb NOT NULL DEFAULT '{}'::jsonb;
