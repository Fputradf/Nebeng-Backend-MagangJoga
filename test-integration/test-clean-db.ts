import { getTestPrisma, cleanTestDatabase } from './test-helper';

async function testCleanDb() {
  const prisma = await getTestPrisma();

  console.log('BEFORE cleanTestDatabase:');
  const usersBefore = await prisma.$queryRaw`SELECT COUNT(*) as count FROM users`;
  const tripsBefore = await prisma.$queryRaw`SELECT COUNT(*) as count FROM trips`;
  const ordersBefore = await prisma.$queryRaw`SELECT COUNT(*) as count FROM orders`;
  const walletsBefore = await prisma.$queryRaw`SELECT COUNT(*) as count FROM wallets`;
  const autoIncBefore = await prisma.$queryRaw`SHOW TABLE STATUS LIKE 'users'`;
  
  console.log('Users:', usersBefore);
  console.log('Trips:', tripsBefore);
  console.log('Orders:', ordersBefore);
  console.log('Wallets:', walletsBefore);
  console.log('Auto_increment users:', autoIncBefore);

  await cleanTestDatabase(prisma);

  console.log('\nAFTER cleanTestDatabase:');
  const usersAfter = await prisma.$queryRaw`SELECT COUNT(*) as count FROM users`;
  const tripsAfter = await prisma.$queryRaw`SELECT COUNT(*) as count FROM trips`;
  const ordersAfter = await prisma.$queryRaw`SELECT COUNT(*) as count FROM orders`;
  const walletsAfter = await prisma.$queryRaw`SELECT COUNT(*) as count FROM wallets`;
  const autoIncAfter = await prisma.$queryRaw`SHOW TABLE STATUS LIKE 'users'`;
  
  console.log('Users:', usersAfter);
  console.log('Trips:', tripsAfter);
  console.log('Orders:', ordersAfter);
  console.log('Wallets:', walletsAfter);
  console.log('Auto_increment users:', autoIncAfter);

  await prisma.$disconnect();
}

testCleanDb().catch(console.error);

