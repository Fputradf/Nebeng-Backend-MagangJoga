import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserRepository } from '../users/repositories/user.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserMapper } from '../users/mappers/user.mapper';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { Role } from '../../generated/prisma/enums';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'FATAL ERROR: JWT_SECRET belum didefinisikan di environment variables.',
      );
    }
    this.jwtSecret = secret;
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.jwtSecret,
      expiresIn: (this.configService.get<string>('JWT_EXPIRES_IN') ||
        '15m') as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.jwtSecret,
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ||
        '7d') as any,
    });

    return { accessToken, refreshToken };
  }

  async register(registerDto: RegisterDto) {
    const assignedRole = (registerDto.role as unknown as Role) || Role.customer;
    return this.usersService.create({
      ...registerDto,
      role: assignedRole,
    });
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Email atau kata sandi salah');
    }

    if (user.status === 'suspended') {
      throw new UnauthorizedException(
        'Akun Anda ditangguhkan. Hubungi administrator.',
      );
    }

    if (user.status === 'blocked') {
      throw new UnauthorizedException(
        'Akun Anda diblokir. Hubungi administrator.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email atau kata sandi salah');
    }

    const { accessToken, refreshToken } = await this.generateTokens(
      user.id.toString(),
      user.email,
      user.role,
    );

    await this.userRepository.updateRefreshToken(
      user.id.toString(),
      refreshToken,
    );

    const mappedUser = UserMapper.toResponse(user);

    return {
      accessToken,
      refreshToken,
      user: mappedUser,
    };
  }

  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Pengguna tidak ditemukan');
    }
    return UserMapper.toResponse(user);
  }

  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Pengguna tidak ditemukan');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Kata sandi lama salah');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.update(userId, { password: hashedPassword });

    return { message: 'Kata sandi berhasil diperbarui' };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(refreshTokenDto.refreshToken, {
        secret: this.jwtSecret,
      });

      const user = await this.userRepository.findById(payload.sub);
      if (!user || user.refreshToken !== refreshTokenDto.refreshToken) {
        throw new UnauthorizedException('Refresh token tidak valid');
      }

      const { accessToken, refreshToken } = await this.generateTokens(
        user.id.toString(),
        user.email,
        user.role,
      );

      await this.userRepository.updateRefreshToken(
        user.id.toString(),
        refreshToken,
      );

      return { accessToken, refreshToken };
    } catch {
      throw new UnauthorizedException(
        'Refresh token tidak valid atau kadaluwarsa',
      );
    }
  }

  async logout(userId: string) {
    await this.userRepository.updateRefreshToken(userId, null);
    return { message: 'Berhasil keluar dari aplikasi' };
  }

  async forgotPassword(identifier: string): Promise<{ message: string }> {
    const email = identifier.toLocaleLowerCase().trim();
    const user = await this.userRepository.findByEmail(email);

    // Selalu balas generic agar tidak memberitahu apakah email terdaftar
    if (!user) {
      return {
        message: 'Jika akun terdaftar, kode OTP telah dikirim ke email.',
      };
    }

    // Generate 6-digit OTP
    const otp = MailService.generateOtp();
    const expiryMinutes =
      Number(this.configService.get<string>('PASSWORD_RESET_EXPIRY_MINUTES')) ||
      30;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    // Simpan OTP ke field passwordResetToken
    await this.userRepository.updateResetToken(
      user.id.toString(),
      otp,
      expiresAt,
    );

    // Kirim OTP via email
    await this.mailService.sendResetPasswordOtp(user.email, otp, expiryMinutes);

    return {
      message: 'Jika akun terdaftar, kode OTP telah dikirim ke email.',
    };
  }

  async verifyOtp(email: string, otp: string): Promise<{ ok: boolean }> {
    const normalizedEmail = email.toLocaleLowerCase().trim();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user || user.passwordResetToken !== otp) {
      throw new UnauthorizedException(
        'Kode OTP tidak valid atau sudah digunakan.',
      );
    }

    if (
      user.passwordResetTokenExpiresAt &&
      new Date() > user.passwordResetTokenExpiresAt
    ) {
      throw new UnauthorizedException('Kode OTP sudah kedaluwarsa.');
    }

    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const normalizedEmail = dto.email.toLocaleLowerCase().trim();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user || user.passwordResetToken !== dto.otp) {
      throw new UnauthorizedException(
        'Kode OTP tidak valid atau sudah digunakan.',
      );
    }

    if (
      user.passwordResetTokenExpiresAt &&
      new Date() > user.passwordResetTokenExpiresAt
    ) {
      throw new UnauthorizedException('Kode OTP sudah kedaluwarsa.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.update(user.id.toString(), {
      password: hashedPassword,
    });
    await this.userRepository.resetToken(user.id.toString());

    return { message: 'Kata sandi berhasil diperbarui.' };
  }
}
