-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "subido_por_id" TEXT;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
