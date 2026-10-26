// Test script to verify guard works
require('dotenv').config({ path: '.env.test', override: true });

const dbUrl = process.env.DATABASE_URL;
const parsedUrl = new URL(dbUrl);
const dbName = parsedUrl.pathname.replace(/^\//, '');

console.log(`Parsed database name: "${dbName}"`);

if (dbName !== 'nebeng_test') {
  console.log(`ERROR: Expected "nebeng_test", got "${dbName}"`);
  process.exit(1);
}

console.log('SUCCESS: Database name is correct');

// Test with wrong database
console.log('\n--- Testing with wrong database ---');
process.env.DATABASE_URL = 'mysql://root:@localhost:3306/nebeng';
const wrongDbUrl = process.env.DATABASE_URL;
const wrongParsedUrl = new URL(wrongDbUrl);
const wrongDbName = wrongParsedUrl.pathname.replace(/^\//, '');

console.log(`Parsed database name: "${wrongDbName}"`);

if (wrongDbName !== 'nebeng_test') {
  console.log(`SUCCESS: Guard correctly rejects database "${wrongDbName}"`);
} else {
  console.log('ERROR: Guard should have rejected wrong database');
  process.exit(1);
}
