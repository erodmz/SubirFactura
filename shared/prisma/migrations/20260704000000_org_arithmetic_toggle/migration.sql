-- Toggle por empresa: exigir que la aritmética cuadre antes de validar.
ALTER TABLE "organizations"
  ADD COLUMN "requiere_validacion_aritmetica" BOOLEAN NOT NULL DEFAULT true;
