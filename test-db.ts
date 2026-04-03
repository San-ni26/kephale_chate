import { prisma } from './src/lib/prisma';

async function main() {
  const prismaStart = Date.now();
  try {
    const user = await prisma.user.findFirst();
    console.log('Prisma connected and fetched in', Date.now() - prismaStart, 'ms');
  } catch (e: any) {
    console.error('Prisma error:', e);
  }
}

main().catch(console.error);
