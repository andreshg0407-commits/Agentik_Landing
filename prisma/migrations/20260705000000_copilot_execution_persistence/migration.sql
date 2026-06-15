-- AGENTIK-EXECUTION-PERSISTENCE-01
-- Creates CopilotExecution, CopilotExecutionStep, CopilotExecutionEvent, CopilotApprovalRequest

CREATE TYPE "CopilotApprovalStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED'
);

-- ── CopilotExecution ─────────────────────────────────────────────────────────

CREATE TABLE "CopilotExecution" (
  "id"               TEXT NOT NULL,
  "executionId"      TEXT NOT NULL,
  "correlationId"    TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'running',
  "source"           TEXT NOT NULL DEFAULT 'copilot',
  "executionMode"    TEXT NOT NULL DEFAULT 'copilot',
  "planId"           TEXT NOT NULL,
  "planTitle"        TEXT NOT NULL,
  "planSummary"      TEXT,
  "idempotencyKey"   TEXT,
  "startedAt"        TIMESTAMP(3) NOT NULL,
  "finishedAt"       TIMESTAMP(3),
  "durationMs"       INTEGER,
  "totalSteps"       INTEGER NOT NULL DEFAULT 0,
  "completedSteps"   INTEGER NOT NULL DEFAULT 0,
  "failedSteps"      INTEGER NOT NULL DEFAULT 0,
  "skippedSteps"     INTEGER NOT NULL DEFAULT 0,
  "blockedSteps"     INTEGER NOT NULL DEFAULT 0,
  "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
  "deniedByPolicy"   INTEGER NOT NULL DEFAULT 0,
  "inputSnapshot"    JSONB,
  "planSnapshot"     JSONB,
  "reportSnapshot"   JSONB,
  "metadata"         JSONB,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CopilotExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CopilotExecution_executionId_key"         ON "CopilotExecution"("executionId");
CREATE INDEX "CopilotExecution_tenantId_idx"                   ON "CopilotExecution"("tenantId");
CREATE INDEX "CopilotExecution_correlationId_idx"              ON "CopilotExecution"("correlationId");
CREATE INDEX "CopilotExecution_idempotencyKey_idx"             ON "CopilotExecution"("idempotencyKey");
CREATE INDEX "CopilotExecution_status_idx"                     ON "CopilotExecution"("status");
CREATE INDEX "CopilotExecution_startedAt_idx"                  ON "CopilotExecution"("startedAt");
CREATE INDEX "CopilotExecution_tenantId_status_idx"            ON "CopilotExecution"("tenantId", "status");
CREATE INDEX "CopilotExecution_tenantId_startedAt_idx"         ON "CopilotExecution"("tenantId", "startedAt");

-- ── CopilotExecutionStep ─────────────────────────────────────────────────────

CREATE TABLE "CopilotExecutionStep" (
  "id"             TEXT NOT NULL,
  "executionId"    TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "stepId"         TEXT NOT NULL,
  "actionId"       TEXT NOT NULL,
  "domain"         TEXT NOT NULL,
  "displayName"    TEXT NOT NULL,
  "status"         TEXT NOT NULL,
  "approvalStatus" TEXT NOT NULL DEFAULT 'not_required',
  "policyDecision" TEXT,
  "deniedByPolicy" BOOLEAN NOT NULL DEFAULT false,
  "startedAt"      TIMESTAMP(3) NOT NULL,
  "finishedAt"     TIMESTAMP(3),
  "durationMs"     INTEGER,
  "inputSnapshot"  JSONB,
  "outputSnapshot" JSONB,
  "error"          TEXT,
  "warnings"       JSONB,
  "policyReasons"  JSONB,
  "evaluatedRules" JSONB,
  "auditNote"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CopilotExecutionStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CopilotExecutionStep_tenantId_idx"            ON "CopilotExecutionStep"("tenantId");
CREATE INDEX "CopilotExecutionStep_executionId_idx"         ON "CopilotExecutionStep"("executionId");
CREATE INDEX "CopilotExecutionStep_stepId_idx"              ON "CopilotExecutionStep"("stepId");
CREATE INDEX "CopilotExecutionStep_actionId_idx"            ON "CopilotExecutionStep"("actionId");
CREATE INDEX "CopilotExecutionStep_domain_idx"              ON "CopilotExecutionStep"("domain");
CREATE INDEX "CopilotExecutionStep_status_idx"              ON "CopilotExecutionStep"("status");
CREATE INDEX "CopilotExecutionStep_approvalStatus_idx"      ON "CopilotExecutionStep"("approvalStatus");
CREATE INDEX "CopilotExecutionStep_policyDecision_idx"      ON "CopilotExecutionStep"("policyDecision");
CREATE INDEX "CopilotExecutionStep_tenantId_executionId_idx" ON "CopilotExecutionStep"("tenantId", "executionId");

-- ── CopilotExecutionEvent ────────────────────────────────────────────────────

CREATE TABLE "CopilotExecutionEvent" (
  "id"          TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "eventType"   TEXT NOT NULL,
  "stepId"      TEXT,
  "actionId"    TEXT,
  "domain"      TEXT,
  "status"      TEXT,
  "message"     TEXT,
  "payload"     JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopilotExecutionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CopilotExecutionEvent_tenantId_idx"            ON "CopilotExecutionEvent"("tenantId");
CREATE INDEX "CopilotExecutionEvent_executionId_idx"         ON "CopilotExecutionEvent"("executionId");
CREATE INDEX "CopilotExecutionEvent_eventType_idx"           ON "CopilotExecutionEvent"("eventType");
CREATE INDEX "CopilotExecutionEvent_createdAt_idx"           ON "CopilotExecutionEvent"("createdAt");
CREATE INDEX "CopilotExecutionEvent_tenantId_executionId_idx" ON "CopilotExecutionEvent"("tenantId", "executionId");

-- ── CopilotApprovalRequest ───────────────────────────────────────────────────

CREATE TABLE "CopilotApprovalRequest" (
  "id"             TEXT NOT NULL,
  "executionId"    TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "stepId"         TEXT NOT NULL,
  "actionId"       TEXT NOT NULL,
  "domain"         TEXT NOT NULL,
  "requestedBy"    TEXT NOT NULL,
  "approvalStatus" "CopilotApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "policyDecision" TEXT,
  "policyReasons"  JSONB,
  "reason"         TEXT NOT NULL,
  "requestedAt"    TIMESTAMP(3) NOT NULL,
  "resolvedAt"     TIMESTAMP(3),
  "resolvedBy"     TEXT,
  "resolutionNote" TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CopilotApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CopilotApprovalRequest_tenantId_idx"               ON "CopilotApprovalRequest"("tenantId");
CREATE INDEX "CopilotApprovalRequest_executionId_idx"            ON "CopilotApprovalRequest"("executionId");
CREATE INDEX "CopilotApprovalRequest_approvalStatus_idx"         ON "CopilotApprovalRequest"("approvalStatus");
CREATE INDEX "CopilotApprovalRequest_requestedAt_idx"            ON "CopilotApprovalRequest"("requestedAt");
CREATE INDEX "CopilotApprovalRequest_resolvedAt_idx"             ON "CopilotApprovalRequest"("resolvedAt");
CREATE INDEX "CopilotApprovalRequest_tenantId_approvalStatus_idx" ON "CopilotApprovalRequest"("tenantId", "approvalStatus");
CREATE INDEX "CopilotApprovalRequest_tenantId_executionId_idx"   ON "CopilotApprovalRequest"("tenantId", "executionId");
