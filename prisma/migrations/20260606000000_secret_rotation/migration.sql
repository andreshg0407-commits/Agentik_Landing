-- AGENTIK-SECURITY-SECRET-ROTATION-01
-- Migration: Create SecretRotation table
-- Never stores secret values — metadata only.

CREATE TABLE "SecretRotation" (
    "id"          TEXT NOT NULL,
    "orgSlug"     TEXT NOT NULL,
    "secretId"    TEXT NOT NULL,
    "strategy"    TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "approvedBy"  TEXT,
    "reason"      TEXT NOT NULL,
    "metadata"    JSONB NOT NULL DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "revokedAt"   TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SecretRotation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecretRotation_orgSlug_idx"          ON "SecretRotation"("orgSlug");
CREATE INDEX "SecretRotation_orgSlug_secretId_idx" ON "SecretRotation"("orgSlug", "secretId");
CREATE INDEX "SecretRotation_orgSlug_status_idx"   ON "SecretRotation"("orgSlug", "status");
CREATE INDEX "SecretRotation_createdAt_idx"        ON "SecretRotation"("createdAt");
