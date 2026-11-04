// Load .env.test first with override to ensure test values are used
require('dotenv').config({ path: '.env.test', override: true });

import { assertSafeTestEnv } from './env-guard';

// Synchronous environment guards
assertSafeTestEnv(process.env);

console.log('[Setup] Environment verified: safe for integration tests');





