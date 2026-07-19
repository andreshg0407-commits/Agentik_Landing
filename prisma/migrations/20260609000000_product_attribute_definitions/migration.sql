-- MARKETING-STUDIO-PRODUCT-ATTRIBUTES-01
-- Adds ProductAttributeDefinition + ProductAttributeDefinitionOption
-- Org-level attribute definition catalog for the universal attribute system.

CREATE TABLE "ProductAttributeDefinition" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key"            TEXT NOT NULL,
    "label"          TEXT NOT NULL,
    "type"           TEXT NOT NULL DEFAULT 'text',
    "required"       BOOLEAN NOT NULL DEFAULT false,
    "sortOrder"      INTEGER NOT NULL DEFAULT 0,
    "helpText"       TEXT,
    "destination"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttributeDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductAttributeDefinitionOption" (
    "id"           TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "value"        TEXT NOT NULL,
    "label"        TEXT NOT NULL,
    "sortOrder"    INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductAttributeDefinitionOption_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "ProductAttributeDefinition_organizationId_key_key"
    ON "ProductAttributeDefinition"("organizationId", "key");

CREATE INDEX "ProductAttributeDefinition_organizationId_sortOrder_idx"
    ON "ProductAttributeDefinition"("organizationId", "sortOrder");

CREATE INDEX "ProductAttributeDefinitionOption_definitionId_sortOrder_idx"
    ON "ProductAttributeDefinitionOption"("definitionId", "sortOrder");

-- Foreign keys
ALTER TABLE "ProductAttributeDefinition"
    ADD CONSTRAINT "ProductAttributeDefinition_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductAttributeDefinitionOption"
    ADD CONSTRAINT "ProductAttributeDefinitionOption_definitionId_fkey"
    FOREIGN KEY ("definitionId") REFERENCES "ProductAttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
