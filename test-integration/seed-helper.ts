import { PrismaClient, Role, VehicleType, TripStatus, ServiceType, OrderType, OrderStatus, EscrowStatus, TransactionType } from '../src/generated/prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Minimal seed for integration tests.
 * Creates: customer, mitra, region, city, pickup points, vehicle, trip, order with escrow, wallets.
 */
export async function seedMinimalTestData(prisma: PrismaClient) {
  // 1. Create Users
  const hashedPassword = await bcrypt.hash('Test@12345', 10);
  const timestamp = Date.now();

  const customer = await prisma.user.create({
    data: {
      name: 'Test Customer',
      email: `customer${timestamp}@test.com`,
      password: hashedPassword,
      role: Role.customer,
      phone: `0812345678${timestamp.toString().slice(-4)}`,
    },
  });

  const mitra = await prisma.user.create({
    data: {
      name: 'Test Mitra',
      email: `mitra${timestamp}@test.com`,
      password: hashedPassword,
      role: Role.mitra,
      phone: `0812345678${(timestamp + 1).toString().slice(-4)}`,
    },
  });

  // Always create a new admin for isolation
  const admin = await prisma.user.create({
    data: {
      name: 'Test Admin',
      email: `admin${timestamp}@test.com`,
      password: hashedPassword,
      role: Role.admin,
      phone: `0812345678${(timestamp + 2).toString().slice(-4)}`,
    },
  });

  // Always override SYSTEM_ADMIN_USER_ID in test environment to ensure service uses this admin
  process.env.SYSTEM_ADMIN_USER_ID = admin.id.toString();

  // Ensure admin has a wallet with full balance (reset if exists)
  let adminWallet = await prisma.wallet.findUnique({
    where: { userId: admin.id },
  });

  if (adminWallet) {
    // Reset balance to 1000000
    adminWallet = await prisma.wallet.update({
      where: { id: adminWallet.id },
      data: {
        balance: 1000000,
        heldEscrowBalance: 0,
      },
    });
  } else {
    adminWallet = await prisma.wallet.create({
      data: {
        userId: admin.id,
        balance: 1000000,
        heldEscrowBalance: 0,
      },
    });
  }

  // 2. Create Region
  const region = await prisma.region.create({
    data: {
      code: `JKT-${timestamp}`,
      name: 'Jakarta',
      pricePerKm: 3000,
      latitude: -6.2088,
      longitude: 106.8456,
    },
  });

  // 3. Create City
  const city = await prisma.city.create({
    data: {
      name: 'Jakarta',
      province: 'DKI Jakarta',
    },
  });

  // 4. Create Pickup Points
  const originPoint = await prisma.pickupPoint.create({
    data: {
      name: 'Stasiun Gambir',
      address: 'Jl. Medan Merdeka Timur No.1',
      latitude: -6.1865,
      longitude: 106.8456,
      cityId: city.id,
      regionId: region.id,
      qrCodePos: `POS-TEST-${timestamp}-001`,
    },
  });

  const destPoint = await prisma.pickupPoint.create({
    data: {
      name: 'Stasiun Hall Bandung',
      address: 'Jl. Stasiun Hall',
      latitude: -6.9155,
      longitude: 107.6098,
      cityId: city.id,
      regionId: region.id,
      qrCodePos: `POS-TEST-${timestamp}-002`,
    },
  });

  // 5. Create Vehicle
  const vehicle = await prisma.vehicle.create({
    data: {
      plateNumber: `B ${timestamp} CD`,
      type: VehicleType.mobil,
      model: 'Avanza',
      color: 'Silver',
      capacitySeats: 4,
      maxWeightCapacityKg: 200,
      userId: mitra.id,
    },
  });

  // 6. Create Trip (scheduled, 5 days from now to ensure it's clearly in the future)
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);
  futureDate.setHours(0, 0, 0, 0); // Midnight 5 days from now

  // Set departureTime to 10:00 AM on the same day as departureDate
  const departureTime = new Date(futureDate);
  departureTime.setHours(10, 0, 0, 0);

  const trip = await prisma.trip.create({
    data: {
      qrCodeTrip: `TRIP-TEST-${timestamp}`,
      departureDate: futureDate,
      departureTime,
      originPointId: originPoint.id,
      destinationPointId: destPoint.id,
      vehicleId: vehicle.id,
      mitraId: mitra.id,
      vehicleType: VehicleType.mobil,
      status: TripStatus.scheduled,
      seatTotal: 4,
      seatAvailable: 4,
      maxWeightCapacityKg: 200,
      remainingWeightCapacityKg: 200,
      price: 158000,
      serviceType: ServiceType.mobil,
    },
  });

  // 7. Create Wallets
  const customerWallet = await prisma.wallet.create({
    data: {
      userId: customer.id,
      balance: 200000,
      heldEscrowBalance: 0,
    },
  });

  const mitraWallet = await prisma.wallet.create({
    data: {
      userId: mitra.id,
      balance: 500000,
      heldEscrowBalance: 0,
    },
  });

  // 8. Create Order (paid, with escrow)
  const orderTotalPrice = 158000;
  const adminFeePercentage = 10; // 10% admin fee
  const adminFeeAmount = Math.round((orderTotalPrice * adminFeePercentage) / 100); // 15800
  const netMitraAmount = orderTotalPrice - adminFeeAmount; // 142200
  const escrowAmount = netMitraAmount; // Commission held in escrow

  const order = await prisma.order.create({
    data: {
      qrCodeTicket: `TKT-TEST-${timestamp}`,
      type: OrderType.passenger,
      seatsBooked: 1,
      totalPrice: orderTotalPrice,
      adminFeePercentage,
      status: OrderStatus.paid,
      escrowStatus: EscrowStatus.held,
      customerId: customer.id,
      tripId: trip.id,
    },
  });

  // 9. Create WalletTransaction for escrow_hold
  await prisma.walletTransaction.create({
    data: {
      type: TransactionType.escrow_hold,
      amount: escrowAmount,
      walletId: mitraWallet.id,
      orderId: order.id,
      description: 'Escrow hold for order',
    },
  });

  // 10. Update mitra wallet heldEscrowBalance
  await prisma.wallet.update({
    where: { id: mitraWallet.id },
    data: { heldEscrowBalance: escrowAmount },
  });

  return {
    customer,
    mitra,
    admin,
    region,
    city,
    originPoint,
    destPoint,
    vehicle,
    trip,
    order,
    customerWallet,
    mitraWallet,
    adminWallet,
    escrowAmount,
    orderTotalPrice,
    adminFeeAmount,
    netMitraAmount,
  };
}
