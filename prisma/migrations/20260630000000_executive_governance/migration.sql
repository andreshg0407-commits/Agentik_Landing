-- CreateTable: Executive Governance Models
-- AGENTIK-EXECUTIVE-GOVERNANCE-01 Phase 37

CREATE TABLE "GovernanceReportRecord" (
    "id" TEXT NOT NULL,
    "orgSlug" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complianceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNDER_REVIEW',
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "escalationCount" INTEGER NOT NULL DEFAULT 0,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernanceReportRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernancePolicyRecord" (
    "id" TEXT NOT NULL,
    "orgSlug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
    "type" TEXT NOT NULL DEFAULT 'APPROVAL_GATE',
    "priority" TEXT NOT NULL DEFAULT 'LOW',
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "authorityLevel" TEXT NOT NULL DEFAULT 'MANAGER',
    "threshold" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernancePolicyRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernanceViolationRecord" (
    "id" TEXT NOT NULL,
    "orgSlug" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'POLICY_VIOLATION',
    "domain" TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "violationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isSystemic" BOOLEAN NOT NULL DEFAULT false,
    "policyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernanceViolationRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernanceEscalationRecord" (
    "id" TEXT NOT NULL,
    "orgSlug" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'AUTHORITY_INSUFFICIENT',
    "domain" TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "targetAuthority" TEXT NOT NULL DEFAULT 'MANAGER',
    "escalationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isBlocking" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernanceEscalationRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernanceRiskRecord" (
    "id" TEXT NOT NULL,
    "orgSlug" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'COMPLIANCE_RISK',
    "domain" TEXT NOT NULL DEFAULT 'CROSS_DOMAIN',
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "likelihood" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impact" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isSystemic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernanceRiskRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GovernanceAssessmentRecord" (
    "id" TEXT NOT NULL,
    "orgSlug" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNDER_REVIEW',
    "complianceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "governanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "exceptionCount" INTEGER NOT NULL DEFAULT 0,
    "escalationCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GovernanceAssessmentRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GovernanceReportRecord_orgSlug_idx" ON "GovernanceReportRecord"("orgSlug");
CREATE INDEX "GovernanceReportRecord_orgSlug_sessionId_idx" ON "GovernanceReportRecord"("orgSlug", "sessionId");
CREATE INDEX "GovernanceReportRecord_orgSlug_status_idx" ON "GovernanceReportRecord"("orgSlug", "status");
CREATE INDEX "GovernancePolicyRecord_orgSlug_idx" ON "GovernancePolicyRecord"("orgSlug");
CREATE INDEX "GovernancePolicyRecord_orgSlug_isActive_idx" ON "GovernancePolicyRecord"("orgSlug", "isActive");
CREATE INDEX "GovernanceViolationRecord_orgSlug_idx" ON "GovernanceViolationRecord"("orgSlug");
CREATE INDEX "GovernanceViolationRecord_orgSlug_sessionId_idx" ON "GovernanceViolationRecord"("orgSlug", "sessionId");
CREATE INDEX "GovernanceViolationRecord_orgSlug_severity_idx" ON "GovernanceViolationRecord"("orgSlug", "severity");
CREATE INDEX "GovernanceEscalationRecord_orgSlug_idx" ON "GovernanceEscalationRecord"("orgSlug");
CREATE INDEX "GovernanceEscalationRecord_orgSlug_sessionId_idx" ON "GovernanceEscalationRecord"("orgSlug", "sessionId");
CREATE INDEX "GovernanceEscalationRecord_orgSlug_isBlocking_idx" ON "GovernanceEscalationRecord"("orgSlug", "isBlocking");
CREATE INDEX "GovernanceRiskRecord_orgSlug_idx" ON "GovernanceRiskRecord"("orgSlug");
CREATE INDEX "GovernanceRiskRecord_orgSlug_sessionId_idx" ON "GovernanceRiskRecord"("orgSlug", "sessionId");
CREATE INDEX "GovernanceRiskRecord_orgSlug_severity_idx" ON "GovernanceRiskRecord"("orgSlug", "severity");
CREATE INDEX "GovernanceAssessmentRecord_orgSlug_idx" ON "GovernanceAssessmentRecord"("orgSlug");
CREATE INDEX "GovernanceAssessmentRecord_orgSlug_sessionId_idx" ON "GovernanceAssessmentRecord"("orgSlug", "sessionId");
