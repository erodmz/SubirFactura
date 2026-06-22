-- CreateTable
CREATE TABLE "invoice_images" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_images_invoice_id_order_index_idx" ON "invoice_images"("invoice_id", "order_index");

-- AddForeignKey
ALTER TABLE "invoice_images" ADD CONSTRAINT "invoice_images_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

