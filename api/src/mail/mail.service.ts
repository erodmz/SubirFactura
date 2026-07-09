import { Injectable, Logger } from '@nestjs/common';

/**
 * Envío de correos transaccionales. Hoy NO hay proveedor conectado, así que por
 * defecto registra el mensaje en el log del servidor (y quien llama puede
 * devolver el enlace en desarrollo para probar). Para activar el envío real,
 * conecta aquí un proveedor (Resend, SMTP, SES…) detrás de una variable de
 * entorno — el resto del código no cambia.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  /** True cuando hay un proveedor de correo configurado. */
  get enabled(): boolean {
    return !!process.env.RESEND_API_KEY || !!process.env.SMTP_URL;
  }

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    const asunto = 'Restablece tu contraseña de SubirFactura';
    const cuerpo =
      `Recibimos una solicitud para restablecer tu contraseña.\n\n` +
      `Abre este enlace (válido por 1 hora):\n${resetUrl}\n\n` +
      `Si no fuiste tú, ignora este correo.`;
    await this.send(email, asunto, cuerpo);
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    // TODO(correo): conectar proveedor real. Ej. con Resend:
    //   if (process.env.RESEND_API_KEY) { await resend.emails.send({...}); return; }
    if (!this.enabled) {
      this.logger.warn(
        `[correo no configurado] Para: ${to} · ${subject}\n${text}`,
      );
      return;
    }
    // Placeholder: con proveedor configurado, enviar aquí.
    this.logger.log(`Correo enviado a ${to}: ${subject}`);
  }
}
