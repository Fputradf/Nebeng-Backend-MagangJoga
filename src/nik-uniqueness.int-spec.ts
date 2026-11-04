import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { UsersService } from './modules/users/users.service';
import { UserRepository } from './modules/users/repositories/user.repository';
import { VerificationService } from './modules/verifications/verification.service';
import { VerificationRepository } from './modules/verifications/repositories/verification.repository';
import { NotificationHelperService } from './modules/notifications/notification-helper.service';
import { assertConnectedToTestDb } from '../test-integration/env-guard';
import { cleanTestDatabase } from '../test-integration/test-helper';
import { Role, VerificationType } from './generated/prisma/enums';
import * as bcrypt from 'bcrypt';

describe('NIK / KTP Uniqueness Integration Tests', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let usersService: UsersService;
  let verificationService: VerificationService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
      ],
      providers: [
        PrismaService,
        UsersService,
        UserRepository,
        VerificationService,
        VerificationRepository,
        {
          provide: NotificationHelperService,
          useValue: {
            notifyVerificationSubmitted: jest.fn(),
            notifyVerificationReviewed: jest.fn(),
          },
        },
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    usersService = moduleRef.get<UsersService>(UsersService);
    verificationService = moduleRef.get<VerificationService>(VerificationService);

    await assertConnectedToTestDb(prisma);
    await cleanTestDatabase(prisma);
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Harap menolak pendaftaran akun baru jika NIK sudah digunakan oleh user lain', async () => {
    const timestamp = Date.now();
    const existingNik = '3374010101010001';

    // Buat User 1 dengan NIK tersebut
    await usersService.create({
      name: 'User Pertama',
      email: `user1-${timestamp}@test.com`,
      phone: `08111111${timestamp.toString().slice(-4)}`,
      password: 'Password123!',
      role: Role.customer,
      nik: existingNik,
    });

    // Coba buat User 2 dengan NIK yang sama -> harus ditolak
    await expect(
      usersService.create({
        name: 'User Kedua Peniru',
        email: `user2-${timestamp}@test.com`,
        phone: `08222222${timestamp.toString().slice(-4)}`,
        password: 'Password123!',
        role: Role.customer,
        nik: existingNik,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('2. Harap menolak pengajuan verifikasi KTP jika NIK sudah digunakan oleh user lain', async () => {
    const timestamp = Date.now() + 10;
    const nikUserA = '3374020202020002';

    // User A berhasil mendaftar dan verifikasi NIK
    const userA = await usersService.create({
      name: 'User A Sah',
      email: `usera-${timestamp}@test.com`,
      phone: `08333333${timestamp.toString().slice(-4)}`,
      password: 'Password123!',
      role: Role.customer,
    });

    await verificationService.submitVerification(userA.id, {
      type: VerificationType.ktp,
      ktpNumber: nikUserA,
      fullNameKtp: 'User A Sah',
      files: [{ filePath: '/uploads/ktp1.jpg', fileType: 'image/jpeg' }],
    });

    // User B mencoba submit verifikasi dengan NIK milik User A -> harus ditolak
    const userB = await usersService.create({
      name: 'User B Plagiat',
      email: `userb-${timestamp}@test.com`,
      phone: `08444444${timestamp.toString().slice(-4)}`,
      password: 'Password123!',
      role: Role.customer,
    });

    await expect(
      verificationService.submitVerification(userB.id, {
        type: VerificationType.ktp,
        ktpNumber: nikUserA, // NIK sama dengan User A
        fullNameKtp: 'User B Plagiat',
        files: [{ filePath: '/uploads/ktp2.jpg', fileType: 'image/jpeg' }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('3. Harap menolak update profil jika NIK sudah digunakan oleh user lain', async () => {
    const timestamp = Date.now() + 20;
    const nikMitraA = '3374030303030003';

    // User 1 punya NIK tertentu
    const user1 = await usersService.create({
      name: 'User Pemilik NIK',
      email: `owner-${timestamp}@test.com`,
      phone: `08555555${timestamp.toString().slice(-4)}`,
      password: 'Password123!',
      role: Role.mitra,
      nik: nikMitraA,
    });

    // User 2 tanpa NIK
    const user2 = await usersService.create({
      name: 'User Lain',
      email: `other-${timestamp}@test.com`,
      phone: `08666666${timestamp.toString().slice(-4)}`,
      password: 'Password123!',
      role: Role.mitra,
    });

    // User 2 update profil memasukkan NIK milik User 1 -> harus ditolak
    await expect(
      usersService.updateProfileDetail(user2.id, {
        ktpNumber: nikMitraA,
      }),
    ).rejects.toThrow(ConflictException);

    // Namun User 1 mengupdate profilnya sendiri dengan NIK miliknya -> harus diizinkan
    const ownUpdate = await usersService.updateProfileDetail(user1.id, {
      ktpNumber: nikMitraA,
      fullNameKtp: 'Nama Update Pemilik Asli',
    });
    expect(ownUpdate.nik).toBe(nikMitraA);
  });

  it('4. Harap mengembalikan status ketersediaan NIK melalui checkNikAvailability', async () => {
    const timestamp = Date.now() + 30;
    const nikCustomer = '3374040404040004';
    const unusedNik = '3374090909090009';

    const userOwner = await usersService.create({
      name: 'User Pemilik Asli',
      email: `owner2-${timestamp}@test.com`,
      phone: `08777777${timestamp.toString().slice(-4)}`,
      password: 'Password123!',
      role: Role.customer,
      nik: nikCustomer,
    });

    const userOther = await usersService.create({
      name: 'User Lain Mencoba Cek',
      email: `other2-${timestamp}@test.com`,
      phone: `08888888${timestamp.toString().slice(-4)}`,
      password: 'Password123!',
      role: Role.customer,
    });

    // Cek NIK yang belum pernah dipakai -> available: true
    const checkFresh = await verificationService.checkNikAvailability(unusedNik, userOther.id);
    expect(checkFresh.available).toBe(true);

    // User Lain cek NIK yang sudah dipakai userOwner -> available: false
    const checkTaken = await verificationService.checkNikAvailability(nikCustomer, userOther.id);
    expect(checkTaken.available).toBe(false);
    expect(checkTaken.message).toContain('sudah terdaftar');

    // UserOwner sendiri cek NIK miliknya -> available: true
    const checkOwn = await verificationService.checkNikAvailability(nikCustomer, userOwner.id);
    expect(checkOwn.available).toBe(true);
  });
});

