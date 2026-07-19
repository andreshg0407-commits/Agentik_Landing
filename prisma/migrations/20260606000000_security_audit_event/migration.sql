-- Migration: 20260606000000_security_audit_event
-- AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
-- Persistent, append-only security audit event log.
-- Multi-tenant (orgSlug-scoped).
-- NEVER stores secret values, tokens, certificates, or passwords.

CREATE TABLE "SecurityAuditEvent" (
    "id"           TEXT NOT NULL,
    "orgSlug"      TEXT NOT NULL,
    "eventType"    TEXT NOT NULL,
    "category"     TEXT NOT NULL,
    "severity"     TEXT NOT NULL,
    "resourceId"   TEXT,
    "resourceType" TEXT,
    "resourceName" TEXT,
    "actorId"      TEXT,
    "actorType"    TEXT,
    "actorName"    TEXT,
    "metadata"     JSONB NOT NULL DEFAULT '{}',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAuditEvent_pkey" PRIMARY KEY ("id")
);

-- Tenant isolation index — required for all org-scoped queries
CREATE INDEX "SecurityAuditEvent_orgSlug_idx"          ON "SecurityAuditEvent"("orgSlug");
CREATE INDEX "SecurityAuditEvent_orgSlug_category_idx" ON "SecurityAuditEvent"("orgSlug", "category");
CREATE INDEX "SecurityAuditEvent_orgSlug_severity_idx" ON "SecurityAuditEvent"("orgSlug", "severity");
CREATE INDEX "SecurityAuditEvent_orgSlug_eventType_idx" ON "SecurityAuditEvent"("orgSlug", "eventType");
CREATE INDEX "SecurityAuditEvent_createdAt_idx"         ON "SecurityAuditEvent"("createdAt");
