-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Document_createdById_idx" ON "Document"("createdById");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
