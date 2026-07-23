import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MailService } from './mail.service';

// El servicio avisa por alertRupture cuando un envío falla; aquí solo nos
// importa que NO relance (la operación que lo disparó debe completarse).
vi.mock('@facturard/shared', () => ({ alertRupture: vi.fn().mockResolvedValue(undefined) }));

describe('MailService', () => {
  let mail: MailService;
  const env = { ...process.env };

  beforeEach(() => {
    mail = new MailService();
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_URL;
    delete process.env.MAIL_FROM;
    vi.restoreAllMocks();
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('sin RESEND_API_KEY no envía nada ni revienta', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(
      mail.sendEmailVerification('a@b.com', 'https://x/verificar'),
    ).resolves.toBeUndefined();
    expect(mail.enabled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('SMTP_URL solo no habilita el envío (no hay soporte SMTP)', () => {
    process.env.SMTP_URL = 'smtp://localhost:25';
    expect(mail.enabled).toBe(false);
  });

  it('con la clave, hace POST a Resend con texto, HTML y el enlace', async () => {
    process.env.RESEND_API_KEY = 'clave-de-prueba';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"id":"1"}', { status: 200 }));

    await mail.sendPasswordReset('contador@ejemplo.do', 'https://app/reset?token=abc');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer clave-de-prueba');
    const cuerpo = JSON.parse((init as RequestInit).body as string);
    expect(cuerpo.to).toEqual(['contador@ejemplo.do']);
    expect(cuerpo.subject).toMatch(/contraseña/i);
    // El enlace tiene que ir en AMBAS partes: hay clientes que no pintan HTML.
    expect(cuerpo.text).toContain('https://app/reset?token=abc');
    expect(cuerpo.html).toContain('https://app/reset?token=abc');
  });

  it('usa MAIL_FROM cuando está definido', async () => {
    process.env.RESEND_API_KEY = 'k';
    process.env.MAIL_FROM = 'Otro <hola@ejemplo.do>';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    await mail.sendEmailVerification('a@b.com', 'https://x');
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string).from).toBe(
      'Otro <hola@ejemplo.do>',
    );
  });

  it('un fallo de Resend NO tumba la operación que disparó el correo', async () => {
    process.env.RESEND_API_KEY = 'k';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"message":"domain not verified"}', { status: 403 }),
    );
    await expect(mail.sendEmailVerification('a@b.com', 'https://x')).resolves.toBeUndefined();
  });

  it('una caída de red tampoco relanza', async () => {
    process.env.RESEND_API_KEY = 'k';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(mail.sendPasswordReset('a@b.com', 'https://x')).resolves.toBeUndefined();
  });

  it('la invitación nombra la empresa y a quien invita', async () => {
    process.env.RESEND_API_KEY = 'k';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    await mail.sendInvitation(
      'nuevo@ejemplo.do',
      'https://app/invitations/tok',
      'Contadores Unidos SRL',
      'contador',
      'Elmer',
    );
    const cuerpo = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(cuerpo.subject).toContain('Contadores Unidos SRL');
    expect(cuerpo.text).toContain('Elmer');
    expect(cuerpo.text).toContain('contador');
    expect(cuerpo.html).toContain('https://app/invitations/tok');
  });

  it('escapa el HTML del nombre de la empresa (no se inyecta marcado)', async () => {
    process.env.RESEND_API_KEY = 'k';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    await mail.sendInvitation('a@b.com', 'https://x', '<script>alert(1)</script>', 'contador');
    const { html } = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
