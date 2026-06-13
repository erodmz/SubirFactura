-- CreateTable
CREATE TABLE "rnc_padron" (
    "rnc" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nombre_comercial" TEXT,
    "actividad" TEXT,
    "estado" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rnc_padron_pkey" PRIMARY KEY ("rnc")
);

