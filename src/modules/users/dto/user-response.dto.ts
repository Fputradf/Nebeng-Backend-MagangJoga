import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Role,
  UserStatus,
  VerificationStatus,
} from '../../../generated/prisma/enums';

export class UserResponseDto {
  @ApiProperty({ example: '1029103840' })
  id!: string;

  @ApiPropertyOptional({ example: '1' })
  regionId?: string | null;

  @ApiPropertyOptional({ example: 'Solo Raya' })
  regionName?: string | null;

  @ApiPropertyOptional({ example: 'SLO' })
  regionCode?: string | null;

  @ApiPropertyOptional()
  region?: {
    id: string;
    name: string;
    code: string;
  } | null;

  @ApiProperty({ example: 'Jhons' })
  name!: string;

  @ApiProperty({ example: 'jhon@gmail.com' })
  email!: string;

  @ApiProperty({ example: '1029391032211' })
  phone!: string;

  @ApiPropertyOptional({ example: '3374123456789001' })
  nik?: string | null;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ enum: VerificationStatus })
  statusVerification!: VerificationStatus;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  avatar?: string | null;

  @ApiProperty({ example: 0 })
  rewardPoints!: number;

  @ApiPropertyOptional({ example: 'BCA' })
  bankName?: string | null;

  @ApiPropertyOptional({ example: '1234567890' })
  bankAccountNumber?: string | null;

  @ApiPropertyOptional({ example: 'Budi Santoso' })
  bankAccountHolder?: string | null;

  @ApiProperty()
  hasPin!: boolean;

  @ApiPropertyOptional({ example: '10' })
  assignedPickupPointId?: string | null;

  @ApiPropertyOptional({ example: 'Pos Malioboro' })
  assignedPickupPointName?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  rating?: number | null;

  @ApiProperty()
  totalReviews?: number;

  @ApiProperty()
  updatedAt!: Date;
}
