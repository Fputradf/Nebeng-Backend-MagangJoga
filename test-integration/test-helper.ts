import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client';
import { assertConnectedToTestDb } from './env-guard';

let testPrisma: PrismaClient | null = null;

/**
 * Get a PrismaClient instance wired exactly like the application (using DB_* env vars)
 * and verify it's connected to nebeng_test.
 */
export async function getTestPrisma(): Promise<PrismaClient> {
  if (testPrisma) {
    // Verify connection each time using the same Prisma instance
    await assertConnectedToTestDb(testPrisma);
    return testPrisma;
  }

  // Create ConfigService manually with env variables
  const configService = new ConfigService();

  // Create adapter using DB_* env vars (same as PrismaService)
  const adapter = new PrismaMariaDb({
    host: configService.get<string>('DB_HOST', 'localhost'),
    port: configService.get<number>('DB_PORT', 3306),
    user: configService.get<string>('DB_USER', 'root'),
    password: configService.get<string>('DB_PASSWORD', ''),
    database: configService.get<string>('DB_NAME', 'nebeng'),
    connectionLimit: 5,
  });

  // Create PrismaClient with the adapter
  testPrisma = new PrismaClient({ adapter });

  // Connect Prisma
  await testPrisma.$connect();

  // Verify database connection using the same Prisma instance
  await assertConnectedToTestDb(testPrisma);

  return testPrisma;
}

/**
 * Close the test Prisma connection.
 */
export async function closeTestPrisma(): Promise<void> {
  if (testPrisma) {
    await testPrisma.$disconnect();
    testPrisma = null;
  }
}

/**
 * Clean all tables in the test database.
 * Uses the same PrismaClient instance to verify connection before cleaning.
 */
export async function cleanTestDatabase(prisma: PrismaClient): Promise<void> {
  // Verify we're in test database before cleaning using the same Prisma instance
  await assertConnectedToTestDb(prisma);

  // Use raw mariadb for cleaning (still using same connection parameters)
  const mariadb = require('mariadb');
  const conn = await mariadb.createConnection({
    host: '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 10000,
  });

  try {
    // Disable foreign key checks
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // Get all table names with explicit alias
    const tables = await conn.query(
      "SELECT TABLE_NAME AS tbl FROM information_schema.tables WHERE table_schema = 'nebeng_test'",
    );



    if (tables.length === 0) {
      throw new Error('No tables found in nebeng_test schema');
    }

    // Truncate all tables except _prisma_migrations
    for (const table of tables) {
      const tableName = table.tbl;
      if (tableName && tableName !== '_prisma_migrations') {
        await conn.query(`TRUNCATE TABLE \`${tableName}\``);
      }
    }

    // Re-enable foreign key checks
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // Assert tables are empty
    const userCount = await conn.query('SELECT COUNT(*) as c FROM users');
    const tripCount = await conn.query('SELECT COUNT(*) as c FROM trips');
    const orderCount = await conn.query('SELECT COUNT(*) as c FROM orders');
    const walletCount = await conn.query('SELECT COUNT(*) as c FROM wallets');

    const users = Number(userCount[0].c);
    const trips = Number(tripCount[0].c);
    const orders = Number(orderCount[0].c);
    const wallets = Number(walletCount[0].c);

    if (users !== 0 || trips !== 0 || orders !== 0 || wallets !== 0) {
      throw new Error('Database not fully cleaned after TRUNCATE');
    }
  } finally {
    await conn.end();
  }
}
