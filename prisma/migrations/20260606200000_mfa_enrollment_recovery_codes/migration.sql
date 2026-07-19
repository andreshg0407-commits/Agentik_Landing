-- Migration: AGENTIK-SECURITY-MFA-01
-- MFA Enrollment + Recovery Codes models
-- Never stores plain secrets or codes — only encrypted secrets and scrypt hashes

CREATE TABLE "MfaEnrollment" (
    "id"              TEXT        NOT NULL,
    "orgSlug"         TEXT        NOT NULL,
    "userId"          TEXT        NOT NULL,
    "method"          TEXT        NOT NULL,
    "status"          TEXT        NOT NULL DEFAULT 'PENDING',
    "encryptedSecret" TEXT        NOT NULL,
    "failCount"       INTEGER     NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabledAt"       TIMESTAMPTZ,
    "lastUsedAt"      TIMESTAMPTZ,

    CONSTRAINT "MfaEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MfaEnrollment_orgSlug_userId_method_key"
    ON "MfaEnrollment"("orgSlug", "userId", "method");

CREATE UNIQUE INDEX "MfaEnrollment_id_orgSlug_key"
    ON "MfaEnrollment"("id", "orgSlug");

CREATE INDEX "MfaEnrollment_orgSlug_idx"
    ON "MfaEnrollment"("orgSlug");

CREATE INDEX "MfaEnrollment_orgSlug_userId_idx"
    ON "MfaEnrollment"("orgSlug", "userId");

CREATE INDEX "MfaEnrollment_orgSlug_status_idx"
    ON "MfaEnrollment"("orgSlug", "status");

CREATE INDEX "MfaEnrollment_orgSlug_method_idx"
    ON "MfaEnrollment"("orgSlug", "method");

-- Recovery codes: single-use, scrypt hashes only
CREATE TABLE "MfaRecoveryCode" (
    "id"        TEXT        NOT NULL,
    "orgSlug"   TEXT        NOT NULL,
    "userId"    TEXT        NOT NULL,
    "codeHash"  TEXT        NOT NULL,
    "usedAt"    TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MfaRecoveryCode_orgSlug_idx"
    ON "MfaRecoveryCode"("orgSlug");

CREATE INDEX "MfaRecoveryCode_orgSlug_userId_idx"
    ON "MfaRecoveryCode"("orgSlug", "userId");

CREATE INDEX "MfaRecoveryCode_orgSlug_userId_usedAt_idx"
    ON "MfaRecoveryCode"("orgSlug", "userId", "usedAt");
