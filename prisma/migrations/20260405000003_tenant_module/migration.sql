-- CreateTable: TenantModule
-- Per-org feature flags for UI modules.
-- Open by default: absence of a row means the module is ENABLED.
-- Only explicit enabled=false rows hide modules.

CREATE TABLE IF NOT EXISTS "TenantModule" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moduleKey"      TEXT NOT NULL,
    "enabled"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantModule_pkey" PRIMARY KEY ("id")
);

-- Unique: one row per (org, module)
CREATE UNIQUE INDEX IF NOT EXISTS "TenantModule_organizationId_moduleKey_key"
    ON "TenantModule"("organizationId", "moduleKey");

-- Index for fast lookup of enabled modules per org
CREATE INDEX IF NOT EXISTS "TenantModule_organizationId_enabled_idx"
    ON "TenantModule"("organizationId", "enabled");

-- FK to Organization
ALTER TABLE "TenantModule"
    ADD CONSTRAINT "TenantModule_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
