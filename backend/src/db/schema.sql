-- Multi-tenant SaaS schema for xWhiteSpace (Supabase PostgreSQL).
-- One Discord server = one tenant. Every operational row is stamped with tenant_id.

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  owner_discord_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  is_platform_owner BOOLEAN NOT NULL DEFAULT FALSE,
  onboarded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS enabled_games JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_source TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS tenants_subscription_status_idx ON tenants (subscription_status);

CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  redeemed_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  discord_channels JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL DEFAULT 'ragnarok-origin',
  discord_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, game_id, discord_id)
);
CREATE INDEX IF NOT EXISTS members_tenant_idx ON members (tenant_id);

CREATE TABLE IF NOT EXISTS auction_requests (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL DEFAULT 'ragnarok-origin',
  id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, game_id, id)
);
CREATE INDEX IF NOT EXISTS auction_requests_tenant_idx ON auction_requests (tenant_id);
CREATE INDEX IF NOT EXISTS auction_requests_status_idx
  ON auction_requests (tenant_id, (data->>'selectionStatus'));

CREATE TABLE IF NOT EXISTS past_auction_awards (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL DEFAULT 'ragnarok-origin',
  id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, game_id, id)
);

CREATE TABLE IF NOT EXISTS loot_history (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL DEFAULT 'ragnarok-origin',
  id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, game_id, id)
);

CREATE TABLE IF NOT EXISTS attendance_commitments (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL DEFAULT 'ragnarok-origin',
  event_key TEXT NOT NULL,
  member_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, game_id, event_key, member_id)
);
CREATE INDEX IF NOT EXISTS attendance_commitments_tenant_idx ON attendance_commitments (tenant_id);

CREATE TABLE IF NOT EXISTS schedule_instances (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL DEFAULT 'ragnarok-origin',
  id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, game_id, id)
);

CREATE TABLE IF NOT EXISTS special_events (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL DEFAULT 'ragnarok-origin',
  id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, game_id, id)
);

-- Nested party grids, live raid, auction session, announce markers, etc.
CREATE TABLE IF NOT EXISTS json_docs (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL DEFAULT 'ragnarok-origin',
  path TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, game_id, path)
);

-- Bot-wide state (Discord IP circuit). Not per-guild.
CREATE TABLE IF NOT EXISTS platform_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing workspaces that already mapped Ragnarok Origin Discord channels stay on that pack.
UPDATE tenants t
SET enabled_games = '["ragnarok-origin"]'::jsonb
FROM tenant_settings s
WHERE t.id = s.tenant_id
  AND t.onboarded = TRUE
  AND (
    COALESCE(s.discord_channels->>'aucreqChannelId', '') <> ''
    OR COALESCE(s.discord_channels->>'auctionChannelId', '') <> ''
    OR COALESCE(s.discord_channels->>'warAnnounceChannelId', '') <> ''
  )
  AND (t.enabled_games IS NULL OR t.enabled_games = '[]'::jsonb);

-- Per-game operational rows. Workspace / Discord channels stay tenant-only.
CREATE TABLE IF NOT EXISTS game_settings (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, game_id)
);

ALTER TABLE members ADD COLUMN IF NOT EXISTS game_id TEXT NOT NULL DEFAULT 'ragnarok-origin';
ALTER TABLE auction_requests ADD COLUMN IF NOT EXISTS game_id TEXT NOT NULL DEFAULT 'ragnarok-origin';
ALTER TABLE past_auction_awards ADD COLUMN IF NOT EXISTS game_id TEXT NOT NULL DEFAULT 'ragnarok-origin';
ALTER TABLE loot_history ADD COLUMN IF NOT EXISTS game_id TEXT NOT NULL DEFAULT 'ragnarok-origin';
ALTER TABLE attendance_commitments ADD COLUMN IF NOT EXISTS game_id TEXT NOT NULL DEFAULT 'ragnarok-origin';
ALTER TABLE schedule_instances ADD COLUMN IF NOT EXISTS game_id TEXT NOT NULL DEFAULT 'ragnarok-origin';
ALTER TABLE special_events ADD COLUMN IF NOT EXISTS game_id TEXT NOT NULL DEFAULT 'ragnarok-origin';
ALTER TABLE json_docs ADD COLUMN IF NOT EXISTS game_id TEXT NOT NULL DEFAULT 'ragnarok-origin';

UPDATE json_docs
SET game_id = 'adventurer-guild'
WHERE path LIKE 'adventurer-guild/%'
  AND game_id = 'ragnarok-origin';

-- Origin catalogs used to live on tenant_settings.configuration. Copy them into
-- game_settings for ragnarok-origin, then leave only workspace keys on the tenant row.
-- If tenant_settings still has leftover game catalogs, that unmigrated production
-- row wins (even if an empty/partial Origin game_settings row already exists).
-- After this strip, leftover is gone so later boots do not overwrite Origin.
-- Do not insert ragnarok-3 rows here — RO3 catalogs stay empty until the game is enabled.
INSERT INTO game_settings (tenant_id, game_id, configuration, updated_at)
SELECT tenant_id,
       'ragnarok-origin',
       configuration - 'guildDisplayName' - 'timezone' - 'adminRoles' - 'guildLogoUrl',
       NOW()
FROM tenant_settings
WHERE (configuration - 'guildDisplayName' - 'timezone' - 'adminRoles' - 'guildLogoUrl') <> '{}'::jsonb
ON CONFLICT (tenant_id, game_id) DO UPDATE
SET configuration = EXCLUDED.configuration,
    updated_at = NOW();

UPDATE tenant_settings
SET configuration = jsonb_strip_nulls(jsonb_build_object(
  'guildDisplayName', configuration->'guildDisplayName',
  'timezone', configuration->'timezone',
  'adminRoles', configuration->'adminRoles',
  'guildLogoUrl', configuration->'guildLogoUrl'
)),
    updated_at = NOW()
WHERE (configuration - 'guildDisplayName' - 'timezone' - 'adminRoles' - 'guildLogoUrl') <> '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_pkey_game') THEN
    ALTER TABLE members DROP CONSTRAINT IF EXISTS members_pkey;
    ALTER TABLE members ADD CONSTRAINT members_pkey_game PRIMARY KEY (tenant_id, game_id, discord_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auction_requests_pkey_game') THEN
    ALTER TABLE auction_requests DROP CONSTRAINT IF EXISTS auction_requests_pkey;
    ALTER TABLE auction_requests ADD CONSTRAINT auction_requests_pkey_game PRIMARY KEY (tenant_id, game_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'past_auction_awards_pkey_game') THEN
    ALTER TABLE past_auction_awards DROP CONSTRAINT IF EXISTS past_auction_awards_pkey;
    ALTER TABLE past_auction_awards ADD CONSTRAINT past_auction_awards_pkey_game PRIMARY KEY (tenant_id, game_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loot_history_pkey_game') THEN
    ALTER TABLE loot_history DROP CONSTRAINT IF EXISTS loot_history_pkey;
    ALTER TABLE loot_history ADD CONSTRAINT loot_history_pkey_game PRIMARY KEY (tenant_id, game_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_commitments_pkey_game') THEN
    ALTER TABLE attendance_commitments DROP CONSTRAINT IF EXISTS attendance_commitments_pkey;
    ALTER TABLE attendance_commitments ADD CONSTRAINT attendance_commitments_pkey_game PRIMARY KEY (tenant_id, game_id, event_key, member_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_instances_pkey_game') THEN
    ALTER TABLE schedule_instances DROP CONSTRAINT IF EXISTS schedule_instances_pkey;
    ALTER TABLE schedule_instances ADD CONSTRAINT schedule_instances_pkey_game PRIMARY KEY (tenant_id, game_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'special_events_pkey_game') THEN
    ALTER TABLE special_events DROP CONSTRAINT IF EXISTS special_events_pkey;
    ALTER TABLE special_events ADD CONSTRAINT special_events_pkey_game PRIMARY KEY (tenant_id, game_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'json_docs_pkey_game') THEN
    ALTER TABLE json_docs DROP CONSTRAINT IF EXISTS json_docs_pkey;
    ALTER TABLE json_docs ADD CONSTRAINT json_docs_pkey_game PRIMARY KEY (tenant_id, game_id, path);
  END IF;
END $$;
