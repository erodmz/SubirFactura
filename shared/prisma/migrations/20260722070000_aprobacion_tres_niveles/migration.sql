-- Workflow de aprobación de registros manuales en 3 niveles:
-- empresa (default) → cliente (heredar/siempre/nunca) → usuario (exención).
CREATE TYPE "ManualApprovalPolicy" AS ENUM ('heredar', 'siempre', 'nunca');

ALTER TABLE "organizations"
  ADD COLUMN "requiere_aprobacion_manual" BOOLEAN NOT NULL DEFAULT false;

-- El booleano por cliente (recién añadido, sin datos reales) se convierte en
-- política tri-estado: true → 'siempre', false → 'heredar'.
ALTER TABLE "client_profiles"
  ADD COLUMN "aprobacion_manual" "ManualApprovalPolicy" NOT NULL DEFAULT 'heredar';
UPDATE "client_profiles" SET "aprobacion_manual" = 'siempre' WHERE "requiere_aprobacion" = true;
ALTER TABLE "client_profiles" DROP COLUMN "requiere_aprobacion";

ALTER TABLE "memberships"
  ADD COLUMN "exento_aprobacion" BOOLEAN NOT NULL DEFAULT false;
