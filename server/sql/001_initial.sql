CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL UNIQUE,
  username text,
  first_name text NOT NULL,
  last_name text,
  language_code text,
  photo_url text,
  is_premium boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  real_balance bigint NOT NULL DEFAULT 0 CHECK (real_balance >= 0),
  bonus_balance bigint NOT NULL DEFAULT 0 CHECK (bonus_balance >= 0),
  demo_balance bigint NOT NULL DEFAULT 10000 CHECK (demo_balance >= 0),
  reserved_real_balance bigint NOT NULL DEFAULT 0 CHECK (reserved_real_balance >= 0),
  reserved_bonus_balance bigint NOT NULL DEFAULT 0 CHECK (reserved_bonus_balance >= 0),
  reserved_demo_balance bigint NOT NULL DEFAULT 0 CHECK (reserved_demo_balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reserved_real_balance <= real_balance),
  CHECK (reserved_bonus_balance <= bonus_balance),
  CHECK (reserved_demo_balance <= demo_balance)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_sessions_player_idx ON auth_sessions(player_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS game_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  room text NOT NULL CHECK (room IN ('pyramid', 'carpet', 'pharaoh')),
  wallet_type text NOT NULL CHECK (wallet_type IN ('real', 'bonus', 'demo')),
  status text NOT NULL CHECK (status IN ('requested', 'settled', 'failed')),
  stake bigint NOT NULL CHECK (stake > 0),
  payout bigint NOT NULL DEFAULT 0 CHECK (payout >= 0),
  math_version text NOT NULL,
  idempotency_key text NOT NULL,
  result jsonb,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (player_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS game_rounds_player_created_idx
  ON game_rounds(player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  round_id uuid REFERENCES game_rounds(id) ON DELETE RESTRICT,
  wallet_type text NOT NULL CHECK (wallet_type IN ('real', 'bonus', 'demo')),
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  reason text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ledger_entries_player_created_idx
  ON ledger_entries(player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_relationships (
  referred_player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE RESTRICT,
  referrer_player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referred_player_id <> referrer_player_id)
);

CREATE TABLE IF NOT EXISTS referral_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  ngr bigint NOT NULL DEFAULT 0,
  commission_rate_bps integer NOT NULL DEFAULT 1500 CHECK (commission_rate_bps BETWEEN 0 AND 10000),
  commission bigint NOT NULL DEFAULT 0 CHECK (commission >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_player_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS reward_streaks (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  cycle_version text NOT NULL,
  current_day integer NOT NULL DEFAULT 0 CHECK (current_day BETWEEN 0 AND 7),
  last_claimed_on date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  cycle_version text NOT NULL,
  reward_day integer NOT NULL CHECK (reward_day BETWEEN 1 AND 7),
  amount bigint NOT NULL CHECK (amount > 0),
  claimed_on date NOT NULL,
  ledger_entry_id uuid REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, claimed_on)
);

CREATE TABLE IF NOT EXISTS demo_refills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  previous_balance bigint NOT NULL CHECK (previous_balance >= 0),
  new_balance bigint NOT NULL CHECK (new_balance >= previous_balance),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_refills_player_created_idx
  ON demo_refills(player_id, created_at DESC);
