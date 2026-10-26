import { SanctionService } from '../admin/sanction.service';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Request,
  Param,
  Put,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { SetPinDto } from './dto/set-pin.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';
import { UpdateUserMeDto } from './dto/update-user-me.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';
import { diskStorage } from 'multer';
import { GetUser } from '../../common/decorators/get-user.decorators';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')

export class UserController {
  constructor(
    private readonly userService: UsersService,
    private readonly sanctionService: SanctionService,
  ) {}

  @Patch('me')
  @ApiOperation({ summary: 'Memperbarui profil dasar akun sendiri' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  updateMyProfile(
    @Request() req: any,
    @Body() updateUserMeDto: UpdateUserMeDto,
  ): Promise<UserResponseDto> {
    const userId = req.user.id || req.user.sub;
    return this.userService.update(String(userId), updateUserMeDto);
  }

  @Patch('me/profile')
  @ApiOperation({
    summary:
      'Memperbarui rincian profil detail pengguna (KTP, Bank, Alamat KTP)',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  updateMyProfileDetail(
    @Request() req: any,
    @Body() dto: UpdateUserProfileDto,
  ): Promise<UserResponseDto> {
    const userId = req.user.id || req.user.sub;
    return this.userService.updateProfileDetail(String(userId), dto);
  }

  @Put('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Memperbarui profil dasar akun sendiri (PUT)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  updateMyProfilePut(
    @Request() req: any,
    @Body() updateUserMeDto: UpdateUserMeDto,
  ): Promise<UserResponseDto> {
    const userId = req.user.id || req.user.sub;
    return this.userService.update(String(userId), updateUserMeDto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Menghapus akun sendiri (Soft Delete & Anonimisasi)',
  })
  @ApiResponse({ status: 200, description: 'Akun berhasil dianonimkan' })
  removeMyAccount(@Request() req: any): Promise<UserResponseDto> {
    const userId = req.user.id || req.user.sub;
    return this.userService.remove(String(userId));
  }

  @Get('stats')
  @Roles(Role.admin, Role.regional, Role.operator)
  @ApiOperation({ summary: 'Mendapatkan ringkasan statistik jumlah pengguna' })
  async getUserStats() {
    return this.userService.getUserStats();
  }

  @Post('me/pin')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Membuat atau memperbarui PIN keamanan (6 digit)' })
  setPin(@Request() req: any, @Body() setPinDto: SetPinDto) {
    const userId = req.user.id || req.user.sub;
    return this.userService.setPin(String(userId), setPinDto.pin);
  }

  @Post('me/pin/verify')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Memverifikasi PIN keamanan untuk transaksi' })
  verifyPin(@Request() req: any, @Body() verifyPinDto: VerifyPinDto) {
    const userId = req.user.id || req.user.sub;
    return this.userService.verifyPin(String(userId), verifyPinDto.pin);
  }

  @Post()
  @Roles(Role.admin, Role.regional)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Membuat pengguna baru' })
  @ApiResponse({
    status: 201,
    description: 'Pengguna berhasil dibuat',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Payload tidak valid' })
  @ApiResponse({
    status: 409,
    description: 'Email atau Nomor HP sudah terdaftar',
  })
  async create(
    @GetUser() currentUser: any,
    @Body() createUserDto: CreateUserDto,
  ): Promise<UserResponseDto> {
    if (
      currentUser?.role === Role.regional ||
      currentUser?.role === 'regional'
    ) {
      if (currentUser.regionId) {
        createUserDto.regionId = currentUser.regionId.toString();
      }
    }
    return this.userService.create(createUserDto);
  }

  @Get()
  @Roles(Role.admin, Role.regional, Role.operator)
  @ApiOperation({
    summary:
      'Mendapatkan semua daftar pengguna (dengan Paginasi, Filter & Role)',
  })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('regionId') regionId?: string,
    @GetUser() currentUser?: any,
  ) {
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 15;

    const targetRegionId =
      currentUser?.role === Role.regional || currentUser?.role === 'regional'
        ? currentUser.regionId?.toString()
        : regionId;

    return this.userService.findAll(
      parsedPage,
      parsedLimit,
      search,
      status,
      role,
      targetRegionId,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mendapatkan profil akun yang sedang login' })
  async getMyProfile(@Request() req: any): Promise<UserResponseDto> {
    const userId = req.user.id || req.user.sub;
    return this.userService.findOne(String(userId));
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
          return callback(
            new BadRequestException(
              'Hanya file gambar berformat JPG, JPEG, atau PNG yang diizinkan!',
            ),
            false,
          );
        }
        callback(null, true);
      },
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, `avatar-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  @ApiOperation({ summary: 'Mengunggah dan memperbarui avatar pengguna' })
  async uploadAvatar(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UserResponseDto> {
    if (!file) {
      throw new BadRequestException('File gambar tidak ditemukan');
    }

    const userId = req.user.id || req.user.sub;
    const filePath = `/uploads/avatars/${file.filename}`;

    return this.userService.update(String(userId), { avatar: filePath });
  }

  @Get(':id')
  @Roles(Role.admin, Role.regional, Role.operator)
  @ApiOperation({ summary: 'Mendapatkan detail pengguna berdasarkan ID' })
  @ApiResponse({
    status: 200,
    description: 'Detail pengguna ditemukan',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User tidak ditemukan' })
  findOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.regional)
  @ApiOperation({ summary: 'Memperbarui data pengguna berdasarkan ID' })
  @ApiResponse({
    status: 200,
    description: 'Data pengguna berhasil diperbarui',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User tidak ditemukan' })
  update(
    @Param('id') id: string,
    @GetUser() currentUser: any,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.userService.update(id, updateUserDto, currentUser);
  }

  @Patch(':id/status')
  @Roles(Role.admin, Role.regional)
  @ApiOperation({
    summary: 'Mengubah status user (Active/Suspended/Blocked/Inactive)',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  updateStatus(
    @Param('id') id: string,
    @GetUser() currentUser: any,
    @Body() updateUserStatusDto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.userService.updateStatus(id, updateUserStatusDto, currentUser);
  }

  @Delete(':id')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Menghapus pengguna berdasarkan ID (Hard/Soft Guard)',
  })
  @ApiResponse({
    status: 200,
    description: 'Pengguna berhasil dihapus atau dianonimkan',
  })
  @ApiResponse({ status: 404, description: 'User tidak ditemukan' })
  remove(@Param('id') id: string) {
    return this.userService.forceRemoveByAdmin(id);
  }

  // ------------------------------------------------------
  // FASE 10: RIWAYAT SANKSI & BANDING MITRA (PORTAL MITRA)
  // ------------------------------------------------------
  @Get('me/sanctions')
  @Roles(Role.mitra)
  @ApiOperation({ summary: 'Melihat riwayat sanksi & sisa reputasi mitra sendiri' })
  @ApiResponse({ status: 200, description: 'Riwayat sanksi mitra ditemukan' })
  getMySanctions(@GetUser('id') userId: string) {
    return this.sanctionService.getMitraSanctions(String(userId));
  }

  @Post('me/sanctions/:id/appeal')
  @Roles(Role.mitra)
  @ApiOperation({ summary: 'Mengajukan banding terhadap sanksi pembatalan trip' })
  @ApiResponse({ status: 201, description: 'Banding berhasil diajukan' })
  appealSanction(
    @GetUser('id') userId: string,
    @Param('id') sanctionId: string,
    @Body() dto: { reason: string; evidenceUrl?: string },
  ) {
    return this.sanctionService.submitAppeal(String(userId), sanctionId, dto);
  }
}