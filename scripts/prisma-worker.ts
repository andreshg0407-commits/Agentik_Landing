import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DIRECT_URL;

if (!connectionString) {
  throw new Error("Missing DIRECT_URL for worker");
}

const pool = new Pool({
  connectionString,
});

const adapter = new PrismaPg(pool);

export const prismaWorker = new PrismaClient({
  adapter,
});