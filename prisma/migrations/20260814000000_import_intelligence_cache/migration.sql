-- IMPORT-CACHE-PROD-01: Postgres-backed L2 cache for import intelligence.
-- Replaces rejected /tmp file-based cache (not shared on Vercel).
-- Shared across all function instances via Neon Postgres.

CREATE TABLE IF NOT EXISTS "import_intelligence_cache" (
    "organization_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "source_as_of" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "import_intelligence_cache_pkey" PRIMARY KEY ("organization_id")
);

-- Index on updated_at for TTL-based expiration queries
CREATE INDEX IF NOT EXISTS "import_intelligence_cache_updated_at_idx"
    ON "import_intelligence_cache" ("updated_at");
