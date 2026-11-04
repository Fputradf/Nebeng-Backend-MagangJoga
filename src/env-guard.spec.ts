import { assertSafeTestEnv, TestEnv } from '../test-integration/env-guard';

describe('V2 - Environment Guard Tests', () => {
  describe('assertSafeTestEnv', () => {
    it('should throw when DB_NAME is not nebeng_test', () => {
      const env: TestEnv = {
        DB_HOST: 'localhost',
        DB_NAME: 'nebeng',
        DATABASE_URL: 'mariadb://root@localhost:3306/nebeng',
      };

      expect(() => assertSafeTestEnv(env)).toThrow(
        'DB_NAME must be exactly "nebeng_test"',
      );
    });

    it('should throw when DATABASE_URL points to wrong database', () => {
      const env: TestEnv = {
        DB_HOST: 'localhost',
        DB_NAME: 'nebeng_test',
        DATABASE_URL: 'mariadb://root@localhost:3306/nebeng',
      };

      expect(() => assertSafeTestEnv(env)).toThrow(
        'DATABASE_URL must point to database "nebeng_test"',
      );
    });

    it('should throw when DB_HOST is not localhost', () => {
      const env: TestEnv = {
        DB_HOST: 'production.db.com',
        DB_NAME: 'nebeng_test',
        DATABASE_URL: 'mariadb://root@localhost:3306/nebeng_test',
      };

      expect(() => assertSafeTestEnv(env)).toThrow(
        'DB_HOST must be "localhost" or "127.0.0.1"',
      );
    });

    it('should throw when DATABASE_URL points to database with name similar to nebeng_test_x', () => {
      const env: TestEnv = {
        DB_HOST: 'localhost',
        DB_NAME: 'nebeng_test',
        DATABASE_URL: 'mariadb://root@localhost:3306/nebeng_test_x',
      };

      expect(() => assertSafeTestEnv(env)).toThrow(
        'DATABASE_URL must point to database "nebeng_test"',
      );
    });

    it('should pass with correct test environment', () => {
      const env: TestEnv = {
        DB_HOST: 'localhost',
        DB_NAME: 'nebeng_test',
        DATABASE_URL: 'mariadb://root@localhost:3306/nebeng_test',
      };

      expect(() => assertSafeTestEnv(env)).not.toThrow();
    });

    it('should pass with 127.0.0.1 as DB_HOST', () => {
      const env: TestEnv = {
        DB_HOST: '127.0.0.1',
        DB_NAME: 'nebeng_test',
        DATABASE_URL: 'mariadb://root@127.0.0.1:3306/nebeng_test',
      };

      expect(() => assertSafeTestEnv(env)).not.toThrow();
    });
  });
});
