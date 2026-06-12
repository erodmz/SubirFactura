// Cliente Prisma compartido entre API y workers.
// Importar desde '@facturard/shared/db' para no cargar el cliente en código que no toca BD.
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export * from '@prisma/client';
