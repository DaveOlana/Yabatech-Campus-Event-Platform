import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

describe('PostgreSQL & Prisma 7 Connectivity', () => {
  const connectionString = process.env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  it('connects to PostgreSQL container and executes a raw query', async () => {
    await prisma.$connect();
    const result = await prisma.$queryRaw<Array<{ connected: number; db_name: string }>>`
      SELECT 1 as connected, current_database() as db_name;
    `;

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(Number(result[0].connected)).toBe(1);
    expect(result[0].db_name).toBe('ycep_dev');
  });
});
