-- PLATFORM-AUTHORITY-SEPARATION-01
-- Adds global platform role to User, independent of organization membership.
--
-- SAFETY:
--   - Additive only (new enum + nullable column). No data loss.
--   - Existing users get platformRole = NULL (tenant-only, no platform privileges).
--   - Rollback: DROP COLUMN "platformRole" FROM "User"; DROP TYPE "PlatformRole";
--
-- MUST be applied BEFORE deploying code that reads User.platformRole.

-- 1. Create the PlatformRole enum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'AGENTIK_ADMIN');

-- 2. Add nullable platformRole column to User
ALTER TABLE "User" ADD COLUMN "platformRole" "PlatformRole";
