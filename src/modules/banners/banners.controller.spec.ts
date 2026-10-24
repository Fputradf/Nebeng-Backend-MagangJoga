import { Test, TestingModule } from '@nestjs/testing';
import { BannersController } from './banners.controller';
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

describe('BannersController', () => {
  let controller: BannersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BannersController],
      providers: [
        BannersService,
        BannersRepository,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<BannersController>(BannersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
