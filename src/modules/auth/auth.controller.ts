import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserResponseDto } from '../users/dto/user-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Membuat akun pengguna baru (Public: Customer / Mitra)',
  })
  @ApiResponse({
    status: 201,
    description: 'Register berhasil',
    type: UserResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Data inputan tidak valid atau Email/Nomor Telepon sudah terdaftar',
  })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Masuk ke aplikasi' })
  @ApiResponse({
    status: 200,
    description: 'Login berhasil, mengembalikan token',
  })
  @ApiUnauthorizedResponse({
    description: 'Email/Password salah atau akun ditangguhkan',
  })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mendapatkan data pengguna yang sedang login' })
  @ApiResponse({
    status: 200,
    description: 'Data pengguna ditemukan',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Token tidak valid atau belum dikirimkan',
  })
  getProfile(@Request() req: any) {
    const userId = req.user.id || req.user.sub;
    return this.authService.getProfile(userId);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mengubah kata sandi akun sendiri' })
  @ApiResponse({ status: 200, description: 'Kata sandi berhasil diubah' })
  @ApiUnauthorizedResponse({
    description: 'Kata sandi lama salah atau token tidak valid',
  })
  changePassword(
    @Request() req: any,
    @Body() dto: { currentPassword: string; newPassword: string },
  ) {
    const userId = req.user.id || req.user.sub;
    return this.authService.changePassword(userId, dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Memperbarui Access Token menggunakan Refresh Token',
  })
  @ApiResponse({
    status: 200,
    description: 'Access Token baru berhasil diterbitkan',
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token tidak valid atau kadaluwarsa',
  })
  refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Keluar dari aplikasi (Menghapus Refresh Token)' })
  @ApiResponse({ status: 200, description: 'Logout berhasil' })
  @ApiUnauthorizedResponse({ description: 'Token tidak valid' })
  logout(@Request() req: any) {
    return this.authService.logout(req.user.id || req.user.sub);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Meminta kode OTP reset password via email' })
  @ApiResponse({
    status: 200,
    description:
      'Kode OTP dikirim ke email (jika terdaftar). Response selalu generic.',
  })
  @ApiBadRequestResponse({ description: 'Data inputan tidak valid' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    const identifier = dto.identifier || dto.email;
    if (!identifier) {
      throw new BadRequestException('Email atau identifier wajib diisi');
    }
    return this.authService.forgotPassword(identifier);
  }

  @Post('verify-otp')
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifikasi kode OTP reset password' })
  @ApiResponse({
    status: 200,
    description: 'OTP valid, lanjut ke pembuatan password baru',
  })
  @ApiUnauthorizedResponse({
    description: 'OTP tidak valid, sudah digunakan, atau sudah kedaluwarsa',
  })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.email, dto.otp);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mengubah password menggunakan kode OTP (setelah verifikasi OTP)',
  })
  @ApiResponse({ status: 200, description: 'Password berhasil diubah' })
  @ApiUnauthorizedResponse({
    description: 'Token tidak valid, hilang, atau sudah kedaluwarsa',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
