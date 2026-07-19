-- CreateEnum
CREATE TYPE "PaymentDocumentType" AS ENUM ('PAGO', 'ND', 'AJUSTE');

-- AlterTable
ALTER TABLE "PaymentRecord"
  ADD COLUMN "documentType" "PaymentDocumentType" NOT NULL DEFAULT 'PAGO';
