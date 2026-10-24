import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { RewardsRepository } from './repository/rewards.repository';
import { EarnRewardDto } from './dto/earn-reward.dto';
import { RedeemRewardDto } from './dto/redeem-reward.dto';
import { RewardMapper } from './mappers/reward.mapper';
import { Role } from '../../generated/prisma/enums';
import { NotificationHelperService } from '../notifications/notification-helper.service';

@Injectable()
export class RewardsService {
  constructor(
    private readonly rewardsRepository: RewardsRepository,
    private readonly notificationHelper: NotificationHelperService,
  ) {}

  async earnPoints(currentUser: any, dto: EarnRewardDto) {
    if (dto.points <= 0) {
      throw new BadRequestException(
        'Jumlah poin yang ditambahkan harus lebih besar dari 0.',
      );
    }

    const targetUser = await this.rewardsRepository.findUserById(dto.userId);
    if (!targetUser) {
      throw new NotFoundException('User penerima poin tidak ditemukan.');
    }

    const currentUserRole = currentUser?.role;
    const currentUserRegionId = currentUser?.regionId?.toString();

    if (currentUserRole === Role.regional || currentUserRole === 'regional') {
      const targetUserRegionId = targetUser.regionId
        ? targetUser.regionId.toString()
        : null;
      if (!currentUserRegionId || currentUserRegionId !== targetUserRegionId) {
        throw new ForbiddenException(
          'Anda hanya berhak memberikan poin kepada pengguna yang berada di wilayah Anda.',
        );
      }
    }

    const { transaction } = await this.rewardsRepository.addRewardPoints({
      userIdStr: dto.userId,
      points: dto.points,
      description:
        dto.description || 'Penambahan poin reward manual oleh admin',
    });

    await this.notificationHelper.notifyRewardEarned(
      dto.userId,
      dto.points,
      dto.description || 'Penambahan poin reward manual oleh admin',
    );

    return RewardMapper.toTransactionResponse(transaction);
  }

  async redeemPoints(currentUserId: string, dto: RedeemRewardDto) {
    if (dto.points <= 0) {
      throw new BadRequestException(
        'Jumlah poin yang ditukarkan harus lebih besar dari 0.',
      );
    }

    const user = await this.rewardsRepository.findUserById(currentUserId);

    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    if (user.rewardPoints < dto.points) {
      throw new BadRequestException(
        `Saldo poin Anda tidak mencukupi. Poin Anda saat ini: ${user.rewardPoints}`,
      );
    }

    const { transaction } = await this.rewardsRepository.deductRewardPoints({
      userIdStr: currentUserId,
      points: dto.points,
      description: dto.description || 'Penukaran poin reward',
    });

    await this.notificationHelper.notifyRewardEarned(
      currentUserId,
      dto.points,
      dto.description || 'Penukaran poin reward',
    );

    return RewardMapper.toTransactionResponse(transaction);
  }

  async getUserRewardSummary(currentUserId: string) {
    const user = await this.rewardsRepository.findUserById(currentUserId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    const history =
      await this.rewardsRepository.getRewardHistoryByUserId(currentUserId);

    return RewardMapper.toBalanceResponse(user, history);
  }
}
