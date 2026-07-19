-- MARKETING-CONNECTIONS-HARDENING-01
-- Discovered resources per integration connection (pages, ad accounts, pixels, etc.)
-- Scoped to organizationId + provider — safe IDs/names only, no secrets.

CREATE TABLE "IntegrationResource" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId"   TEXT,
    "provider"       TEXT NOT NULL,
    "resourceType"   TEXT NOT NULL,
    "externalId"     TEXT NOT NULL,
    "externalName"   TEXT NOT NULL,
    "selected"       BOOLEAN NOT NULL DEFAULT false,
    "metadataJson"   JSONB,
    "discoveredAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationResource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationResource_organizationId_idx"              ON "IntegrationResource"("organizationId");
CREATE INDEX "IntegrationResource_organizationId_provider_idx"     ON "IntegrationResource"("organizationId", "provider");
CREATE INDEX "IntegrationResource_organizationId_resourceType_idx" ON "IntegrationResource"("organizationId", "resourceType");
CREATE INDEX "IntegrationResource_connectionId_idx"                ON "IntegrationResource"("connectionId");
CREATE UNIQUE INDEX "IntegrationResource_orgId_provider_extId_key" ON "IntegrationResource"("organizationId", "provider", "externalId");

ALTER TABLE "IntegrationResource"
    ADD CONSTRAINT "IntegrationResource_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
