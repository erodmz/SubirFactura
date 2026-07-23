import { Injectable, Logger } from '@nestjs/common';
import { alertRupture } from '@facturard/shared';

/**
 * Correos transaccionales vía Resend (API HTTP — sin SDK: es un POST con fetch,
 * y una dependencia menos que auditar).
 *
 * Sin `RESEND_API_KEY` no se envía nada: el mensaje queda en el log del
 * servidor y, fuera de producción, quien llama devuelve el enlace en la
 * respuesta para poder probar el flujo. Es degradación deliberada, no un fallo.
 *
 * Ningún error de correo tumba la operación que lo disparó: si Resend está
 * caído, el registro de un usuario tiene que completarse igual. Los fallos
 * salen por `alertRupture` (log + ntfy), que es como el resto del proyecto
 * avisa de rupturas.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  /** True cuando hay un proveedor de correo configurado. */
  get enabled(): boolean {
    return !!process.env.RESEND_API_KEY;
  }

  private get from(): string {
    return process.env.MAIL_FROM ?? 'SubirFactura <no-reply@subirfactura.com>';
  }

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    await this.send({
      to: email,
      subject: 'Restablece tu contraseña de SubirFactura',
      titulo: 'Restablece tu contraseña',
      parrafos: [
        'Recibimos una solicitud para restablecer tu contraseña.',
        'El enlace vence en 1 hora. Si no fuiste tú, ignora este correo: tu contraseña no cambia.',
      ],
      boton: { texto: 'Cambiar mi contraseña', url: resetUrl },
    });
  }

  async sendEmailVerification(email: string, verifyUrl: string): Promise<void> {
    await this.send({
      to: email,
      subject: 'Confirma tu correo en SubirFactura',
      titulo: '¡Bienvenido a SubirFactura!',
      parrafos: [
        'Confirma que este correo es tuyo para asegurar tu cuenta.',
        'El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este correo.',
      ],
      boton: { texto: 'Confirmar mi correo', url: verifyUrl },
    });
  }

  /**
   * Invitación a una empresa. Hasta ahora el enlace solo volvía en la respuesta
   * del API y había que pasarlo a mano por WhatsApp; con correo configurado
   * llega solo.
   */
  async sendInvitation(
    email: string,
    inviteUrl: string,
    empresa: string,
    rol: string,
    invitadoPor?: string | null,
  ): Promise<void> {
    const ROLES: Record<string, string> = {
      org_admin: 'administrador',
      contador: 'contador',
      cliente: 'usuario',
    };
    const quien = invitadoPor ? `${invitadoPor} te invitó` : 'Te invitaron';
    await this.send({
      to: email,
      subject: `Te invitaron a ${empresa} en SubirFactura`,
      titulo: `Te invitaron a ${empresa}`,
      parrafos: [
        `${quien} a unirte como ${ROLES[rol] ?? rol}.`,
        'Al aceptar, creas tu cuenta (o entras con la que ya tienes) y quedas dentro de la empresa.',
        'La invitación vence en 7 días.',
      ],
      boton: { texto: 'Aceptar la invitación', url: inviteUrl },
    });
  }

  private async send(msg: {
    to: string;
    subject: string;
    titulo: string;
    parrafos: string[];
    boton: { texto: string; url: string };
  }): Promise<void> {
    const texto = [
      msg.titulo,
      '',
      ...msg.parrafos,
      '',
      `${msg.boton.texto}: ${msg.boton.url}`,
    ].join('\n');

    if (!this.enabled) {
      if (process.env.SMTP_URL) {
        this.logger.warn(
          'SMTP_URL está definido pero no hay soporte SMTP: usa RESEND_API_KEY.',
        );
      }
      this.logger.warn(`[correo no configurado] Para: ${msg.to} · ${msg.subject}\n${texto}`);
      return;
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [msg.to],
          subject: msg.subject,
          text: texto,
          html: plantilla(msg.titulo, msg.parrafos, msg.boton),
        }),
      });
      if (!res.ok) {
        // El cuerpo de Resend dice POR QUÉ (dominio sin verificar, clave mala…);
        // sin él, diagnosticar esto a ciegas es media hora perdida.
        throw new Error(`Resend respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      this.logger.log(`Correo enviado a ${msg.to}: ${msg.subject}`);
    } catch (error) {
      // No relanzamos: el registro/invitación que disparó el correo debe
      // completarse igual. Pero que no se pierda en silencio.
      await alertRupture({
        key: 'mail.send',
        title: 'No se pudo enviar un correo',
        message: `Asunto "${msg.subject}". El usuario no recibió su enlace.`,
        error,
      });
    }
  }
}

/** Plantilla HTML mínima: legible en Gmail, Outlook y clientes de móvil. */
function plantilla(
  titulo: string,
  parrafos: string[],
  boton: { texto: string; url: string },
): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1f23">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:12px;padding:32px">
      <tr><td>
        <p style="margin:0 0 24px;font-size:18px;font-weight:700;color:#2563eb">SubirFactura</p>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${esc(titulo)}</h1>
        ${parrafos.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#41474e">${esc(p)}</p>`).join('')}
        <p style="margin:28px 0 8px">
          <a href="${esc(boton.url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">${esc(boton.texto)}</a>
        </p>
        <p style="margin:20px 0 0;font-size:12.5px;color:#8b9098;line-height:1.5">
          Si el botón no abre, copia este enlace:<br>
          <span style="word-break:break-all;color:#5b6169">${esc(boton.url)}</span>
        </p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#8b9098">SubirFactura · República Dominicana</p>
  </td></tr></table>
</body></html>`;
}
