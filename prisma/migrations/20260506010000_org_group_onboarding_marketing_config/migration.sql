-- Sprint TA-02: OrgGroup, OrgGroupMember, OnboardingChecklist, TenantMarketingConfig
-- Additive-only migration. No existing tables or columns are modified.

-- ── OrgGroup ─────────────────────────────────────────────────────────────────

CREATE TABLE "OrgGroup" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "slug"        TEXT NOT NULL,
    "description" TEXT,
    "settingsJson" JSONB,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgGroup_slug_key" ON "OrgGroup"("slug");

-- ── OrgGroupMember ────────────────────────────────────────────────────────────

CREATE TABLE "OrgGroupMember" (
    "id"        TEXT NOT NULL,
    "groupId"   TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "role"      TEXT NOT NULL DEFAULT 'MEMBER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgGroupMember_groupId_orgId_key" ON "OrgGroupMember"("groupId", "orgId");
CREATE INDEX "OrgGroupMember_orgId_idx" ON "OrgGroupMember"("orgId");

ALTER TABLE "OrgGroupMember"
    ADD CONSTRAINT "OrgGroupMember_groupId_fkey"
    FOREIGN KEY ("groupId")
    REFERENCES "OrgGroup"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrgGroupMember"
    ADD CONSTRAINT "OrgGroupMember_orgId_fkey"
    FOREIGN KEY ("orgId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── OnboardingChecklist ───────────────────────────────────────────────────────

CREATE TABLE "OnboardingChecklist" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    "businessModeSet"   BOOLEAN NOT NULL DEFAULT false,
    "erpConnected"      BOOLEAN NOT NULL DEFAULT false,
    "erpSampleVerified" BOOLEAN NOT NULL DEFAULT false,
    "erpFirstSyncDone"  BOOLEAN NOT NULL DEFAULT false,
    "shopifyConnected"  BOOLEAN NOT NULL DEFAULT false,
    "whatsappConnected" BOOLEAN NOT NULL DEFAULT false,
    "socialConnected"   BOOLEAN NOT NULL DEFAULT false,
    "brandVoiceSet"     BOOLEAN NOT NULL DEFAULT false,
    "modulesActivated"  BOOLEAN NOT NULL DEFAULT false,

    "completedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingChecklist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingChecklist_organizationId_key" ON "OnboardingChecklist"("organizationId");

ALTER TABLE "OnboardingChecklist"
    ADD CONSTRAINT "OnboardingChecklist_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── TenantMarketingConfig ─────────────────────────────────────────────────────

CREATE TABLE "TenantMarketingConfig" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenantName"     TEXT NOT NULL,
    "active"         BOOLEAN NOT NULL DEFAULT true,
    "promptEngine"   TEXT NOT NULL DEFAULT 'generic',
    "configJson"     JSONB NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMarketingConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantMarketingConfig_organizationId_key" ON "TenantMarketingConfig"("organizationId");

ALTER TABLE "TenantMarketingConfig"
    ADD CONSTRAINT "TenantMarketingConfig_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
