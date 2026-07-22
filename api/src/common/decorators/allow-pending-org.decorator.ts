import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_ORG_KEY = 'allowPendingOrg';

/**
 * Exime a un endpoint del bloqueo por aprobación KYC: una empresa `pendiente`
 * o `rechazada` solo puede ver su propio estado y subir el documento de
 * verificación — todo lo demás queda cerrado hasta que el super-admin apruebe.
 */
export const AllowPendingOrg = () => SetMetadata(ALLOW_PENDING_ORG_KEY, true);
