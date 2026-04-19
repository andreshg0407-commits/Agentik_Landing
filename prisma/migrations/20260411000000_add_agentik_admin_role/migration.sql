-- Migration: add_agentik_admin_role
--
-- Separates Agentik internal operations from client org administration.
--
-- AGENTIK_ADMIN: Agentik platform staff who operate internal tooling
--   (runs, events, integrations, agentik agents, settings).
--   They have NO access to client business data (collections, sales, finance).
--
-- ORG_ADMIN remains for client-side org administration (fully client-facing).
-- SUPER_ADMIN retains full override access to everything.
--
-- Safe: ADD VALUE IF NOT EXISTS is idempotent.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AGENTIK_ADMIN';
