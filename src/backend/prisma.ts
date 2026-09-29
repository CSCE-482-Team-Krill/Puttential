import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

// Read the PostgreSQL connection string from the environment.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL is not defined.");
}

// Storing PrismaClient on globalThis lets us reuse one client instead of repeatedly creating new database connections.
const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
};

// Create the Prisma client only if one does not already exist.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
    }),
  });

// In our production, the module is normally initialized once, so this cache is mainly useful for the local development environment.
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}