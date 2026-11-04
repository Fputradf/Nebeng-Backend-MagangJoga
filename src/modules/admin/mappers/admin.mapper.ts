export class AdminMapper {
  static toGlobalDashboardResponse(data: {
    totalRevenue: number;
    platformCommission: number;
    activeTripsCount: number;
    totalTransactionsCount: number;
    regionalSummary: any[];
  }) {
    return {
      overview: {
        totalRevenue: Number(data.totalRevenue.toFixed(2)),
        platformCommision: Number(data.platformCommission.toFixed(2)),
        activeTripsCount: data.activeTripsCount,
        totalTransactionCount: data.totalTransactionsCount,
      },
      regionalSummary: data.regionalSummary.map((req) => ({
        regionId: req.id.toString(),
        regionName: req.name,
        regionCode: req.code,
        pickupPointsCount: req._count?.pickupPoints || 0,
        activeUserCount: req._count?.users || 0,
        revenue: Number(req.revenue || 0),
        totalRevenue: Number(req.totalRevenue || req.revenue || 0),
      })),
    };
  }

  static toRegionalDashboardResponse(data: {
    regionName: string;
    activePosCount: number;
    departedTripsCount: number;
    arrivedTripsCount: number;
    pendingVerificationsCount: number;
  }) {
    return {
      regionName: data.regionName,
      metrics: {
        activePosCount: data.activePosCount,
        departedTripsCount: data.departedTripsCount,
        arrivedTripsCount: data.arrivedTripsCount,
        pendingVerificationsCount: data.pendingVerificationsCount,
      },
    };
  }

  static toEscrowLedgerResponse(data: {
    totalHeldEscrow: number;
    totalReleasedEscrow: number;
    pagination: any;
    recentTransactions: any[];
  }) {
    return {
      summary: {
        totalHeldEscrow: Number(data.totalHeldEscrow.toFixed(2)),
        totalReleasedEscrow: Number(data.totalReleasedEscrow.toFixed(2)),
      },
      pagination: data.pagination,
      recentTransactions: data.recentTransactions.map((tx) => ({
        id: tx.id.toString(),
        walletId: tx.walletId.toString(),
        orderId: tx.orderId ? tx.orderId.toString() : null,
        amount: Number(tx.amount),
        type: tx.type,
        description: tx.description || null,
        createdAt: tx.createdAt ? tx.createdAt.toISOString() : null,
      })),
    };
  }
}
