import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * ThrottlerGuard con el mensaje del 429 en español. El mensaje por defecto del
 * paquete es "ThrottlerException: Too Many Requests" (inglés), que llega tal cual
 * a la UI — inaceptable para el usuario (CLAUDE.md §10: español en mensajes).
 */
@Injectable()
export class EsThrottlerGuard extends ThrottlerGuard {
  protected override async getErrorMessage(
    _context: ExecutionContext,
    _detail: ThrottlerLimitDetail,
  ): Promise<string> {
    return 'Demasiadas solicitudes en poco tiempo. Espera un momento e inténtalo de nuevo.';
  }
}
