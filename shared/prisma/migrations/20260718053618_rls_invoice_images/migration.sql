-- RLS para invoice_images (segunda barrera). No tiene organization_id propio:
-- se aísla por su factura padre. La política exige que el invoice referenciado
-- pertenezca al tenant activo (app.current_org). Como invoices ya tiene RLS por
-- el mismo setting, una imagen de otra organización queda invisible aunque una
-- consulta futura olvide forOrg().
ALTER TABLE "invoice_images" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "invoice_images"
  USING (
    EXISTS (
      SELECT 1 FROM "invoices" i
      WHERE i.id = "invoice_images"."invoice_id"
        AND i."organization_id" = current_setting('app.current_org', TRUE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "invoices" i
      WHERE i.id = "invoice_images"."invoice_id"
        AND i."organization_id" = current_setting('app.current_org', TRUE)
    )
  );
