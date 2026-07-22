-- KYC de empresas + registro manual de gastos.
CREATE TYPE "OrgApprovalStatus" AS ENUM ('pendiente', 'aprobada', 'rechazada');

ALTER TABLE "organizations"
  ADD COLUMN "estado_aprobacion" "OrgApprovalStatus" NOT NULL DEFAULT 'pendiente',
  ADD COLUMN "verificacion_doc_key" TEXT,
  ADD COLUMN "motivo_rechazo" TEXT;

-- Las empresas que ya existían siguen operando: quedan aprobadas.
UPDATE "organizations" SET "estado_aprobacion" = 'aprobada';

-- Workflow de aprobación de registros manuales, por cliente.
ALTER TABLE "client_profiles"
  ADD COLUMN "requiere_aprobacion" BOOLEAN NOT NULL DEFAULT false;

-- Registro manual: la factura puede existir sin foto.
ALTER TABLE "invoices"
  ADD COLUMN "origen" TEXT NOT NULL DEFAULT 'foto',
  ALTER COLUMN "imagen_url" DROP NOT NULL;
