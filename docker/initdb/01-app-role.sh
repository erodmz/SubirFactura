#!/bin/sh
# Crea el rol de aplicación SIN privilegios de dueño ni BYPASSRLS.
# Se ejecuta solo en la primera inicialización del volumen de PostgreSQL.
set -e

: "${POSTGRES_APP_PASSWORD:?Definir POSTGRES_APP_PASSWORD en .env}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE ROLE facturard_app LOGIN PASSWORD '${POSTGRES_APP_PASSWORD}' NOBYPASSRLS;
	GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO facturard_app;
	GRANT USAGE ON SCHEMA public TO facturard_app;
	GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO facturard_app;
	GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO facturard_app;
	-- Tablas que creen las migraciones futuras heredan los permisos
	ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_USER}" IN SCHEMA public
	  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO facturard_app;
	ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_USER}" IN SCHEMA public
	  GRANT USAGE, SELECT ON SEQUENCES TO facturard_app;
EOSQL
