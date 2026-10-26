describe('U1 - Guard Test', () => {
  it('should verify database connection is to nebeng_test', async () => {
    // Use raw mariadb to verify connection to avoid Prisma WASM issues
    const mariadb = require('mariadb');
    const conn = await mariadb.createConnection({
      host: '127.0.0.1',
      port: parseInt(process.env.DB_PORT, 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectTimeout: 10000,
    });

    try {
      const rows = await conn.query('SELECT DATABASE() as db');
      const actualDb = rows[0]?.db;

      console.log('SELECT DATABASE() result:', actualDb);

      expect(actualDb).toBe('nebeng_test');
    } finally {
      await conn.end();
    }
  });
});
