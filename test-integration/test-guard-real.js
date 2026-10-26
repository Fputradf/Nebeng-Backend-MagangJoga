// Test to verify guard aborts when DATABASE_URL points to nebeng
require('dotenv').config({ path: '.env.test', override: true });

// Override to wrong database
process.env.DATABASE_URL = 'mysql://root:@localhost:3306/nebeng';

const dbUrl = process.env.DATABASE_URL;
const parsedUrl = new URL(dbUrl);
const dbName = parsedUrl.pathname.replace(/^\//, '');

console.log(`Testing with DATABASE_URL pointing to: "${dbName}"`);

if (dbName !== 'nebeng_test') {
  console.log(`[GUARD] ERROR: DATABASE_URL must point to "nebeng_test". Current: "${dbName}". Test aborted.`);
  process.exit(1);
}

console.log('This should not be reached');
