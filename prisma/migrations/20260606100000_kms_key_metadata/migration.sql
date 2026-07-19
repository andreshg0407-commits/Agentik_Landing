-- AGENTIK-SECURITY-KMS-01
-- KMS Key Metadata table
-- Stores key metadata only — NEVER key material.

CREATE TABLE "KmsKey" (
    "keyId"     TEXT NOT NULL,
    "orgSlug"   TEXT NOT NULL,
    "keyAlias"  TEXT NOT NULL,
    "provider"  TEXT NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'ACTIVE',
    "version"   INTEGER NOT NULL DEFAULT 1,
    "algorithm" TEXT NOT NULL DEFAULT 'AES-256-GCM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "KmsKey_pkey" PRIMARY KEY ("keyId")
);

-- Unique constraint: one alias per tenant
CREATE UNIQUE INDEX "KmsKey_keyId_orgSlug_key" ON "KmsKey"("keyId", "orgSlug");
CREATE UNIQUE INDEX "KmsKey_orgSlug_keyAlias_key" ON "KmsKey"("orgSlug", "keyAlias");

-- Tenant lookup index
CREATE INDEX "KmsKey_orgSlug_idx" ON "KmsKey"("orgSlug");

-- Status filter index (list active/rotating keys)
CREATE INDEX "KmsKey_orgSlug_status_idx" ON "KmsKey"("orgSlug", "status");

-- Provider filter index (list keys by backend)
CREATE INDEX "KmsKey_orgSlug_provider_idx" ON "KmsKey"("orgSlug", "provider");

-- Expiry monitoring index
CREATE INDEX "KmsKey_expiresAt_idx" ON "KmsKey"("expiresAt");
