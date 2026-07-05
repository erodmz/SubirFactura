-- El contador puede subir facturas sin elegir empresa; se auto-asignan por el
-- RNC del comprador (QR e-CF) o quedan "sin asignar".
ALTER TABLE "invoices" ALTER COLUMN "client_profile_id" DROP NOT NULL;
