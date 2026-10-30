import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { assertConnectedToTestDb } from '../test-integration/env-guard';
import { cleanTestDatabase } from '../test-integration/test-helper';

describe('V2 - PrismaService with Connection Guard', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
      ],
      providers: [PrismaService],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);

    // Verify connection to test database using the same PrismaService instance
    await assertConnectedToTestDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should connect to database and run SELECT DATABASE()', async () => {
    const result = await prisma.$queryRaw`SELECT DATABASE() AS db`;
    console.log('SELECT DATABASE() result:', result);
    expect(result).toBeDefined();
  });

  it('should count users from PrismaService', async () => {
    const count = await prisma.user.count();
    console.log('User count:', count);
    expect(typeof count).toBe('number');
  });

  it('should clean database using same PrismaService instance', async () => {
    // Verify connection before cleaning
    await assertConnectedToTestDb(prisma);

    // Clean database
    await cleanTestDatabase(prisma);

    // Verify connection after cleaning
    await assertConnectedToTestDb(prisma);

    const count = await prisma.user.count();
    console.log('User count after clean:', count);
    expect(count).toBe(0);
  });
});
