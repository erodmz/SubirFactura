-- Permiso por usuario: el contador habilita a un cliente para validar facturas.
ALTER TABLE "memberships"
  ADD COLUMN "puede_validar" BOOLEAN NOT NULL DEFAULT false;
