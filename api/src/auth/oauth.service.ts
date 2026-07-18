import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from './auth.service';

/**
 * Verifica los ID tokens de los proveedores sociales y delega el
 * buscar-o-enlazar-o-crear a AuthService.loginWithProvider.
 *
 * Flujo (mismo para web y móvil): el cliente obtiene un ID token del proveedor
 * (Google Identity Services / google_sign_in) y lo manda aquí; el backend lo
 * verifica contra el proveedor —nunca confía en datos del cliente sin verificar—
 * y emite NUESTROS tokens.
 */
@Injectable()
export class OAuthService {
  // El audience: los ID tokens de Google deben venir para NUESTRO client id.
  private readonly googleClientId = process.env.GOOGLE_CLIENT_ID ?? '';
  private readonly google = this.googleClientId ? new OAuth2Client(this.googleClientId) : null;

  constructor(private readonly auth: AuthService) {}

  async loginWithGoogle(idToken: string) {
    if (!this.google) {
      // Sin GOOGLE_CLIENT_ID configurado el login con Google está apagado.
      throw new ServiceUnavailableException('El acceso con Google no está configurado');
    }
    if (!idToken) throw new BadRequestException('Falta el token de Google');

    let payload;
    try {
      const ticket = await this.google.verifyIdToken({ idToken, audience: this.googleClientId });
      payload = ticket.getPayload();
    } catch {
      throw new BadRequestException('El token de Google no es válido');
    }
    if (!payload?.email) throw new BadRequestException('Google no entregó un correo');

    return this.auth.loginWithProvider({
      provider: 'google',
      providerAccountId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      nombre: payload.name,
    });
  }
}
