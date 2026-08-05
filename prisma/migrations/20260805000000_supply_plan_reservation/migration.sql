-- AGENTIK-STORES-SUPPLY-PLAN-RESERVATION-01
-- Add RESERVADO status and RESERVAR/LIBERAR_RESERVA transitions
-- Pure additive: enum value additions only, zero destructive operations.

-- 1. Add RESERVADO to ReplenishmentDocumentStatus (between BORRADOR and APROBADO)
ALTER TYPE "ReplenishmentDocumentStatus" ADD VALUE IF NOT EXISTS 'RESERVADO' BEFORE 'APROBADO';

-- 2. Add RESERVAR to StoreReplenishmentTransition
ALTER TYPE "StoreReplenishmentTransition" ADD VALUE IF NOT EXISTS 'RESERVAR' BEFORE 'APROBAR';

-- 3. Add LIBERAR_RESERVA to StoreReplenishmentTransition
ALTER TYPE "StoreReplenishmentTransition" ADD VALUE IF NOT EXISTS 'LIBERAR_RESERVA' BEFORE 'APROBAR';
