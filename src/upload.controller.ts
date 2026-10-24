import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { RolesGuard } from './common/guards/roles.guard';
import { Roles } from './common/decorators/roles.decorator';
import { Role } from './generated/prisma/enums';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';

@ApiTags('Uploads')
@Controller('uploads')
export class UploadController {
  @Post('file')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload file biner umum (SIM, SKCK, STNK, Face)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = path.join(
            process.cwd(),
            'uploads',
            'verifications',
          );
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          cb(null, `verif-${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 }, // Max 2MB
      fileFilter: (req, file, cb) => {
        if (
          !['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(
            file.mimetype,
          )
        ) {
          return cb(
            new BadRequestException('Format file tidak didukung'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File tidak ditemukan');
    }
    return {
      filePath: `/uploads/verifications/${file.filename}`,
      fileType: file.mimetype,
    };
  }

  @Post('banners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload file gambar banner' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = path.join(process.cwd(), 'uploads', 'banners');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          cb(null, `banner-${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Format file harus gambar'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadBanner(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File tidak ditemukan');
    }
    return {
      filePath: `/uploads/banners/${file.filename}`,
      fileType: file.mimetype,
    };
  }

  @Get('verifications/:filename')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Melihat file verifikasi secara aman' })
  getVerificationFile(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const filePath = path.join(
      process.cwd(),
      'uploads',
      'verifications',
      filename,
    );
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File tidak ditemukan');
    }
    return res.sendFile(filePath);
  }
}
