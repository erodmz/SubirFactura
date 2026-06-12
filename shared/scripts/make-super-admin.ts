// Promueve un usuario a super-admin (panel /admin de suscripciones).
// Uso: pnpm --filter @facturard/shared exec tsx scripts/make-super-admin.ts correo@ejemplo.com
import { PrismaClient } from '@prisma/client';

const email = process.argv[2];
if (!email) {
  console.error('Uso: tsx scripts/make-super-admin.ts <email>');
  process.exit(1);
}

const prisma = new PrismaClient();

prisma.user
  .update({ where: { email }, data: { isSuperAdmin: true } })
  .then((user) => console.log(`${user.email} ahora es super-admin`))
  .catch((e) => {
    console.error(e.code === 'P2025' ? `No existe un usuario con email ${email}` : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
