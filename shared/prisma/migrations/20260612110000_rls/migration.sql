-- Row-level security por tenant (ESPECIFICACION.md §4, §8).
-- Segunda barrera tras los guards del API sobre las tablas de datos fiscales.
-- Cada request tenant-scoped fija app.current_org vía set_config() (PrismaService.forOrg).
--
-- Las tablas de coordinación (memberships, subscriptions, invitations, audit_log)
-- se consultan legítimamente fuera del contexto de un tenant (login, panel
-- super-admin, auditoría global) y quedan protegidas por los guards del API.
--
-- IMPORTANTE: la RLS solo aplica a roles que NO son dueños de las tablas ni
-- superusuarios. El API debe conectarse con el rol `facturard_app`
-- (ver docker/initdb/01-app-role.sh y la variable APP_DATABASE_URL).

ALTER TABLE "client_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;

-- current_setting(..., TRUE) devuelve NULL si la variable no está fijada:
-- sin app.current_org no se ve ninguna fila.
CREATE POLICY tenant_isolation ON "client_profiles"
  USING ("organization_id" = current_setting('app.current_org', TRUE))
  WITH CHECK ("organization_id" = current_setting('app.current_org', TRUE));

CREATE POLICY tenant_isolation ON "invoices"
  USING ("organization_id" = current_setting('app.current_org', TRUE))
  WITH CHECK ("organization_id" = current_setting('app.current_org', TRUE));
