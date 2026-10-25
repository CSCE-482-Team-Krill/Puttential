import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * Creates a Prisma client for the current request.
 *
 * Cloudflare Workers cannot reuse a database connection across requests, so
 * we never share one global client. Each call gets its own client, and
 * `maxUses: 1` closes every connection after a single use. This also works
 * unchanged under Node.js (`next dev`, the seed script).
 *
 * DATABASE_URL comes from the platform: Cloudflare/Vercel variables in
 * production, the root .env locally (loaded by next.config.ts and the CLI).
 */
export function getPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined.');
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, maxUses: 1 }),
  });
}
