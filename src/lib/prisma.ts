import "dotenv/config";
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/src/prisma/client'

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 15000, // 15s max pour éviter les attentes de 76s
});
const prisma = new PrismaClient({ adapter });

export { prisma };