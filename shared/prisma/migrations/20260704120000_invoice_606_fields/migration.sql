-- Campos del Formato 606 para el llenado del contador (cols. 1–23).
ALTER TABLE "invoices"
  ADD COLUMN "tipo_id_proveedor"       TEXT,
  ADD COLUMN "ncf_modificado"          TEXT,
  ADD COLUMN "fecha_pago"              DATE,
  ADD COLUMN "tipo_bien_servicio"      TEXT,
  ADD COLUMN "monto_servicios"         DECIMAL(14,2),
  ADD COLUMN "monto_bienes"            DECIMAL(14,2),
  ADD COLUMN "itbis_retenido"          DECIMAL(14,2),
  ADD COLUMN "itbis_proporcionalidad"  DECIMAL(14,2),
  ADD COLUMN "itbis_costo"             DECIMAL(14,2),
  ADD COLUMN "itbis_percibido"         DECIMAL(14,2),
  ADD COLUMN "tipo_retencion_isr"      TEXT,
  ADD COLUMN "monto_retencion_renta"   DECIMAL(14,2),
  ADD COLUMN "isr_percibido"           DECIMAL(14,2),
  ADD COLUMN "impuesto_selectivo"      DECIMAL(14,2),
  ADD COLUMN "forma_pago"              TEXT;
