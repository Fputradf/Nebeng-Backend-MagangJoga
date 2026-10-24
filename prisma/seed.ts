import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { Role, ServiceType, ParcelSize, TripStatus, OrderStatus, EscrowStatus, TransactionType, RewardType, ScanType, VerificationType, VerificationStatus, UserStatus } from '../src/generated/prisma/enums';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nebeng',
  connectionLimit: 5,
});

const prisma = new PrismaClient({ adapter });

// Helper functions
function generateQr(prefix: string): string {
  const hex = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${hex}`;
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Calculate time 1 hour from now
function getOneHourFromNow(): Date {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  return now;
}

async function main() {
  console.log('🌱 Memulai proses seeding lengkap...\n');

  // ─────────────────────────────────────────────
  // 1. USERS
  // ─────────────────────────────────────────────
  console.log('📝 Seeding Users...');

  // Super Admin
  const adminEmail = 'admin@nebeng.com';
  const adminPassword = 'Admin@12345';

  let admin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!admin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    admin = await prisma.user.create({
      data: {
        name: 'Super Admin',
        email: adminEmail,
        phone: '081200000000',
        password: hashedPassword,
        role: Role.admin,
        status: UserStatus.active,
        statusVerification: VerificationStatus.approved,
      },
    });
    console.log(`✅ Super Admin dibuat: ${admin.email}`);
  } else {
    console.log(`⚠️  Super Admin sudah ada: ${admin.email}`);
  }

  // Regional Admin Jogja
  let regionalAdminJogja = await prisma.user.findFirst({
    where: { role: Role.regional, email: 'regional.jogja@nebeng.com' },
  });

  if (!regionalAdminJogja) {
    const hashedPassword = await bcrypt.hash('Regional@12345', 10);
    regionalAdminJogja = await prisma.user.create({
      data: {
        name: 'Regional Admin Jogja',
        email: 'regional.jogja@nebeng.com',
        phone: '081200000001',
        password: hashedPassword,
        role: Role.regional,
        status: UserStatus.active,
        statusVerification: VerificationStatus.approved,
      },
    });
    console.log(`✅ Regional Admin Jogja dibuat: ${regionalAdminJogja.email}`);
  } else {
    console.log(`⚠️  Regional Admin Jogja sudah ada: ${regionalAdminJogja.email}`);
  }

  // Regional Admin Solo
  let regionalAdminSolo = await prisma.user.findFirst({
    where: { role: Role.regional, email: 'regional.solo@nebeng.com' },
  });

  if (!regionalAdminSolo) {
    const hashedPassword = await bcrypt.hash('Regional@12345', 10);
    regionalAdminSolo = await prisma.user.create({
      data: {
        name: 'Regional Admin Solo',
        email: 'regional.solo@nebeng.com',
        phone: '081200000009',
        password: hashedPassword,
        role: Role.regional,
        status: UserStatus.active,
        statusVerification: VerificationStatus.approved,
      },
    });
    console.log(`✅ Regional Admin Solo dibuat: ${regionalAdminSolo.email}`);
  } else {
    console.log(`⚠️  Regional Admin Solo sudah ada: ${regionalAdminSolo.email}`);
  }

  // Operator Pos
  let operator = await prisma.user.findFirst({
    where: { role: Role.operator },
  });

  if (!operator) {
    const hashedPassword = await bcrypt.hash('Operator@12345', 10);
    operator = await prisma.user.create({
      data: {
        name: 'Operator Pos Gambir',
        email: 'operator.gambir@nebeng.com',
        phone: '081200000002',
        password: hashedPassword,
        role: Role.operator,
        status: UserStatus.active,
        statusVerification: VerificationStatus.approved,
      },
    });
    console.log(`✅ Operator dibuat: ${operator.email}`);
  } else {
    console.log(`⚠️  Operator sudah ada: ${operator.email}`);
  }

  // ─────────────────────────────────────────────
  // 2. REGIONS
  // ─────────────────────────────────────────────
  console.log('\n🌍 Seeding Regions...');

  let regionJogja = await prisma.region.findFirst({
    where: { code: 'JOG' },
  });

  if (!regionJogja) {
    regionJogja = await prisma.region.create({
      data: {
        name: 'Yogyakarta',
        code: 'JOG',
        pricePerKm: 2500,
        isActive: true,
        latitude: -7.7956,
        longitude: 110.3695,
        radiusKm: 30,
      },
    });
    console.log(`✅ Region Jogja dibuat: ${regionJogja.name}`);
  } else {
    console.log(`⚠️  Region Jogja sudah ada: ${regionJogja.name}`);
  }

  let regionSolo = await prisma.region.findFirst({
    where: { code: 'SOC' },
  });

  if (!regionSolo) {
    regionSolo = await prisma.region.create({
      data: {
        name: 'Surakarta',
        code: 'SOC',
        pricePerKm: 2500,
        isActive: true,
        latitude: -7.5614,
        longitude: 110.8309,
        radiusKm: 25,
      },
    });
    console.log(`✅ Region Solo dibuat: ${regionSolo.name}`);
  } else {
    console.log(`⚠️  Region Solo sudah ada: ${regionSolo.name}`);
  }

  // Update regional admin regions
  await prisma.user.update({
    where: { id: regionalAdminJogja.id },
    data: { regionId: regionJogja.id },
  });

  await prisma.user.update({
    where: { id: regionalAdminSolo.id },
    data: { regionId: regionSolo.id },
  });

  // Mitra Jogja
  let mitraJogja = await prisma.user.findFirst({
    where: { role: Role.mitra, email: 'mitra.jogja@nebeng.com' },
  });

  if (!mitraJogja) {
    const hashedPassword = await bcrypt.hash('Mitra@12345', 10);
    mitraJogja = await prisma.user.create({
      data: {
        name: 'Budi Santoso',
        email: 'mitra.jogja@nebeng.com',
        phone: '081200000003',
        password: hashedPassword,
        role: Role.mitra,
        status: UserStatus.active,
        statusVerification: VerificationStatus.approved,
        regionId: regionJogja.id,
      },
    });
    console.log(`✅ Mitra Jogja dibuat: ${mitraJogja.email}`);
  } else {
    console.log(`⚠️  Mitra Jogja sudah ada: ${mitraJogja.email}`);
  }

  // Mitra Solo
  let mitraSolo = await prisma.user.findFirst({
    where: { role: Role.mitra, email: 'mitra.solo@nebeng.com' },
  });

  if (!mitraSolo) {
    const hashedPassword = await bcrypt.hash('Mitra@12345', 10);
    mitraSolo = await prisma.user.create({
      data: {
        name: 'Agus Prasetyo',
        email: 'mitra.solo@nebeng.com',
        phone: '081200000010',
        password: hashedPassword,
        role: Role.mitra,
        status: UserStatus.active,
        statusVerification: VerificationStatus.approved,
        regionId: regionSolo.id,
      },
    });
    console.log(`✅ Mitra Solo dibuat: ${mitraSolo.email}`);
  } else {
    console.log(`⚠️  Mitra Solo sudah ada: ${mitraSolo.email}`);
  }

  // Customer Jogja
  let customerJogja = await prisma.user.findFirst({
    where: { role: Role.customer, email: 'customer.jogja@nebeng.com' },
  });

  if (!customerJogja) {
    const hashedPassword = await bcrypt.hash('Customer@12345', 10);
    customerJogja = await prisma.user.create({
      data: {
        name: 'Andi Pratama',
        email: 'customer.jogja@nebeng.com',
        phone: '081200000004',
        password: hashedPassword,
        role: Role.customer,
        status: UserStatus.active,
        statusVerification: VerificationStatus.approved,
        regionId: regionJogja.id,
      },
    });
    console.log(`✅ Customer Jogja dibuat: ${customerJogja.email}`);
  } else {
    console.log(`⚠️  Customer Jogja sudah ada: ${customerJogja.email}`);
  }

  // Customer Solo
  let customerSolo = await prisma.user.findFirst({
    where: { role: Role.customer, email: 'customer.solo@nebeng.com' },
  });

  if (!customerSolo) {
    const hashedPassword = await bcrypt.hash('Customer@12345', 10);
    customerSolo = await prisma.user.create({
      data: {
        name: 'Dewi Lestari',
        email: 'customer.solo@nebeng.com',
        phone: '081200000011',
        password: hashedPassword,
        role: Role.customer,
        status: UserStatus.active,
        statusVerification: VerificationStatus.approved,
        regionId: regionSolo.id,
      },
    });
    console.log(`✅ Customer Solo dibuat: ${customerSolo.email}`);
  } else {
    console.log(`⚠️  Customer Solo sudah ada: ${customerSolo.email}`);
  }

  // ─────────────────────────────────────────────
  // 3. CITIES
  // ─────────────────────────────────────────────
  console.log('\n🏙️  Seeding Cities...');

  const cities = [
    { name: 'Yogyakarta', province: 'DI Yogyakarta' },
    { name: 'Surakarta', province: 'Jawa Tengah' },
  ];

  for (const cityData of cities) {
    const existing = await prisma.city.findFirst({
      where: { name: cityData.name },
    });

    if (!existing) {
      await prisma.city.create({
        data: cityData,
      });
      console.log(`✅ City dibuat: ${cityData.name}`);
    } else {
      console.log(`⚠️  City sudah ada: ${cityData.name}`);
    }
  }

  const jogjaCity = await prisma.city.findFirst({
    where: { name: 'Yogyakarta' },
  });
  const soloCity = await prisma.city.findFirst({
    where: { name: 'Surakarta' },
  });

  if (!jogjaCity || !soloCity) {
    throw new Error('Cities Yogyakarta dan Surakarta harus ada');
  }

  // ─────────────────────────────────────────────
  // 4. PICKUP POINTS
  // ─────────────────────────────────────────────
  console.log('\n📍 Seeding Pickup Points...');

  // Jogja Pickup Points
  let pickupPointJogja1 = await prisma.pickupPoint.findFirst({
    where: { name: 'Terminal Giwangan' },
  });

  if (!pickupPointJogja1) {
    pickupPointJogja1 = await prisma.pickupPoint.create({
      data: {
        regionId: regionJogja.id,
        cityId: jogjaCity.id,
        operatorId: operator.id,
        name: 'Terminal Giwangan',
        address: 'Jl. Imogiri Timur No.1, Giwangan, Yogyakarta',
        latitude: -7.8154,
        longitude: 110.3875,
        qrCodePos: generateQr('POS'),
        isActive: true,
      },
    });
    console.log(`✅ Pickup Point dibuat: ${pickupPointJogja1.name}`);
  } else {
    console.log(`⚠️  Pickup Point sudah ada: ${pickupPointJogja1.name}`);
  }

  let pickupPointJogja2 = await prisma.pickupPoint.findFirst({
    where: { name: 'Terminal Jombor' },
  });

  if (!pickupPointJogja2) {
    pickupPointJogja2 = await prisma.pickupPoint.create({
      data: {
        regionId: regionJogja.id,
        cityId: jogjaCity.id,
        operatorId: operator.id,
        name: 'Terminal Jombor',
        address: 'Jl. Magelang Km.6, Jombor, Sleman',
        latitude: -7.7489,
        longitude: 110.3456,
        qrCodePos: generateQr('POS'),
        isActive: true,
      },
    });
    console.log(`✅ Pickup Point dibuat: ${pickupPointJogja2.name}`);
  } else {
    console.log(`⚠️  Pickup Point sudah ada: ${pickupPointJogja2.name}`);
  }

  let pickupPointJogja3 = await prisma.pickupPoint.findFirst({
    where: { name: 'Stasiun Tugu Yogyakarta' },
  });

  if (!pickupPointJogja3) {
    pickupPointJogja3 = await prisma.pickupPoint.create({
      data: {
        regionId: regionJogja.id,
        cityId: jogjaCity.id,
        operatorId: operator.id,
        name: 'Stasiun Tugu Yogyakarta',
        address: 'Jl. Menteri Supeno, Yogyakarta',
        latitude: -7.7892,
        longitude: 110.3635,
        qrCodePos: generateQr('POS'),
        isActive: true,
      },
    });
    console.log(`✅ Pickup Point dibuat: ${pickupPointJogja3.name}`);
  } else {
    console.log(`⚠️  Pickup Point sudah ada: ${pickupPointJogja3.name}`);
  }

  // Solo Pickup Points
  let pickupPointSolo1 = await prisma.pickupPoint.findFirst({
    where: { name: 'Terminal Tirtonadi' },
  });

  if (!pickupPointSolo1) {
    pickupPointSolo1 = await prisma.pickupPoint.create({
      data: {
        regionId: regionSolo.id,
        cityId: soloCity.id,
        operatorId: operator.id,
        name: 'Terminal Tirtonadi',
        address: 'Jl. Adi Sucipto No.1, Surakarta',
        latitude: -7.5456,
        longitude: 110.8212,
        qrCodePos: generateQr('POS'),
        isActive: true,
      },
    });
    console.log(`✅ Pickup Point dibuat: ${pickupPointSolo1.name}`);
  } else {
    console.log(`⚠️  Pickup Point sudah ada: ${pickupPointSolo1.name}`);
  }

  let pickupPointSolo2 = await prisma.pickupPoint.findFirst({
    where: { name: 'Stasiun Solo Balapan' },
  });

  if (!pickupPointSolo2) {
    pickupPointSolo2 = await prisma.pickupPoint.create({
      data: {
        regionId: regionSolo.id,
        cityId: soloCity.id,
        operatorId: operator.id,
        name: 'Stasiun Solo Balapan',
        address: 'Jl. Slamet Riyadi No.1, Surakarta',
        latitude: -7.5614,
        longitude: 110.8345,
        qrCodePos: generateQr('POS'),
        isActive: true,
      },
    });
    console.log(`✅ Pickup Point dibuat: ${pickupPointSolo2.name}`);
  } else {
    console.log(`⚠️  Pickup Point sudah ada: ${pickupPointSolo2.name}`);
  }

  // ─────────────────────────────────────────────
  // 5. VEHICLES
  // ─────────────────────────────────────────────
  console.log('\n🚗 Seeding Vehicles...');

  let vehicleJogja = await prisma.vehicle.findFirst({
    where: { userId: mitraJogja.id },
  });

  if (!vehicleJogja) {
    vehicleJogja = await prisma.vehicle.create({
      data: {
        userId: mitraJogja.id,
        type: 'mobil',
        model: 'Toyota Avanza',
        plateNumber: 'AB 1234 CD',
        color: 'Silver',
        capacitySeats: 4,
        maxWeightCapacityKg: 200,
      },
    });
    console.log(`✅ Vehicle Jogja dibuat: ${vehicleJogja.model} (${vehicleJogja.plateNumber})`);
  } else {
    console.log(`⚠️  Vehicle Jogja sudah ada: ${vehicleJogja.model}`);
  }

  let vehicleSolo = await prisma.vehicle.findFirst({
    where: { userId: mitraSolo.id },
  });

  if (!vehicleSolo) {
    vehicleSolo = await prisma.vehicle.create({
      data: {
        userId: mitraSolo.id,
        type: 'mobil',
        model: 'Toyota Innova',
        plateNumber: 'AD 5678 EF',
        color: 'Hitam',
        capacitySeats: 6,
        maxWeightCapacityKg: 300,
      },
    });
    console.log(`✅ Vehicle Solo dibuat: ${vehicleSolo.model} (${vehicleSolo.plateNumber})`);
  } else {
    console.log(`⚠️  Vehicle Solo sudah ada: ${vehicleSolo.model}`);
  }

  // ─────────────────────────────────────────────
  // 6. PRICING SETTINGS
  // ─────────────────────────────────────────────
  console.log('\n💰 Seeding Pricing Settings...');

  const pricingSettings = [
    {
      serviceType: ServiceType.motor,
      size: null,
      baseFare: 5000,
      farePerKm: 3000,
      farePerKg: null,
      maxWeightKg: null,
      adminFeePercentage: 10,
    },
    {
      serviceType: ServiceType.mobil,
      size: null,
      baseFare: 8000,
      farePerKm: 3000,
      farePerKg: null,
      maxWeightKg: null,
      adminFeePercentage: 10,
    },
    {
      serviceType: ServiceType.barang,
      size: ParcelSize.xxs,
      baseFare: 10000,
      farePerKm: 2000,
      farePerKg: 500,
      maxWeightKg: 1,
      adminFeePercentage: 12,
    },
    {
      serviceType: ServiceType.barang,
      size: ParcelSize.xs,
      baseFare: 15000,
      farePerKm: 2000,
      farePerKg: 500,
      maxWeightKg: 3,
      adminFeePercentage: 12,
    },
    {
      serviceType: ServiceType.barang,
      size: ParcelSize.s,
      baseFare: 20000,
      farePerKm: 2000,
      farePerKg: 500,
      maxWeightKg: 5,
      adminFeePercentage: 12,
    },
    {
      serviceType: ServiceType.barang,
      size: ParcelSize.m,
      baseFare: 30000,
      farePerKm: 2000,
      farePerKg: 500,
      maxWeightKg: 10,
      adminFeePercentage: 12,
    },
    {
      serviceType: ServiceType.barang,
      size: ParcelSize.l,
      baseFare: 40000,
      farePerKm: 2000,
      farePerKg: 500,
      maxWeightKg: 20,
      adminFeePercentage: 12,
    },
    {
      serviceType: ServiceType.barang,
      size: ParcelSize.xl,
      baseFare: 50000,
      farePerKm: 2000,
      farePerKg: 500,
      maxWeightKg: 30,
      adminFeePercentage: 12,
    },
  ];

  for (const pricing of pricingSettings) {
    const existing = await prisma.pricingSetting.findFirst({
      where: {
        serviceType: pricing.serviceType,
        size: pricing.size,
      },
    });

    if (!existing) {
      await prisma.pricingSetting.create({
        data: pricing,
      });
      console.log(`✅ Pricing dibuat: ${pricing.serviceType} - ${pricing.size || 'default'}`);
    } else {
      console.log(`⚠️  Pricing sudah ada: ${pricing.serviceType} - ${pricing.size || 'default'}`);
    }
  }

  // ─────────────────────────────────────────────
  // 7. TRIPS (1 Jam dari Sekarang)
  // ─────────────────────────────────────────────
  console.log('\n🚀 Seeding Trips (1 jam dari sekarang)...');

  const departureTime = getOneHourFromNow();
  const departureDate = new Date();
  departureDate.setHours(0, 0, 0, 0);

  // Trip Jogja (within Jogja region only)
  let tripJogja = await prisma.trip.findFirst({
    where: { mitraId: mitraJogja.id },
  });

  if (!tripJogja) {
    tripJogja = await prisma.trip.create({
      data: {
        mitraId: mitraJogja.id,
        vehicleId: vehicleJogja.id,
        originPointId: pickupPointJogja1.id,
        destinationPointId: pickupPointJogja2.id,
        vehicleType: 'mobil',
        departureDate,
        departureTime,
        price: 50000,
        seatTotal: 4,
        seatAvailable: 4,
        maxWeightCapacityKg: 200,
        remainingWeightCapacityKg: 200,
        qrCodeTrip: generateQr('TRIP'),
        status: TripStatus.scheduled,
        serviceType: ServiceType.mobil,
      },
    });
    console.log(`✅ Trip Jogja dibuat: ${pickupPointJogja1.name} → ${pickupPointJogja2.name}`);
    console.log(`   Jam: ${departureTime.toLocaleTimeString('id-ID')}`);
  } else {
    console.log(`⚠️  Trip Jogja sudah ada untuk mitra ini`);
  }

  // Trip Solo (within Solo region only)
  let tripSolo = await prisma.trip.findFirst({
    where: { mitraId: mitraSolo.id },
  });

  if (!tripSolo) {
    tripSolo = await prisma.trip.create({
      data: {
        mitraId: mitraSolo.id,
        vehicleId: vehicleSolo.id,
        originPointId: pickupPointSolo1.id,
        destinationPointId: pickupPointSolo2.id,
        vehicleType: 'mobil',
        departureDate,
        departureTime,
        price: 45000,
        seatTotal: 6,
        seatAvailable: 6,
        maxWeightCapacityKg: 300,
        remainingWeightCapacityKg: 300,
        qrCodeTrip: generateQr('TRIP'),
        status: TripStatus.scheduled,
        serviceType: ServiceType.mobil,
      },
    });
    console.log(`✅ Trip Solo dibuat: ${pickupPointSolo1.name} → ${pickupPointSolo2.name}`);
    console.log(`   Jam: ${departureTime.toLocaleTimeString('id-ID')}`);
  } else {
    console.log(`⚠️  Trip Solo sudah ada untuk mitra ini`);
  }

  // ─────────────────────────────────────────────
  // 8. ORDERS
  // ─────────────────────────────────────────────
  console.log('\n🎫 Seeding Orders...');

  // Order Jogja
  let orderJogja = await prisma.order.findFirst({
    where: { customerId: customerJogja.id },
  });

  if (!orderJogja) {
    orderJogja = await prisma.order.create({
      data: {
        tripId: tripJogja.id,
        customerId: customerJogja.id,
        type: 'passenger',
        seatsBooked: 1,
        totalItemsCount: 0,
        totalWeightKg: 0,
        totalPrice: 50000,
        adminFeePercentage: 10,
        qrCodeTicket: generateQr('TKT'),
        otpClaim: null,
        readinessStatus: 'ready',
        status: OrderStatus.paid,
        escrowStatus: EscrowStatus.held,
      },
    });
    console.log(`✅ Order Jogja dibuat: Passenger x1 (Rp 50.000)`);
  } else {
    console.log(`⚠️  Order Jogja sudah ada untuk customer ini`);
  }

  // Order Solo
  let orderSolo = await prisma.order.findFirst({
    where: { customerId: customerSolo.id },
  });

  if (!orderSolo) {
    orderSolo = await prisma.order.create({
      data: {
        tripId: tripSolo.id,
        customerId: customerSolo.id,
        type: 'passenger',
        seatsBooked: 1,
        totalItemsCount: 0,
        totalWeightKg: 0,
        totalPrice: 45000,
        adminFeePercentage: 10,
        qrCodeTicket: generateQr('TKT'),
        otpClaim: null,
        readinessStatus: 'ready',
        status: OrderStatus.paid,
        escrowStatus: EscrowStatus.held,
      },
    });
    console.log(`✅ Order Solo dibuat: Passenger x1 (Rp 45.000)`);
  } else {
    console.log(`⚠️  Order Solo sudah ada untuk customer ini`);
  }

  // ─────────────────────────────────────────────
  // 9. WALLETS
  // ─────────────────────────────────────────────
  console.log('\n💳 Seeding Wallets...');

  // Wallet Mitra Jogja
  let mitraWalletJogja = await prisma.wallet.findUnique({
    where: { userId: mitraJogja.id },
  });

  if (!mitraWalletJogja) {
    mitraWalletJogja = await prisma.wallet.create({
      data: {
        userId: mitraJogja.id,
        balance: 500000,
        heldEscrowBalance: 45000, // Escrow from order
      },
    });
    console.log(`✅ Wallet Mitra Jogja dibuat: Balance Rp 500.000, Escrow Rp 45.000`);
  } else {
    console.log(`⚠️  Wallet Mitra Jogja sudah ada`);
  }

  // Wallet Mitra Solo
  let mitraWalletSolo = await prisma.wallet.findUnique({
    where: { userId: mitraSolo.id },
  });

  if (!mitraWalletSolo) {
    mitraWalletSolo = await prisma.wallet.create({
      data: {
        userId: mitraSolo.id,
        balance: 500000,
        heldEscrowBalance: 40500, // Escrow from order
      },
    });
    console.log(`✅ Wallet Mitra Solo dibuat: Balance Rp 500.000, Escrow Rp 40.500`);
  } else {
    console.log(`⚠️  Wallet Mitra Solo sudah ada`);
  }

  // Wallet Customer Jogja
  let customerWalletJogja = await prisma.wallet.findUnique({
    where: { userId: customerJogja.id },
  });

  if (!customerWalletJogja) {
    customerWalletJogja = await prisma.wallet.create({
      data: {
        userId: customerJogja.id,
        balance: 200000,
        heldEscrowBalance: 0,
      },
    });
    console.log(`✅ Wallet Customer Jogja dibuat: Balance Rp 200.000`);
  } else {
    console.log(`⚠️  Wallet Customer Jogja sudah ada`);
  }

  // Wallet Customer Solo
  let customerWalletSolo = await prisma.wallet.findUnique({
    where: { userId: customerSolo.id },
  });

  if (!customerWalletSolo) {
    customerWalletSolo = await prisma.wallet.create({
      data: {
        userId: customerSolo.id,
        balance: 200000,
        heldEscrowBalance: 0,
      },
    });
    console.log(`✅ Wallet Customer Solo dibuat: Balance Rp 200.000`);
  } else {
    console.log(`⚠️  Wallet Customer Solo sudah ada`);
  }

  // Wallet Admin
  let adminWallet = await prisma.wallet.findUnique({
    where: { userId: admin.id },
  });

  if (!adminWallet) {
    adminWallet = await prisma.wallet.create({
      data: {
        userId: admin.id,
        balance: 1000000,
        heldEscrowBalance: 0,
      },
    });
    console.log(`✅ Wallet Admin dibuat: Balance Rp 1.000.000`);
  } else {
    console.log(`⚠️  Wallet Admin sudah ada`);
  }

  // ─────────────────────────────────────────────
  // 10. WALLET TRANSACTIONS
  // ─────────────────────────────────────────────
  console.log('\n📊 Seeding Wallet Transactions...');

  // Escrow hold for mitra Jogja
  await prisma.walletTransaction.create({
    data: {
      walletId: mitraWalletJogja.id,
      orderId: orderJogja.id,
      amount: 45000,
      type: TransactionType.escrow_hold,
      description: 'Escrow hold untuk order #' + orderJogja.id,
    },
  });

  // Admin fee credit from Jogja order
  await prisma.walletTransaction.create({
    data: {
      walletId: adminWallet.id,
      orderId: orderJogja.id,
      amount: 5000,
      type: TransactionType.credit,
      description: 'Admin fee dari order #' + orderJogja.id,
    },
  });

  // Escrow hold for mitra Solo
  await prisma.walletTransaction.create({
    data: {
      walletId: mitraWalletSolo.id,
      orderId: orderSolo.id,
      amount: 40500,
      type: TransactionType.escrow_hold,
      description: 'Escrow hold untuk order #' + orderSolo.id,
    },
  });

  // Admin fee credit from Solo order
  await prisma.walletTransaction.create({
    data: {
      walletId: adminWallet.id,
      orderId: orderSolo.id,
      amount: 4500,
      type: TransactionType.credit,
      description: 'Admin fee dari order #' + orderSolo.id,
    },
  });

  console.log(`✅ Wallet transactions dibuat`);

  // ─────────────────────────────────────────────
  // 11. PAYMENTS
  // ─────────────────────────────────────────────
  console.log('\n💳 Seeding Payments...');

  // Payment Jogja
  let paymentJogja = await prisma.payment.findFirst({
    where: { orderId: orderJogja.id },
  });

  if (!paymentJogja) {
    paymentJogja = await prisma.payment.create({
      data: {
        orderId: orderJogja.id,
        paymentGateway: 'XENDIT_DUMMY',
        transactionId: generateQr('TRX'),
        amount: 50000,
        status: 'success',
      },
    });
    console.log(`✅ Payment Jogja dibuat: Rp 50.000 (Success)`);
  } else {
    console.log(`⚠️  Payment Jogja sudah ada untuk order ini`);
  }

  // Payment Solo
  let paymentSolo = await prisma.payment.findFirst({
    where: { orderId: orderSolo.id },
  });

  if (!paymentSolo) {
    paymentSolo = await prisma.payment.create({
      data: {
        orderId: orderSolo.id,
        paymentGateway: 'XENDIT_DUMMY',
        transactionId: generateQr('TRX'),
        amount: 45000,
        status: 'success',
      },
    });
    console.log(`✅ Payment Solo dibuat: Rp 45.000 (Success)`);
  } else {
    console.log(`⚠️  Payment Solo sudah ada untuk order ini`);
  }

  // ─────────────────────────────────────────────
  // 12. MERCHANDISE ITEMS
  // ─────────────────────────────────────────────
  console.log('\n🎁 Seeding Merchandise Items...');

  const merchandiseItems = [
    {
      name: 'T-Shirt Nebeng',
      description: 'T-shirt eksklusif Nebeng',
      pointsRequired: 1000,
      stock: 50,
      imageUrl: 'https://example.com/tshirt.jpg',
      isActive: true,
    },
    {
      name: 'Tote Bag Nebeng',
      description: 'Tote bag canvas Nebeng',
      pointsRequired: 500,
      stock: 100,
      imageUrl: 'https://example.com/totebag.jpg',
      isActive: true,
    },
    {
      name: 'Voucher Diskon 10%',
      description: 'Voucher diskon 10% untuk trip selanjutnya',
      pointsRequired: 2000,
      stock: 30,
      imageUrl: 'https://example.com/voucher.jpg',
      isActive: true,
    },
  ];

  for (const item of merchandiseItems) {
    const existing = await prisma.merchandiseItem.findFirst({
      where: { name: item.name },
    });

    if (!existing) {
      await prisma.merchandiseItem.create({
        data: item,
      });
      console.log(`✅ Merchandise dibuat: ${item.name} (${item.pointsRequired} poin)`);
    } else {
      console.log(`⚠️  Merchandise sudah ada: ${item.name}`);
    }
  }

  // ─────────────────────────────────────────────
  // 13. BANNERS
  // ─────────────────────────────────────────────
  console.log('\n🎨 Seeding Banners...');

  const banners = [
    {
      title: 'Promo Awal Tahun',
      imageUrl: 'https://example.com/promo1.jpg',
      linkUrl: '/promos/newyear',
      isActive: true,
      targetRole: null,
    },
    {
      title: 'Diskon Mitra Baru',
      imageUrl: 'https://example.com/promo2.jpg',
      linkUrl: '/promos/mitra',
      isActive: true,
      targetRole: Role.mitra,
    },
  ];

  for (const banner of banners) {
    const existing = await prisma.banner.findFirst({
      where: { title: banner.title },
    });

    if (!existing) {
      await prisma.banner.create({
        data: banner,
      });
      console.log(`✅ Banner dibuat: ${banner.title}`);
    } else {
      console.log(`⚠️  Banner sudah ada: ${banner.title}`);
    }
  }

  // ─────────────────────────────────────────────
  // 14. USER PROFILES
  // ─────────────────────────────────────────────
  console.log('\n👤 Seeding User Profiles...');

  // Profile Mitra Jogja
  let mitraProfileJogja = await prisma.userProfile.findUnique({
    where: { userId: mitraJogja.id },
  });

  if (!mitraProfileJogja) {
    mitraProfileJogja = await prisma.userProfile.create({
      data: {
        userId: mitraJogja.id,
        ktpNumber: '3471000000000001',
        fullNameKtp: 'Budi Santoso',
        addressKtp: 'Jl. Malioboro No.1, Yogyakarta',
        bankName: 'BCA',
        bankAccountNumber: '1234567890',
        bankAccountHolder: 'Budi Santoso',
      },
    });
    console.log(`✅ Profile Mitra Jogja dibuat`);
  } else {
    console.log(`⚠️  Profile Mitra Jogja sudah ada`);
  }

  // Profile Mitra Solo
  let mitraProfileSolo = await prisma.userProfile.findUnique({
    where: { userId: mitraSolo.id },
  });

  if (!mitraProfileSolo) {
    mitraProfileSolo = await prisma.userProfile.create({
      data: {
        userId: mitraSolo.id,
        ktpNumber: '3374000000000001',
        fullNameKtp: 'Agus Prasetyo',
        addressKtp: 'Jl. Slamet Riyadi No.1, Surakarta',
        bankName: 'BRI',
        bankAccountNumber: '0987654321',
        bankAccountHolder: 'Agus Prasetyo',
      },
    });
    console.log(`✅ Profile Mitra Solo dibuat`);
  } else {
    console.log(`⚠️  Profile Mitra Solo sudah ada`);
  }

  // Profile Customer Jogja
  let customerProfileJogja = await prisma.userProfile.findUnique({
    where: { userId: customerJogja.id },
  });

  if (!customerProfileJogja) {
    customerProfileJogja = await prisma.userProfile.create({
      data: {
        userId: customerJogja.id,
        ktpNumber: '3471000000000002',
        fullNameKtp: 'Andi Pratama',
        addressKtp: 'Jl. Kaliurang No.1, Yogyakarta',
        bankName: 'Mandiri',
        bankAccountNumber: '1122334455',
        bankAccountHolder: 'Andi Pratama',
      },
    });
    console.log(`✅ Profile Customer Jogja dibuat`);
  } else {
    console.log(`⚠️  Profile Customer Jogja sudah ada`);
  }

  // Profile Customer Solo
  let customerProfileSolo = await prisma.userProfile.findUnique({
    where: { userId: customerSolo.id },
  });

  if (!customerProfileSolo) {
    customerProfileSolo = await prisma.userProfile.create({
      data: {
        userId: customerSolo.id,
        ktpNumber: '3374000000000002',
        fullNameKtp: 'Dewi Lestari',
        addressKtp: 'Jl. Urip Sumoharjo No.1, Surakarta',
        bankName: 'BNI',
        bankAccountNumber: '5566778899',
        bankAccountHolder: 'Dewi Lestari',
      },
    });
    console.log(`✅ Profile Customer Solo dibuat`);
  } else {
    console.log(`⚠️  Profile Customer Solo sudah ada`);
  }

  // ─────────────────────────────────────────────
  // 15. REWARD TRANSACTIONS
  // ─────────────────────────────────────────────
  console.log('\n⭐ Seeding Reward Transactions...');

  // Give customer Jogja some reward points
  await prisma.user.update({
    where: { id: customerJogja.id },
    data: { rewardPoints: 500 },
  });

  await prisma.rewardTransaction.create({
    data: {
      userId: customerJogja.id,
      points: 500,
      type: RewardType.earn,
      description: 'Bonus poin registrasi',
    },
  });

  // Give customer Solo some reward points
  await prisma.user.update({
    where: { id: customerSolo.id },
    data: { rewardPoints: 500 },
  });

  await prisma.rewardTransaction.create({
    data: {
      userId: customerSolo.id,
      points: 500,
      type: RewardType.earn,
      description: 'Bonus poin registrasi',
    },
  });

  console.log(`✅ Reward transactions dibuat: 500 poin untuk setiap customer`);

  // ─────────────────────────────────────────────
  // 16. ORDER QR SESSION
  // ─────────────────────────────────────────────
  console.log('\n🔐 Seeding Order QR Sessions...');

  const tokenExpiry = new Date();
  tokenExpiry.setHours(tokenExpiry.getHours() + 48);

  // QR Session Jogja
  await prisma.orderQrSession.create({
    data: {
      orderId: orderJogja.id,
      qrToken: orderJogja.qrCodeTicket,
      scanPhase: ScanType.checkin_origin,
      isUsed: false,
      expiredAt: tokenExpiry,
    },
  });

  // QR Session Solo
  await prisma.orderQrSession.create({
    data: {
      orderId: orderSolo.id,
      qrToken: orderSolo.qrCodeTicket,
      scanPhase: ScanType.checkin_origin,
      isUsed: false,
      expiredAt: tokenExpiry,
    },
  });

  console.log(`✅ Order QR Sessions dibuat`);

  // ─────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log('🎉 SEEDING SELESAI!');
  console.log('='.repeat(50));
  console.log('\n📋 ACCOUNT CREDENTIALS:');
  console.log('─'.repeat(50));
  console.log(`👑 Super Admin:`);
  console.log(`   Email: ${admin.email}`);
  console.log(`   Pass: ${adminPassword}`);
  console.log('');
  console.log(`👨‍💼 Regional Admin Jogja:`);
  console.log(`   Email: ${regionalAdminJogja.email}`);
  console.log(`   Pass: Regional@12345`);
  console.log('');
  console.log(`👨‍💼 Regional Admin Solo:`);
  console.log(`   Email: ${regionalAdminSolo.email}`);
  console.log(`   Pass: Regional@12345`);
  console.log('');
  console.log(`👷 Operator Pos:`);
  console.log(`   Email: ${operator.email}`);
  console.log(`   Pass: Operator@12345`);
  console.log('');
  console.log(`🚗 Mitra Jogja:`);
  console.log(`   Email: ${mitraJogja.email}`);
  console.log(`   Pass: Mitra@12345`);
  console.log(`   Region: Yogyakarta`);
  console.log('');
  console.log(`� Mitra Solo:`);
  console.log(`   Email: ${mitraSolo.email}`);
  console.log(`   Pass: Mitra@12345`);
  console.log(`   Region: Surakarta`);
  console.log('');
  console.log(`�👤 Customer Jogja:`);
  console.log(`   Email: ${customerJogja.email}`);
  console.log(`   Pass: Customer@12345`);
  console.log('');
  console.log(`👤 Customer Solo:`);
  console.log(`   Email: ${customerSolo.email}`);
  console.log(`   Pass: Customer@12345`);
  console.log('');
  console.log('─'.repeat(50));
  console.log(`🚀 TRIP INFO JOGJA:`);
  console.log(`   Route: ${pickupPointJogja1.name} → ${pickupPointJogja2.name}`);
  console.log(`   Jam: ${departureTime.toLocaleTimeString('id-ID')}`);
  console.log(`   Status: scheduled (siap untuk check-in)`);
  console.log(`   QR Trip: ${tripJogja.qrCodeTrip}`);
  console.log(`   Mitra: ${mitraJogja.name}`);
  console.log('');
  console.log(`🚀 TRIP INFO SOLO:`);
  console.log(`   Route: ${pickupPointSolo1.name} → ${pickupPointSolo2.name}`);
  console.log(`   Jam: ${departureTime.toLocaleTimeString('id-ID')}`);
  console.log(`   Status: scheduled (siap untuk check-in)`);
  console.log(`   QR Trip: ${tripSolo.qrCodeTrip}`);
  console.log(`   Mitra: ${mitraSolo.name}`);
  console.log('');
  console.log(`🎫 ORDER INFO JOGJA:`);
  console.log(`   Customer: ${customerJogja.name}`);
  console.log(`   Type: Passenger x1`);
  console.log(`   Price: Rp 50.000`);
  console.log(`   Status: paid (escrow held)`);
  console.log(`   QR Ticket: ${orderJogja.qrCodeTicket}`);
  console.log('');
  console.log(`🎫 ORDER INFO SOLO:`);
  console.log(`   Customer: ${customerSolo.name}`);
  console.log(`   Type: Passenger x1`);
  console.log(`   Price: Rp 45.000`);
  console.log(`   Status: paid (escrow held)`);
  console.log(`   QR Ticket: ${orderSolo.qrCodeTicket}`);
  console.log('─'.repeat(50));
  console.log('\n⚠️  JANGAN LUPAN:');
  console.log('1. Ganti password setelah login pertama!');
  console.log('2. Trip dijadwalkan 1 jam dari sekarang');
  console.log('3. Order sudah dalam status paid (siap check-in)');
  console.log('4. Escrow sudah held di wallet mitra');
  console.log('5. Mitra Jogja hanya bisa melayani area Jogja saja');
  console.log('6. Mitra Solo hanya bisa melayani area Solo saja');
  console.log('7. Mitra Jogja TIDAK bisa pergi ke area Solo dan sebaliknya');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seeding gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
