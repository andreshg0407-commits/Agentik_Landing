// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaPool: Pool | undefined;
}

// Runtime (Next.js): SIEMPRE pooled
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Missing DATABASE_URL (runtime pooled URL)");

// En dev, guardamos también el pool para no crear uno nuevo en cada hot reload
const pool =
  global.__prismaPool ??
  new Pool({
    connectionString,
    // Si tu URL ya tiene sslmode=require, esto no es necesario.
    // ssl: { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") {
  global.__prismaPool = pool;
}

const adapter = new PrismaPg(pool);

export const prisma =
  global.__prisma ??
  new PrismaClient({
    adapter,
    // log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}