import { PrismaClient } from '@prisma/client';
import { CATEGORIAS_606 } from '../src/constants';

const prisma = new PrismaClient();

// Precios placeholder (ESPECIFICACION.md §7): se definen comercialmente después.
const PLANS = [
  { nombre: 'Básico', maxContadores: 1, maxClientes: 10, maxFacturasMes: 200, precio: '0.00' },
  { nombre: 'Pro', maxContadores: 5, maxClientes: 50, maxFacturasMes: 1500, precio: '0.00' },
  {
    nombre: 'Empresarial',
    maxContadores: 25,
    maxClientes: 300,
    maxFacturasMes: 10000,
    precio: '0.00',
  },
];

async function main() {
  for (const categoria of CATEGORIAS_606) {
    await prisma.categoria606.upsert({
      where: { codigo: categoria.codigo },
      update: { nombre: categoria.nombre },
      create: categoria,
    });
  }

  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { nombre: plan.nombre },
      update: {
        maxContadores: plan.maxContadores,
        maxClientes: plan.maxClientes,
        maxFacturasMes: plan.maxFacturasMes,
      },
      create: plan,
    });
  }

  console.log(`Seed completado: ${CATEGORIAS_606.length} categorías 606, ${PLANS.length} planes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
