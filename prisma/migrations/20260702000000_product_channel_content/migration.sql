-- MARKETING-STUDIO-PRODUCT-CHANNEL-CONTENT-01
-- Omnichannel content adaptation layer.
-- One record per (product, channel) — unique constraint enforces 1:1 per channel.
-- Channel-specific content stored as a JSON TEXT column for extensibility.
-- Never stores source-of-truth — always adapts from ProductContent (master).

CREATE TABLE "ProductChannelContent" (
  "id"             TEXT NOT NULL,
  "productId"      TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,

  -- Channel identifier: shopify | whatsapp | instagram | facebook | tiktok | marketplace | pdf
  "channel"        TEXT NOT NULL,

  -- Channel-specific content payload — JSON serialized per channel type.
  -- Null means "no override — inherit from ProductContent master".
  "content"        TEXT,

  -- Values governed at domain layer: draft | ready | approved
  "status"         TEXT NOT NULL DEFAULT 'draft',

  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductChannelContent_pkey" PRIMARY KEY ("id")
);

-- One record per product per channel
CREATE UNIQUE INDEX "ProductChannelContent_productId_channel_key"
  ON "ProductChannelContent"("productId", "channel");

-- FK to ProductEntity (cascade delete)
ALTER TABLE "ProductChannelContent"
  ADD CONSTRAINT "ProductChannelContent_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "ProductEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lookup indexes
CREATE INDEX "ProductChannelContent_organizationId_idx"       ON "ProductChannelContent"("organizationId");
CREATE INDEX "ProductChannelContent_organizationId_channel_idx" ON "ProductChannelContent"("organizationId", "channel");
CREATE INDEX "ProductChannelContent_productId_idx"            ON "ProductChannelContent"("productId");
