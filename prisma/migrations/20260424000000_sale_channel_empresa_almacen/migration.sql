-- Add EMPRESA and ALMACEN to SaleChannel enum
-- PostgreSQL 12+ allows ALTER TYPE ADD VALUE inside transactions
ALTER TYPE "SaleChannel" ADD VALUE IF NOT EXISTS 'EMPRESA';
ALTER TYPE "SaleChannel" ADD VALUE IF NOT EXISTS 'ALMACEN';
