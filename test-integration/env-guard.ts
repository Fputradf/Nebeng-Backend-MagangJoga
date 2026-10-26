/**
 * Environment guard module for integration tests.
 * Contains pure functions to verify test environment safety.
 */

import { PrismaClient } from '../src/generated/prisma/client';

export interface TestEnv {
  DB_HOST?: string;
  DB_NAME?: string;
  DATABASE_URL?: string;
  DB_PORT?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
}

/**
 * Assert that the test environment is safe for running integration tests.
 * Throws an error if any guard condition fails.
 *
 * @param env - Environment variables to check
 * @throws Error if environment is not safe
 */
export function assertSafeTestEnv(env: TestEnv): void {
  // Guard 1: Verify DB_HOST is localhost or 127.0.0.1
  const dbHost = env.DB_HOST;
  if (dbHost !== 'localhost' && dbHost !== '127.0.0.1') {
    throw new Error(
      `DB_HOST must be "localhost" or "127.0.0.1". Current: "${dbHost}". Test aborted to prevent data loss.`,
    );
  }

  // Guard 2: Verify DB_NAME is exactly "nebeng_test"
  const dbName = env.DB_NAME;
  if (dbName !== 'nebeng_test') {
    throw new Error(
      `DB_NAME must be exactly "nebeng_test". Current: "${dbName}". Test aborted to prevent data loss.`,
    );
  }

  // Guard 3: Parse DATABASE_URL and verify database name is exactly "nebeng_test"
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set in environment variables.');
  }

  const parsedUrl = new URL(dbUrl);
  const urlDbName = parsedUrl.pathname.replace(/^\//, '');

  if (urlDbName !== 'nebeng_test') {
    throw new Error(
      `DATABASE_URL must point to database "nebeng_test". Current database: "${urlDbName}". Test aborted to prevent data loss.`,
    );
  }
}

/**
 * Assert that the PrismaService instance is connected to nebeng_test.
 * This should be called in beforeAll of each integration test, before any table cleaning.
 *
 * @param prisma - PrismaClient instance to verify
 * @throws Error if not connected to nebeng_test
 */
export async function assertConnectedToTestDb(prisma: PrismaClient): Promise<void> {
  const result = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
  const actualDb = result[0]?.db;

  if (actualDb !== 'nebeng_test') {
    throw new Error(
      `PrismaService is connected to "${actualDb}", expected "nebeng_test". Test aborted to prevent data loss.`,
    );
  }
}
