export class VoucherMapper {
  static toResponse(voucher: any) {
    if (!voucher) return null;

    let reservedCount = 0;
    let usedCount = 0;

    if (voucher.redemptions && Array.isArray(voucher.redemptions)) {
      for (const r of voucher.redemptions) {
        if (r.status === 'reserved') reservedCount++;
        else if (r.status === 'used') usedCount++;
      }
    } else if (voucher._count?.redemptions !== undefined) {
      usedCount = Number(voucher._count.redemptions);
    }

    if (voucher.reservedCount !== undefined) {
      reservedCount = Number(voucher.reservedCount);
    }
    if (voucher.usedCount !== undefined) {
      usedCount = Number(voucher.usedCount);
    }

    return {
      id: voucher.id.toString(),
      code: voucher.code,
      title: voucher.title,
      description: voucher.description ?? null,
      appliesTo: voucher.appliesTo ?? null,
      discountType: voucher.discountType,
      discountValue: Number(voucher.discountValue),
      maxDiscountAmount:
        voucher.maxDiscountAmount !== null && voucher.maxDiscountAmount !== undefined
          ? Number(voucher.maxDiscountAmount)
          : null,
      minOrderAmount: Number(voucher.minOrderAmount || 0),
      usageLimit:
        voucher.usageLimit !== null && voucher.usageLimit !== undefined
          ? Number(voucher.usageLimit)
          : null,
      usagePerUserLimit: Number(voucher.usagePerUserLimit ?? 1),
      validFrom: voucher.validFrom,
      validUntil: voucher.validUntil,
      isActive: Boolean(voucher.isActive),
      reservedCount,
      usedCount,
      totalUsageCount: reservedCount + usedCount,
      createdAt: voucher.createdAt,
      updatedAt: voucher.updatedAt,
    };
  }

  static toResponseList(vouchers: any[]) {
    if (!Array.isArray(vouchers)) return [];
    return vouchers.map((v) => VoucherMapper.toResponse(v));
  }
}

