import { UserResponseDto } from '../dto/user-response.dto';

export class UserMapper {
  static toResponse(user: any): UserResponseDto {
    if (!user) return null as any;

    let calculatedRating: number | null = null;
    let reviewCount = 0;

    const assignedPos =
      user.assignedPickupPoints && user.assignedPickupPoints.length > 0
        ? user.assignedPickupPoints[0].id.toString()
        : null;

    const assignedPosName =
      user.assignedPickupPoints && user.assignedPickupPoints.length > 0
        ? user.assignedPickupPoints[0].name
        : null;

    if (
      user.reviewsReceived &&
      Array.isArray(user.reviewsReceived) &&
      user.reviewsReceived.length > 0
    ) {
      reviewCount = user.reviewsReceived.length;
      const sum = user.reviewsReceived.reduce(
        (acc: number, curr: any) => acc + (Number(curr?.rating) || 0),
        0,
      );
      calculatedRating =
        reviewCount > 0 ? Number((sum / reviewCount).toFixed(1)) : null;
    }

    return {
      id: user.id ? user.id.toString() : '',
      regionId: user.regionId ? user.regionId.toString() : null,
      name: user.name ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
      role: user.role,
      status: user.status,
      assignedPickupPointId: assignedPos,
      assignedPickupPointName: assignedPosName,
      statusVerification: user.statusVerification,
      nik: user.profile?.ktpNumber || user.nik || null,
      avatar: user.avatar || null,
      rewardPoints: Number(user.rewardPoints || 0),
      rating: calculatedRating,
      totalReviews: reviewCount,
      bankName: user.profile?.bankName || null,
      bankAccountNumber: user.profile?.bankAccountNumber || null,
      bankAccountHolder: user.profile?.bankAccountHolder || null,
      hasPin: Boolean(user.pinHash),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  static toResponseList(users: any[]): UserResponseDto[] {
    if (!Array.isArray(users)) return [];
    return users.map((user) => this.toResponse(user));
  }
}
