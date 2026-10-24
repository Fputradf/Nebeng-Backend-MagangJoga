import { Test, TestingModule } from '@nestjs/testing';
import { BannersService } from './banners.service';
import { BannersRepository } from './repository/banners.repository';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrismaService = {
  banner: {
    findMany: jest.fn(() => []),
    findUnique: jest.fn(() => null),
    create: jest.fn(() => ({ id: 1 })),
    update: jest.fn(() => ({ id: 1 })),
    delete: jest.fn(() => ({ id: 1 })),
  },
};

describe('BannersService', () => {
  let service: BannersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BannersService,
        BannersRepository,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<BannersService>(BannersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
