-- Dos despachos no pueden compartir RNC (varios NULL siguen permitidos).
CREATE UNIQUE INDEX "organizations_rnc_key" ON "organizations"("rnc");
