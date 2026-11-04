import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRepository } from './repositories/user.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserMapper } from './mappers/user.mapper';
import { Role, RewardType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const cleanEmail = createUserDto.email.toLocaleLowerCase().trim();
    const cleanPhone = createUserDto.phone.toLocaleLowerCase().trim();
    const cleanKtp = (createUserDto.ktpNumber || createUserDto.nik)?.trim();

    const exsistingEmail = await this.userRepository.findByEmail(cleanEmail);
    if (exsistingEmail) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const exsistingPhone = await this.userRepository.findByPhone(cleanPhone);
    if (exsistingPhone) {
      throw new ConflictException('Nomor telepon sudah terdaftar');
    }

    if (cleanKtp) {
      const existingKtp = await this.userRepository.findProfileByKtpNumber(cleanKtp);
      if (existingKtp) {
        throw new ConflictException('Nomor NIK / KTP sudah terdaftar oleh pengguna lain.');
      }
    }

    if (createUserDto.role === Role.regional && !createUserDto.regionId) {
      throw new BadRequestException('regionId wajib diisi untuk role regional');
    }

    if (createUserDto.regionId) {
      const region = await this.userRepository.findRegionById(
        createUserDto.regionId,
      );
      if (!region) {
        throw new NotFoundException(
          `Region dengan ID ${createUserDto.regionId} tidak ditemukan`,
        );
      }
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const internalRoles: Role[] = [Role.admin, Role.regional, Role.operator];
    const statusVerification = internalRoles.includes(createUserDto.role)
      ? 'approved'
      : 'unverified';

    // Pengguna baru (Customer/Mitra) otomatis mendapatkan bonus 100 poin loyalty awal
    const isInternalRole = internalRoles.includes(createUserDto.role);
    const initialRewardPoints = isInternalRole ? 0 : 100;

    const newUser = await this.userRepository.create({
      name: createUserDto.name,
      email: cleanEmail,
      phone: cleanPhone,
      password: hashedPassword,
      role: createUserDto.role,
      status: createUserDto.status,
      statusVerification,
      rewardPoints: initialRewardPoints,
      region: createUserDto.regionId
        ? { connect: { id: BigInt(createUserDto.regionId) } }
        : undefined,
      rewardTransactions:
        initialRewardPoints > 0
          ? {
              create: {
                points: initialRewardPoints,
                type: RewardType.earn,
                description:
                  'Bonus Poin Selamat Datang Pengguna Baru (+100 Poin Loyalty)',
              },
            }
          : undefined,
    });

    if (cleanKtp) {
      await this.userRepository.upsertProfile(newUser.id.toString(), {
        ktpNumber: cleanKtp,
      });
    }

    return UserMapper.toResponse(newUser);
  }

  async getUserStats() {
    return this.userRepository.countUsersByStatus();
  }

  async findAll(
    page: number = 1,
    limit: number = 15,
    search?: string,
    status?: string,
    role?: string,
    regionId?: string,
  ): Promise<{ data: UserResponseDto[]; meta: any }> {
    const { users, total } = await this.userRepository.findAll(
      page,
      limit,
      search,
      status,
      role,
      regionId,
    );
    return {
      data: UserMapper.toResponseList(users),
      meta: {
        totalData: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit) || 1,
        limit,
      },
    };
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User dengan ID ${id} tidak ditemukan`);
    }
    return UserMapper.toResponse(user);
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    actingUser?: any,
  ): Promise<UserResponseDto> {
    const targetUser = await this.userRepository.findById(id);
    if (!targetUser) {
      throw new NotFoundException(`User dengan id ${id} tidak ditemukan`);
    }

    if (actingUser?.role === Role.regional || actingUser?.role === 'regional') {
      if (
        !targetUser.regionId ||
        targetUser.regionId.toString() !== actingUser.regionId?.toString()
      ) {
        throw new ForbiddenException(
          'Anda hanya berhak memperbarui pengguna di wilayah Anda sendiri.',
        );
      }
    }

    if (updateUserDto.email) {
      const cleanEmail = updateUserDto.email.toLocaleLowerCase().trim();
      const exsistingEmail = await this.userRepository.findByEmail(cleanEmail);
      if (exsistingEmail && exsistingEmail.id.toString() !== id) {
        throw new ConflictException('Email sudah digunakan oleh pengguna lain');
      }
    }

    if (updateUserDto.phone) {
      const cleanPhone = updateUserDto.phone.trim();
      const exsistingPhone = await this.userRepository.findByPhone(cleanPhone);
      if (exsistingPhone && exsistingPhone.id.toString() !== id) {
        throw new ConflictException(
          'Nomor telepon sudah digunakan oleh pengguna lain',
        );
      }
    }

    const resultingRole = updateUserDto.role ?? targetUser.role;
    const resultingRegionId =
      updateUserDto.regionId !== undefined
        ? updateUserDto.regionId
        : targetUser.regionId;

    if (resultingRole === Role.regional && !resultingRegionId) {
      throw new BadRequestException('regionId wajib diisi untuk role regional');
    }

    if (updateUserDto.regionId) {
      const region = await this.userRepository.findRegionById(
        updateUserDto.regionId,
      );
      if (!region) {
        throw new NotFoundException(
          `Region dengan ID ${updateUserDto.regionId} tidak ditemukan`,
        );
      }
    }

    let hashedPassword: string | undefined = undefined;
    if (updateUserDto.password) {
      hashedPassword = await bcrypt.hash(updateUserDto.password, 10);
    }

    const updateUser = await this.userRepository.update(id, {
      name: updateUserDto.name?.trim(),
      email: updateUserDto.email?.toLocaleLowerCase().trim(),
      phone: updateUserDto.phone?.trim(),
      password: hashedPassword,
      role: updateUserDto.role,
      status: updateUserDto.status,
      avatar: updateUserDto.avatar,
      region: updateUserDto.regionId
        ? { connect: { id: BigInt(updateUserDto.regionId) } }
        : undefined,
    });

    return UserMapper.toResponse(updateUser);
  }

  async updateProfileDetail(
    userId: string,
    dto: UpdateUserProfileDto,
  ): Promise<UserResponseDto> {
    const currentUser = await this.userRepository.findById(userId);
    if (!currentUser) {
      throw new NotFoundException(`User dengan ID ${userId} tidak ditemukan`);
    }

    const cleanKtpNumber = dto.ktpNumber?.trim();
    if (cleanKtpNumber) {
      const existingProfile =
        await this.userRepository.findProfileByKtpNumber(cleanKtpNumber);
      if (
        existingProfile &&
        existingProfile.userId.toString() !== userId
      ) {
        throw new ConflictException(
          'Nomor NIK / KTP sudah terdaftar oleh pengguna lain.',
        );
      }
    }

    if (dto.bankName) {
      const cleanBank = dto.bankName.trim();
      const totalActiveBanks = await this.prisma.disbursementBank.count({
        where: { isActive: true },
      });
      if (totalActiveBanks > 0) {
        const activeBank = await this.prisma.disbursementBank.findFirst({
          where: {
            isActive: true,
            OR: [
              { bankCode: cleanBank.toUpperCase() },
              { bankName: { contains: cleanBank } },
            ],
          },
        });
        if (!activeBank) {
          throw new BadRequestException(
            `Bank "${cleanBank}" saat ini tidak didukung atau dinonaktifkan oleh Administrator. Silakan pilih dari daftar bank pencairan yang tersedia.`,
          );
        }
      }
    }

    const profilePayload = {
      ktpNumber: cleanKtpNumber,
      fullNameKtp: dto.fullNameKtp?.trim(),
      addressKtp: dto.addressKtp?.trim(),
      faceImageUrl: dto.faceImageUrl?.trim(),
      bankName: dto.bankName?.trim(),
      bankAccountNumber: dto.bankAccountNumber?.trim(),
      bankAccountHolder: dto.bankAccountHolder?.trim(),
    };

    await this.userRepository.upsertProfile(userId, profilePayload);

    const updatedUser = await this.userRepository.findById(userId);
    return UserMapper.toResponse(updatedUser);
  }

  async setPin(userId: string, pin: string): Promise<{ message: string }> {
    await this.findOne(userId);
    const hashedPin = await bcrypt.hash(pin, 10);
    await this.userRepository.updatePin(userId, hashedPin);
    return { message: 'PIN keamanan berhasil diperbarui' };
  }

  async verifyPin(userId: string, pin: string): Promise<{ valid: boolean }> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.pinHash) {
      throw new NotFoundException('PIN belum diatur untuk akun ini');
    }

    const isValid = await bcrypt.compare(pin, user.pinHash);
    if (!isValid) {
      throw new BadRequestException('PIN yang dimasukkan salah');
    }

    return { valid: true };
  }

  async updateStatus(
    id: string,
    updateUserStatusDto: UpdateUserStatusDto,
    actingUser?: any,
  ): Promise<UserResponseDto> {
    const targetUser = await this.findOne(id);

    if (actingUser?.role === Role.regional || actingUser?.role === 'regional') {
      if (
        !targetUser.regionId ||
        targetUser.regionId.toString() !== actingUser.regionId?.toString()
      ) {
        throw new ForbiddenException(
          'Anda hanya berhak memperbarui pengguna di wilayah Anda sendiri.',
        );
      }
    }

    const updatedUser = await this.userRepository.update(id, {
      status: updateUserStatusDto.status,
    });
    return UserMapper.toResponse(updatedUser);
  }

  async remove(id: string): Promise<UserResponseDto> {
    await this.findOne(id);

    const anonymousId = `deleted_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const anonymizedUser = await this.userRepository.anonymize(id, anonymousId);

    return UserMapper.toResponse(anonymizedUser);
  }

  async forceRemoveByAdmin(
    id: string,
  ): Promise<UserResponseDto | { message: string }> {
    await this.findOne(id);

    const { ordersCount, tripsCount, walletTransactionsCount } =
      await this.userRepository.countUserRelations(id);

    const hasFinancialHistory =
      ordersCount > 0 || tripsCount > 0 || walletTransactionsCount > 0;

    if (hasFinancialHistory) {
      const anonymizedUser = await this.remove(id);
      return anonymizedUser;
    }

    const deletedUser = await this.userRepository.delete(id);
    return UserMapper.toResponse(deletedUser);
  }
}
