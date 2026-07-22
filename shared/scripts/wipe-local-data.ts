// Limpieza TOTAL de datos para probar desde cero (SOLO desarrollo local).
// Conserva: el usuario que se indique (como super admin), planes, categorías
// 606 y el padrón RNC. Borra todo lo demás.
// Uso: pnpm --filter @facturard/shared exec tsx scripts/wipe-local-data.ts elmer.test@facturard.do
import { PrismaClient } from '@prisma/client';

const email = process.argv[2];
if (!email) {
  console.error('Uso: tsx scripts/wipe-local-data.ts <email-a-conservar>');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Este script es de desarrollo: se niega a correr en producción.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const keep = await prisma.user.findUnique({ where: { email } });
  if (!keep) throw new Error(`No existe el usuario ${email} — abortando sin borrar nada`);

  const del = async (name: string, fn: () => Promise<{ count: number }>) => {
    const { count } = await fn();
    console.log(`  ${name}: ${count}`);
  };

  console.log('Borrando…');
  await del('invoice_images', () => prisma.invoiceImage.deleteMany());
  await del('invoices', () => prisma.invoice.deleteMany());
  await del('assignments', () => prisma.assignment.deleteMany());
  await del('client_members', () => prisma.clientMember.deleteMany());
  await del('client_profiles', () => prisma.clientProfile.deleteMany());
  await del('invitations', () => prisma.invitation.deleteMany());
  await del('subscriptions', () => prisma.subscription.deleteMany());
  await del('memberships', () => prisma.membership.deleteMany());
  await del('audit_logs', () => prisma.auditLog.deleteMany());
  await del('organizations', () => prisma.organization.deleteMany());
  await del('oauth_accounts', () => prisma.oAuthAccount.deleteMany());
  await del('refresh_tokens', () => prisma.refreshToken.deleteMany());
  await del('password_reset_tokens', () => prisma.passwordResetToken.deleteMany());
  await del('email_verification_tokens', () => prisma.emailVerificationToken.deleteMany());
  await del(`users (≠ ${email})`, () => prisma.user.deleteMany({ where: { id: { not: keep.id } } }));

  await prisma.user.update({ where: { id: keep.id }, data: { isSuperAdmin: true } });

  const [plans, cats, users] = await Promise.all([
    prisma.plan.count(),
    prisma.categoria606.count(),
    prisma.user.count(),
  ]);
  console.log(`\nConservado: ${users} usuario (${email}, super admin), ${plans} planes, ${cats} categorías 606`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
