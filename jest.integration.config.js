module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.int-spec\\.ts$',
  maxWorkers: 1,
  setupFiles: ['<rootDir>/../test-integration/setup.ts'],
  moduleNameMapper: {
    '^(\\.\\.?(?:/(?!node_modules).*)*)\\.js$': '$1',
  },
  testRunner: 'jest-circus/runner',
  // Disable ESM for Prisma compatibility
  transform: {},
  extensionsToTreatAsEsm: [],
  // Enable experimental VM modules for Prisma WASM
  // vmModules: true,
};
