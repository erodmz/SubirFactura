-- "Quitar" del equipo pasa a borrado lógico: historial + reactivación.
ALTER TABLE "memberships" ADD COLUMN "deleted_at" TIMESTAMP(3);
