import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  Role,
  ServiceType,
  ParcelSize,
  TripStatus,
  OrderStatus,
  EscrowStatus,
  TransactionType,
  RewardType,
  ScanType,
  VerificationStatus,
  UserStatus,
  DiscountType,
  VoucherClaimType,
  OrderType,
  RedemptionStatus,
} from '../src/generated/prisma/enums';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

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

function getOneHourFromNow(): Date {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  return now;
}

// Mengambil file gambar asli dari folder uploads/banners jika tersedia
function getAvailableBannerImages(): string[] {
  const dir = path.join(process.cwd(), 'uploads', 'banners');
  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  if (fs.existsSync(dir)) {
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
    if (files.length > 0) {
      return files.map((f) => `${baseUrl}/uploads/banners/${f}`);
    }
  }
  return [
    `${baseUrl}/uploads/banners/banner-default-1.png`,
    `${baseUrl}/uploads/banners/banner-default-2.png`,
    `${baseUrl}/uploads/banners/banner-default-3.png`,
  ];
}

async function main() {
  console.log('🌱 Memulai proses seeding lengkap Nebeng (Region Aglomerasi: D.I. Yogyakarta & Surakarta)...\n');

  // ─────────────────────────────────────────────
  // 0. BERSIHKAN DATA SEED SEBELUMNYA (IDEMPOTEN)
  // ─────────────────────────────────────────────
  console.log('🧹 Membersihkan database agar seeder bersih dan konsisten...');
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');

    // 1. Logs, audit, trackings & scans (dependent child tables)
    await tx.$executeRawUnsafe('DELETE FROM checkpoints_log;');
    await tx.$executeRawUnsafe('DELETE FROM no_show_audit_logs;');
    await tx.$executeRawUnsafe('DELETE FROM trip_trackings;');
    await tx.$executeRawUnsafe('DELETE FROM trip_qr_sessions;');
    await tx.$executeRawUnsafe('DELETE FROM order_qr_sessions;');
    await tx.$executeRawUnsafe('DELETE FROM trip_reviews;');
    await tx.$executeRawUnsafe('DELETE FROM mitra_sanction_appeals;');
    await tx.$executeRawUnsafe('DELETE FROM mitra_sanctions;');

    // 2. Chat & Notifikasi
    await tx.$executeRawUnsafe('DELETE FROM messages;');
    await tx.$executeRawUnsafe('DELETE FROM conversations;');
    await tx.$executeRawUnsafe('DELETE FROM user_notifications;');
    await tx.$executeRawUnsafe('DELETE FROM notification_logs;');
    await tx.$executeRawUnsafe('DELETE FROM device_tokens;');
    await tx.$executeRawUnsafe('DELETE FROM notification_preferences;');
    await tx.$executeRawUnsafe('DELETE FROM push_subscriptions;');

    // 3. Orders, Items, Vouchers & Merchandise
    await tx.$executeRawUnsafe('DELETE FROM voucher_redemptions;');
    await tx.$executeRawUnsafe('DELETE FROM user_vouchers;');
    await tx.$executeRawUnsafe('DELETE FROM vouchers;');
    await tx.$executeRawUnsafe('DELETE FROM reward_transactions;');
    await tx.$executeRawUnsafe('DELETE FROM merchandise_redemptions;');
    await tx.$executeRawUnsafe('DELETE FROM merchandise_items;');
    await tx.$executeRawUnsafe('DELETE FROM payments;');
    await tx.$executeRawUnsafe('DELETE FROM item_orders;');
    await tx.$executeRawUnsafe('DELETE FROM orders;');

    // 4. Trips, Vehicles & Wallets
    await tx.$executeRawUnsafe('DELETE FROM trips;');
    await tx.$executeRawUnsafe('DELETE FROM vehicles;');
    await tx.$executeRawUnsafe('DELETE FROM wallet_transactions;');
    await tx.$executeRawUnsafe('DELETE FROM wallets;');

    // 5. Verifikasi & Pengguna
    await tx.$executeRawUnsafe('DELETE FROM verification_files;');
    await tx.$executeRawUnsafe('DELETE FROM verifications;');
    await tx.$executeRawUnsafe('DELETE FROM user_profiles;');
    await tx.$executeRawUnsafe('DELETE FROM users;');

    // 6. Master Data Wilayah & Pengaturan
    await tx.$executeRawUnsafe('DELETE FROM pickup_points;');
    await tx.$executeRawUnsafe('DELETE FROM cities;');
    await tx.$executeRawUnsafe('DELETE FROM regions;');
    await tx.$executeRawUnsafe('DELETE FROM pricing_settings;');
    await tx.$executeRawUnsafe('DELETE FROM banners;');
    await tx.$executeRawUnsafe('DELETE FROM social_links;');

    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
  });
  console.log('✅ Database berhasil dibersihkan.\n');

  const bannerImages = getAvailableBannerImages();

  // Baca file poligon GeoJSON lokal (jika ada)
  const diyPolygonPath = path.join(__dirname, 'data', 'diy-polygon.json');
  const soloPolygonPath = path.join(__dirname, 'data', 'solo-polygon.json');
  const diyPolygon = fs.existsSync(diyPolygonPath) ? fs.readFileSync(diyPolygonPath, 'utf8') : null;
  const soloPolygon = fs.existsSync(soloPolygonPath) ? fs.readFileSync(soloPolygonPath, 'utf8') : null;

  // ─────────────────────────────────────────────
  // 1. REGIONS (AGLOMERASI: D.I. YOGYAKARTA & SURAKARTA)
  // ─────────────────────────────────────────────
  console.log('🌍 Seeding Regions (D.I. Yogyakarta & Surakarta)...');

  const regionJogja = await prisma.region.create({
    data: {
      name: 'D.I. Yogyakarta',
      code: 'JOG',
      pricePerKm: 2500,
      isActive: true,
      latitude: -7.7953473,
      longitude: 110.3672845,
      radiusKm: 40,
      boundaryPolygon: diyPolygon,
    },
  });
  console.log(`✅ Region Jogja dibuat: ${regionJogja.name} (${regionJogja.code}) [Batas Poligon Lengkap Provinsi]`);

  const regionSolo = await prisma.region.create({
    data: {
      name: 'Surakarta',
      code: 'SOC',
      pricePerKm: 2500,
      isActive: true,
      latitude: -7.5692,
      longitude: 110.8284,
      radiusKm: 30,
      boundaryPolygon: soloPolygon,
    },
  });
  console.log(`✅ Region Solo dibuat: ${regionSolo.name} (${regionSolo.code}) [Batas Poligon Kota/Kawasan]`);

  // ─────────────────────────────────────────────
  // 2. CITIES
  // ─────────────────────────────────────────────
  console.log('\n🏙️  Seeding Cities...');

  const jogjaCity = await prisma.city.create({
    data: { name: 'D.I. Yogyakarta', province: 'DI Yogyakarta' },
  });
  console.log(`✅ City dibuat: ${jogjaCity.name}`);

  const soloCity = await prisma.city.create({
    data: { name: 'Surakarta', province: 'Jawa Tengah' },
  });
  console.log(`✅ City dibuat: ${soloCity.name}`);

  // ─────────────────────────────────────────────
  // 3. USERS
  // ─────────────────────────────────────────────
  console.log('\n📝 Seeding Users...');

  const defaultPasswordHash = await bcrypt.hash('Admin@12345', 10);
  const regionalPasswordHash = await bcrypt.hash('Regional@12345', 10);
  const operatorPasswordHash = await bcrypt.hash('Operator@12345', 10);
  const mitraPasswordHash = await bcrypt.hash('Mitra@12345', 10);
  const customerPasswordHash = await bcrypt.hash('Customer@12345', 10);

  // Super Admin
  const admin = await prisma.user.create({
    data: {
      name: 'Super Admin',
      email: 'admin@nebeng.com',
      phone: '081200000000',
      password: defaultPasswordHash,
      role: Role.admin,
      status: UserStatus.active,
      statusVerification: VerificationStatus.approved,
    },
  });
  console.log(`✅ Super Admin dibuat: ${admin.email}`);

  // Regional Admin Jogja (Mencakup seluruh D.I. Yogyakarta)
  const regionalAdminJogja = await prisma.user.create({
    data: {
      name: 'Regional Admin D.I. Yogyakarta',
      email: 'regional.jogja@nebeng.com',
      phone: '081200000001',
      password: regionalPasswordHash,
      role: Role.regional,
      status: UserStatus.active,
      statusVerification: VerificationStatus.approved,
      regionId: regionJogja.id,
    },
  });
  console.log(`✅ Regional Admin Jogja dibuat: ${regionalAdminJogja.email} (Area: D.I. Yogyakarta)`);

  // Regional Admin Solo
  const regionalAdminSolo = await prisma.user.create({
    data: {
      name: 'Regional Admin Surakarta',
      email: 'regional.solo@nebeng.com',
      phone: '081200000009',
      password: regionalPasswordHash,
      role: Role.regional,
      status: UserStatus.active,
      statusVerification: VerificationStatus.approved,
      regionId: regionSolo.id,
    },
  });
  console.log(`✅ Regional Admin Solo dibuat: ${regionalAdminSolo.email} (Area: Surakarta)`);

  // Operator Pos Jogja
  const operatorJogja = await prisma.user.create({
    data: {
      name: 'Operator Pos Giwangan (Jogja)',
      email: 'operator.jogja@nebeng.com',
      phone: '081200000002',
      password: operatorPasswordHash,
      role: Role.operator,
      status: UserStatus.active,
      statusVerification: VerificationStatus.approved,
      regionId: regionJogja.id,
    },
  });
  console.log(`✅ Operator Pos Jogja dibuat: ${operatorJogja.email}`);

  // Operator Pos Solo
  const operatorSolo = await prisma.user.create({
    data: {
      name: 'Operator Pos Tirtonadi (Solo)',
      email: 'operator.solo@nebeng.com',
      phone: '081200000012',
      password: operatorPasswordHash,
      role: Role.operator,
      status: UserStatus.active,
      statusVerification: VerificationStatus.approved,
      regionId: regionSolo.id,
    },
  });
  console.log(`✅ Operator Pos Solo dibuat: ${operatorSolo.email}`);

  // Mitra Jogja
  const mitraJogja = await prisma.user.create({
    data: {
      name: 'Budi Santoso (Mitra Jogja)',
      email: 'mitra.jogja@nebeng.com',
      phone: '081200000003',
      password: mitraPasswordHash,
      role: Role.mitra,
      status: UserStatus.active,
      statusVerification: VerificationStatus.approved,
      regionId: regionJogja.id,
    },
  });
  console.log(`✅ Mitra Jogja dibuat: ${mitraJogja.email}`);

  // Mitra Solo
  const mitraSolo = await prisma.user.create({
    data: {
      name: 'Agus Prasetyo (Mitra Solo)',
      email: 'mitra.solo@nebeng.com',
      phone: '081200000010',
      password: mitraPasswordHash,
      role: Role.mitra,
      status: UserStatus.active,
      statusVerification: VerificationStatus.approved,
      regionId: regionSolo.id,
    },
  });
  console.log(`✅ Mitra Solo dibuat: ${mitraSolo.email}`);

  // Customer Jogja
  const customerJogja = await prisma.user.create({
    data: {
      name: 'Andi Pratama (Customer Jogja)',
      email: 'customer.jogja@nebeng.com',
      phone: '081200000004',
      password: customerPasswordHash,
      role: Role.customer,
      status: UserStatus.active,
      statusVerification: VerificationStatus.approved,
      regionId: regionJogja.id,
      rewardPoints: 1000,
    },
  });
  console.log(`✅ Customer Jogja dibuat: ${customerJogja.email}`);

  // Customer Solo
  const customerSolo = await prisma.user.create({
    data: {
      name: 'Dewi Lestari (Customer Solo)',
      email: 'customer.solo@nebeng.com',
      phone: '081200000011',
      password: customerPasswordHash,
      role: Role.customer,
      status: UserStatus.active,
      statusVerification: VerificationStatus.approved,
      regionId: regionSolo.id,
      rewardPoints: 1000,
    },
  });
  console.log(`✅ Customer Solo dibuat: ${customerSolo.email}`);

  // ─────────────────────────────────────────────
  // 4. PICKUP POINTS (TERMASUK BANDARA ADISUTJIPTO)
  // ─────────────────────────────────────────────
  console.log('\n📍 Seeding Pickup Points (Pos Jogja & Solo)...');

  // Jogja Pickup Points
  const pickupPointJogja1 = await prisma.pickupPoint.create({
    data: {
      regionId: regionJogja.id,
      cityId: jogjaCity.id,
      operatorId: operatorJogja.id,
      name: 'Terminal Giwangan',
      address: 'Jl. Imogiri Timur No.1, Giwangan, Umbulharjo, Kota Yogyakarta',
      latitude: -7.8154,
      longitude: 110.3875,
      qrCodePos: generateQr('POS'),
      isActive: true,
    },
  });
  console.log(`✅ Pickup Point Jogja 1 dibuat: ${pickupPointJogja1.name}`);

  const pickupPointJogja2 = await prisma.pickupPoint.create({
    data: {
      regionId: regionJogja.id,
      cityId: jogjaCity.id,
      operatorId: operatorJogja.id,
      name: 'Terminal Jombor',
      address: 'Jl. Magelang Km.6, Jombor Lor, Mlati, Sleman',
      latitude: -7.7489,
      longitude: 110.3456,
      qrCodePos: generateQr('POS'),
      isActive: true,
    },
  });
  console.log(`✅ Pickup Point Jogja 2 dibuat: ${pickupPointJogja2.name}`);

  const pickupPointJogja3 = await prisma.pickupPoint.create({
    data: {
      regionId: regionJogja.id,
      cityId: jogjaCity.id,
      operatorId: operatorJogja.id,
      name: 'Stasiun Tugu Yogyakarta',
      address: 'Jl. Margo Utomo No.1, Sosromenduran, Gedong Tengen, Yogyakarta',
      latitude: -7.7892,
      longitude: 110.3635,
      qrCodePos: generateQr('POS'),
      isActive: true,
    },
  });
  console.log(`✅ Pickup Point Jogja 3 dibuat: ${pickupPointJogja3.name}`);

  // Bandar Udara Adisutjipto (Valid di dalam Poligon D.I. Yogyakarta!)
  const pickupPointJogja4 = await prisma.pickupPoint.create({
    data: {
      regionId: regionJogja.id,
      cityId: jogjaCity.id,
      operatorId: operatorJogja.id,
      name: 'Bandar Udara Adisutjipto',
      address: 'Jl. Raya Solo KM.9, Maguwoharjo, Kec. Depok, Kabupaten Sleman, D.I. Yogyakarta',
      latitude: -7.7933061,
      longitude: 110.4268095,
      qrCodePos: generateQr('POS'),
      isActive: true,
    },
  });
  console.log(`✅ Pickup Point Jogja 4 dibuat: ${pickupPointJogja4.name} (Valid di D.I. Yogyakarta)`);

  // Solo Pickup Points
  const pickupPointSolo1 = await prisma.pickupPoint.create({
    data: {
      regionId: regionSolo.id,
      cityId: soloCity.id,
      operatorId: operatorSolo.id,
      name: 'Terminal Tirtonadi',
      address: 'Jl. Gajah Mada No.1, Banjarsari, Kota Surakarta',
      latitude: -7.5456,
      longitude: 110.8212,
      qrCodePos: generateQr('POS'),
      isActive: true,
    },
  });
  console.log(`✅ Pickup Point Solo 1 dibuat: ${pickupPointSolo1.name}`);

  const pickupPointSolo2 = await prisma.pickupPoint.create({
    data: {
      regionId: regionSolo.id,
      cityId: soloCity.id,
      operatorId: operatorSolo.id,
      name: 'Stasiun Solo Balapan',
      address: 'Jl. Wolter Monginsidi No.112, Kestalan, Banjarsari, Surakarta',
      latitude: -7.5614,
      longitude: 110.8345,
      qrCodePos: generateQr('POS'),
      isActive: true,
    },
  });
  console.log(`✅ Pickup Point Solo 2 dibuat: ${pickupPointSolo2.name}`);

  // ─────────────────────────────────────────────
  // 5. VEHICLES
  // ─────────────────────────────────────────────
  console.log('\n🚗 Seeding Vehicles...');

  const vehicleJogja = await prisma.vehicle.create({
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

  const vehicleSolo = await prisma.vehicle.create({
    data: {
      userId: mitraSolo.id,
      type: 'mobil',
      model: 'Toyota Innova',
      plateNumber: 'AD 5678 EF',
      color: 'Hitam Metalik',
      capacitySeats: 6,
      maxWeightCapacityKg: 300,
    },
  });
  console.log(`✅ Vehicle Solo dibuat: ${vehicleSolo.model} (${vehicleSolo.plateNumber})`);

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
    await prisma.pricingSetting.create({ data: pricing });
    console.log(`✅ Pricing dibuat: ${pricing.serviceType} - ${pricing.size || 'default'}`);
  }

  // ─────────────────────────────────────────────
  // 7. TRIPS (Jadwal besok agar aktif dan tidak auto-expire / kena sanksi cron)
  // ─────────────────────────────────────────────
  console.log('\n🚀 Seeding Trips (Jadwal Besok agar aktif & aman dari auto-expire cron)...');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  const departureDate = new Date(`${yyyy}-${mm}-${dd}T12:00:00.000Z`);
  const departureTimeJogja = new Date('1970-01-01T08:00:00.000Z');
  const departureTimeSolo = new Date('1970-01-01T10:00:00.000Z');

  // Trip Jogja (Terminal Giwangan -> Bandar Udara Adisutjipto)
  const tripJogja = await prisma.trip.create({
    data: {
      mitraId: mitraJogja.id,
      vehicleId: vehicleJogja.id,
      originPointId: pickupPointJogja1.id,
      destinationPointId: pickupPointJogja4.id,
      vehicleType: 'mobil',
      departureDate,
      departureTime: departureTimeJogja,
      price: 50000,
      seatTotal: 4,
      seatAvailable: 3,
      maxWeightCapacityKg: 200,
      remainingWeightCapacityKg: 200,
      qrCodeTrip: generateQr('TRIP'),
      status: TripStatus.scheduled,
      serviceType: ServiceType.mobil,
    },
  });
  console.log(`✅ Trip Jogja dibuat: ${pickupPointJogja1.name} → ${pickupPointJogja4.name}`);

  // Trip Solo (Terminal Tirtonadi -> Stasiun Solo Balapan)
  const tripSolo = await prisma.trip.create({
    data: {
      mitraId: mitraSolo.id,
      vehicleId: vehicleSolo.id,
      originPointId: pickupPointSolo1.id,
      destinationPointId: pickupPointSolo2.id,
      vehicleType: 'mobil',
      departureDate,
      departureTime: departureTimeSolo,
      price: 45000,
      seatTotal: 6,
      seatAvailable: 5,
      maxWeightCapacityKg: 300,
      remainingWeightCapacityKg: 300,
      qrCodeTrip: generateQr('TRIP'),
      status: TripStatus.scheduled,
      serviceType: ServiceType.mobil,
    },
  });
  console.log(`✅ Trip Solo dibuat: ${pickupPointSolo1.name} → ${pickupPointSolo2.name}`);

  // Trip Jogja Selesai (Riwayat untuk Pengujian Dashboard Mitra)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 2);
  const tripJogjaCompleted = await prisma.trip.create({
    data: {
      mitraId: mitraJogja.id,
      vehicleId: vehicleJogja.id,
      originPointId: pickupPointJogja1.id,
      destinationPointId: pickupPointJogja4.id,
      vehicleType: 'mobil',
      departureDate: yesterday,
      departureTime: departureTimeJogja,
      price: 50000,
      seatTotal: 4,
      seatAvailable: 3,
      maxWeightCapacityKg: 200,
      remainingWeightCapacityKg: 200,
      qrCodeTrip: generateQr('TRIP'),
      status: TripStatus.completed,
      serviceType: ServiceType.mobil,
    },
  });
  console.log(`✅ Trip Jogja Selesai (Completed) dibuat untuk riwayat mitra`);

  // ─────────────────────────────────────────────
  // 8. ORDERS
  // ─────────────────────────────────────────────
  console.log('\n🎫 Seeding Orders...');

  const orderJogja = await prisma.order.create({
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
      readinessStatus: 'ready',
      status: OrderStatus.paid,
      escrowStatus: EscrowStatus.held,
    },
  });
  console.log(`✅ Order Jogja dibuat: Passenger x1 (Rp 50.000)`);

  const orderSolo = await prisma.order.create({
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
      readinessStatus: 'ready',
      status: OrderStatus.paid,
      escrowStatus: EscrowStatus.held,
    },
  });
  console.log(`✅ Order Solo dibuat: Passenger x1 (Rp 45.000)`);

  const orderJogjaCompleted = await prisma.order.create({
    data: {
      tripId: tripJogjaCompleted.id,
      customerId: customerJogja.id,
      type: 'passenger',
      seatsBooked: 1,
      totalItemsCount: 0,
      totalWeightKg: 0,
      totalPrice: 50000,
      adminFeePercentage: 10,
      qrCodeTicket: generateQr('TKT'),
      readinessStatus: 'ready',
      status: OrderStatus.completed,
      escrowStatus: EscrowStatus.released,
    },
  });

  await prisma.tripReview.create({
    data: {
      tripId: tripJogjaCompleted.id,
      reviewerId: customerJogja.id,
      revieweeId: mitraJogja.id,
      rating: 5,
      comment: 'Perjalanan sangat nyaman dan aman, driver ramah dan tepat waktu!',
    },
  });
  console.log(`✅ Order Jogja Selesai & Review (Rating 5) berhasil dibuat`);

  // ─────────────────────────────────────────────
  // 9. WALLETS & TRANSACTIONS
  // ─────────────────────────────────────────────
  console.log('\n💳 Seeding Wallets & Transactions...');

  const adminWallet = await prisma.wallet.create({
    data: { userId: admin.id, balance: 1000000, heldEscrowBalance: 0 },
  });

  const mitraWalletJogja = await prisma.wallet.create({
    data: { userId: mitraJogja.id, balance: 500000, heldEscrowBalance: 45000 },
  });

  const mitraWalletSolo = await prisma.wallet.create({
    data: { userId: mitraSolo.id, balance: 500000, heldEscrowBalance: 40500 },
  });

  await prisma.wallet.create({
    data: { userId: customerJogja.id, balance: 200000, heldEscrowBalance: 0 },
  });

  await prisma.wallet.create({
    data: { userId: customerSolo.id, balance: 200000, heldEscrowBalance: 0 },
  });

  // Wallet transactions for orders
  await prisma.walletTransaction.create({
    data: {
      walletId: mitraWalletJogja.id,
      orderId: orderJogja.id,
      amount: 45000,
      type: TransactionType.escrow_hold,
      description: `Escrow hold untuk order #${orderJogja.id}`,
    },
  });

  await prisma.walletTransaction.create({
    data: {
      walletId: adminWallet.id,
      orderId: orderJogja.id,
      amount: 5000,
      type: TransactionType.credit,
      description: `Admin fee dari order #${orderJogja.id}`,
    },
  });

  await prisma.walletTransaction.create({
    data: {
      walletId: mitraWalletSolo.id,
      orderId: orderSolo.id,
      amount: 40500,
      type: TransactionType.escrow_hold,
      description: `Escrow hold untuk order #${orderSolo.id}`,
    },
  });

  await prisma.walletTransaction.create({
    data: {
      walletId: adminWallet.id,
      orderId: orderSolo.id,
      amount: 4500,
      type: TransactionType.credit,
      description: `Admin fee dari order #${orderSolo.id}`,
    },
  });

  // Payments
  await prisma.payment.create({
    data: {
      orderId: orderJogja.id,
      paymentGateway: 'XENDIT_DUMMY',
      transactionId: generateQr('TRX'),
      amount: 50000,
      status: 'success',
    },
  });

  await prisma.payment.create({
    data: {
      orderId: orderSolo.id,
      paymentGateway: 'XENDIT_DUMMY',
      transactionId: generateQr('TRX'),
      amount: 45000,
      status: 'success',
    },
  });
  console.log(`✅ Wallets & transaksi escrow berhasil di-seed`);

  // ─────────────────────────────────────────────
  // 10. BANNERS (MENGGUNAKAN GAMBAR DARI FOLDER)
  // ─────────────────────────────────────────────
  console.log('\n🎨 Seeding Banners (menggunakan file dari uploads/banners)...');

  const bannersData = [
    {
      title: 'Promo Spesial Jogja - Solo: Diskon s/d 25%',
      imageUrl: bannerImages[0] || 'http://localhost:3000/uploads/banners/banner-1.jpg',
      linkUrl: '/customer/vouchers',
      isActive: true,
      targetRole: null,
    },
    {
      title: 'Bonus Insentif Mitra Area Jogja & Solo',
      imageUrl: bannerImages[1] || bannerImages[0] || 'http://localhost:3000/uploads/banners/banner-2.jpg',
      linkUrl: '/mitra/trips',
      isActive: true,
      targetRole: Role.mitra,
    },
    {
      title: 'Kirim Paket Kilat Jogja - Solo Aman & Cepat',
      imageUrl: bannerImages[2] || bannerImages[0] || 'http://localhost:3000/uploads/banners/banner-3.jpg',
      linkUrl: '/customer/search',
      isActive: true,
      targetRole: Role.customer,
    },
  ];

  for (const b of bannersData) {
    const created = await prisma.banner.create({ data: b });
    console.log(`✅ Banner dibuat: ${created.title} (Image: ${created.imageUrl})`);
  }

  // ─────────────────────────────────────────────
  // 11. MERCHANDISE ITEMS (MENGGUNAKAN GAMBAR DARI FOLDER)
  // ─────────────────────────────────────────────
  console.log('\n🎁 Seeding Merchandise Items (menggunakan file dari uploads/banners)...');

  const merchandiseData = [
    {
      name: 'T-Shirt Eksklusif Nebeng Jogja-Solo',
      description: 'T-shirt katun combed 30s premium dengan sablon logo Nebeng edisi Jogja-Solo',
      pointsRequired: 1000,
      stock: 50,
      imageUrl: bannerImages[3] || bannerImages[0],
      isActive: true,
    },
    {
      name: 'Tote Bag Canvas Nebeng',
      description: 'Tote bag kanvas tebal ramah lingkungan untuk menemani perjalanan harian Anda',
      pointsRequired: 500,
      stock: 100,
      imageUrl: bannerImages[4] || bannerImages[1] || bannerImages[0],
      isActive: true,
    },
    {
      name: 'Tumbler Stainless Nebeng Explorer',
      description: 'Tumbler tahan panas & dingin 500ml edisi perjalanan Nebeng rute Jogja-Solo',
      pointsRequired: 750,
      stock: 40,
      imageUrl: bannerImages[5] || bannerImages[2] || bannerImages[0],
      isActive: true,
    },
    {
      name: 'Topi Komunitas Nebeng Heritage',
      description: 'Topi baseball casual bordir Nebeng Squad berkualitas tinggi',
      pointsRequired: 350,
      stock: 60,
      imageUrl: bannerImages[6] || bannerImages[0],
      isActive: true,
    },
  ];

  const createdMerchandises: any[] = [];
  for (const m of merchandiseData) {
    const item = await prisma.merchandiseItem.create({ data: m });
    createdMerchandises.push(item);
    console.log(`✅ Merchandise dibuat: ${item.name} (${item.pointsRequired} poin, Image: ${item.imageUrl})`);
  }

  // Seed sample redemption for Customer Jogja
  await prisma.merchandiseRedemption.create({
    data: {
      userId: customerJogja.id,
      merchandiseId: createdMerchandises[1].id, // Tote Bag
      pointsSpent: 500,
      recipientName: 'Andi Pratama',
      recipientPhone: '081200000004',
      pickupPosId: pickupPointJogja1.id,
      status: RedemptionStatus.ready_at_pos,
    },
  });
  console.log(`✅ Sample penukaran merchandise dibuat untuk ${customerJogja.name}`);

  // ─────────────────────────────────────────────
  // 12. VOUCHERS & USER VOUCHERS
  // ─────────────────────────────────────────────
  console.log('\n🎟️  Seeding Vouchers & User Vouchers...');

  const now = new Date();
  const pastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const next60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const voucherList = [
    {
      code: 'NEBENGJOGJA',
      title: 'Diskon 25% Penumpang Jogja-Solo',
      description: 'Potongan 25% maksimal Rp 15.000 untuk perjalanan rute Jogja dan Solo',
      claimType: VoucherClaimType.direct_platform,
      appliesTo: OrderType.passenger,
      discountType: DiscountType.percentage,
      discountValue: 25,
      maxDiscountAmount: 15000,
      minOrderAmount: 30000,
      usageLimit: 100,
      usagePerUserLimit: 2,
      validFrom: pastDay,
      validUntil: next30Days,
      isActive: true,
    },
    {
      code: 'KIRIMHEMAT',
      title: 'Kirim Barang Flat Rp 10.000',
      description: 'Potongan langsung Rp 10.000 untuk pengiriman paket antar pos Jogja-Solo',
      claimType: VoucherClaimType.direct_platform,
      appliesTo: OrderType.parcel,
      discountType: DiscountType.fixed_amount,
      discountValue: 10000,
      maxDiscountAmount: 10000,
      minOrderAmount: 20000,
      usageLimit: 50,
      usagePerUserLimit: 1,
      validFrom: pastDay,
      validUntil: next30Days,
      isActive: true,
    },
    {
      code: 'NEBENGHEMAT',
      title: 'Voucher Flat Rp 15.000 Semua Layanan',
      description: 'Potongan langsung Rp 15.000 berlaku untuk penumpang & paket area Jogja-Solo',
      claimType: VoucherClaimType.direct_platform,
      appliesTo: null,
      discountType: DiscountType.fixed_amount,
      discountValue: 15000,
      maxDiscountAmount: 15000,
      minOrderAmount: 35000,
      usageLimit: 100,
      usagePerUserLimit: 2,
      validFrom: pastDay,
      validUntil: next30Days,
      isActive: true,
    },
    {
      code: 'KODEBARU',
      title: 'Klaim Kode Diskon 50% Pengguna Baru',
      description: 'Klaim dengan memasukkan kode KODEBARU untuk diskon 50% hingga Rp 20.000',
      claimType: VoucherClaimType.code_redemption,
      appliesTo: null,
      discountType: DiscountType.percentage,
      discountValue: 50,
      maxDiscountAmount: 20000,
      minOrderAmount: 25000,
      usageLimit: 200,
      usagePerUserLimit: 1,
      validFrom: pastDay,
      validUntil: next60Days,
      isActive: true,
    },
  ];

  const createdVouchers: any[] = [];
  for (const v of voucherList) {
    const created = await prisma.voucher.create({ data: v });
    createdVouchers.push(created);
    console.log(`✅ Voucher dibuat: [${created.code}] ${created.title}`);
  }

  // Claim vouchers for Customer Jogja & Solo
  await prisma.userVoucher.create({
    data: {
      userId: customerJogja.id,
      voucherId: createdVouchers[0].id, // NEBENGJOGJA
    },
  });

  await prisma.userVoucher.create({
    data: {
      userId: customerJogja.id,
      voucherId: createdVouchers[2].id, // NEBENGHEMAT
    },
  });

  await prisma.userVoucher.create({
    data: {
      userId: customerSolo.id,
      voucherId: createdVouchers[0].id, // NEBENGJOGJA
    },
  });

  await prisma.userVoucher.create({
    data: {
      userId: customerSolo.id,
      voucherId: createdVouchers[1].id, // KIRIMHEMAT
    },
  });
  console.log(`✅ User Vouchers berhasil di-klaim untuk Customer Jogja dan Solo`);

  // ─────────────────────────────────────────────
  // 13. USER PROFILES
  // ─────────────────────────────────────────────
  console.log('\n👤 Seeding User Profiles...');

  await prisma.userProfile.create({
    data: {
      userId: mitraJogja.id,
      ktpNumber: '3471000000000001',
      fullNameKtp: 'Budi Santoso',
      addressKtp: 'Jl. Malioboro No.1, Danurejan, Yogyakarta',
      bankName: 'BCA',
      bankAccountNumber: '1234567890',
      bankAccountHolder: 'Budi Santoso',
    },
  });

  await prisma.userProfile.create({
    data: {
      userId: mitraSolo.id,
      ktpNumber: '3374000000000001',
      fullNameKtp: 'Agus Prasetyo',
      addressKtp: 'Jl. Slamet Riyadi No.1, Laweyan, Surakarta',
      bankName: 'BRI',
      bankAccountNumber: '0987654321',
      bankAccountHolder: 'Agus Prasetyo',
    },
  });

  await prisma.userProfile.create({
    data: {
      userId: customerJogja.id,
      ktpNumber: '3471000000000002',
      fullNameKtp: 'Andi Pratama',
      addressKtp: 'Jl. Kaliurang Km.5, Depok, Sleman, D.I. Yogyakarta',
      bankName: 'Mandiri',
      bankAccountNumber: '1122334455',
      bankAccountHolder: 'Andi Pratama',
    },
  });

  await prisma.userProfile.create({
    data: {
      userId: customerSolo.id,
      ktpNumber: '3374000000000002',
      fullNameKtp: 'Dewi Lestari',
      addressKtp: 'Jl. Urip Sumoharjo No.15, Jebres, Surakarta',
      bankName: 'BNI',
      bankAccountNumber: '5566778899',
      bankAccountHolder: 'Dewi Lestari',
    },
  });
  console.log(`✅ Profiles KTP & Bank Mitra & Customer berhasil dibuat`);

  // ─────────────────────────────────────────────
  // 14. REWARD TRANSACTIONS
  // ─────────────────────────────────────────────
  console.log('\n⭐ Seeding Reward Transactions...');

  await prisma.rewardTransaction.create({
    data: {
      userId: customerJogja.id,
      points: 1000,
      type: RewardType.earn,
      description: 'Bonus poin registrasi awal customer Jogja',
    },
  });

  await prisma.rewardTransaction.create({
    data: {
      userId: customerSolo.id,
      points: 1000,
      type: RewardType.earn,
      description: 'Bonus poin registrasi awal customer Solo',
    },
  });
  console.log(`✅ Reward transaction dibuat untuk masing-masing customer (1000 poin)`);

  // ─────────────────────────────────────────────
  // 15. ORDER QR SESSION
  // ─────────────────────────────────────────────
  console.log('\n🔐 Seeding Order QR Sessions...');

  const tokenExpiry = new Date();
  tokenExpiry.setHours(tokenExpiry.getHours() + 48);

  await prisma.orderQrSession.create({
    data: {
      orderId: orderJogja.id,
      qrToken: orderJogja.qrCodeTicket,
      scanPhase: ScanType.checkin_origin,
      isUsed: false,
      expiredAt: tokenExpiry,
    },
  });

  await prisma.orderQrSession.create({
    data: {
      orderId: orderSolo.id,
      qrToken: orderSolo.qrCodeTicket,
      scanPhase: ScanType.checkin_origin,
      isUsed: false,
      expiredAt: tokenExpiry,
    },
  });
  console.log(`✅ Order QR Sessions berhasil dibuat untuk tiket Jogja dan Solo`);

  // ─────────────────────────────────────────────
  // 16. SOCIAL LINKS
  // ─────────────────────────────────────────────
  console.log('\n🌐 Seeding Social Links...');

  const socialLinks = [
    {
      platform: 'Instagram',
      url: 'https://instagram.com/nebeng.id',
      logoUrl: 'instagram',
      iconType: 'preset',
      orderIndex: 0,
      isActive: true,
    },
    {
      platform: 'WhatsApp',
      url: 'https://wa.me/6281200000000',
      logoUrl: 'whatsapp',
      iconType: 'preset',
      orderIndex: 1,
      isActive: true,
    },
    {
      platform: 'TikTok',
      url: 'https://tiktok.com/@nebeng.id',
      logoUrl: 'tiktok',
      iconType: 'preset',
      orderIndex: 2,
      isActive: true,
    },
    {
      platform: 'YouTube',
      url: 'https://youtube.com/@nebeng',
      logoUrl: 'youtube',
      iconType: 'preset',
      orderIndex: 3,
      isActive: true,
    },
  ];

  for (const s of socialLinks) {
    await prisma.socialLink.create({ data: s });
    console.log(`✅ Social Link dibuat: ${s.platform} (${s.url})`);
  }

  // ─────────────────────────────────────────────
  // RINGKASAN
  // ─────────────────────────────────────────────
  console.log('\n' + '='.repeat(55));
  console.log('🎉 SEEDING SELESAI DENGAN DATA AGLOMERASI JOGJA - SOLO TERKINI!');
  console.log('='.repeat(55));
  console.log('\n📋 DAFTAR KREDENSIAL LOGIN:');
  console.log('─'.repeat(55));
  console.log(`👑 Super Admin:`);
  console.log(`   Email: ${admin.email}`);
  console.log(`   Pass : Admin@12345`);
  console.log('');
  console.log(`👨‍💼 Regional Admin D.I. Yogyakarta:`);
  console.log(`   Email: ${regionalAdminJogja.email}`);
  console.log(`   Pass : Regional@12345`);
  console.log(`   Area : Seluruh Provinsi D.I. Yogyakarta (Sleman, Bantul, Kota, Kulon Progo)`);
  console.log('');
  console.log(`👨‍💼 Regional Admin Solo:`);
  console.log(`   Email: ${regionalAdminSolo.email}`);
  console.log(`   Pass : Regional@12345`);
  console.log(`   Area : Surakarta`);
  console.log('');
  console.log(`👷 Operator Pos Jogja (Giwangan):`);
  console.log(`   Email: ${operatorJogja.email}`);
  console.log(`   Pass : Operator@12345`);
  console.log('');
  console.log(`👷 Operator Pos Solo (Tirtonadi):`);
  console.log(`   Email: ${operatorSolo.email}`);
  console.log(`   Pass : Operator@12345`);
  console.log('');
  console.log(`🚗 Mitra Jogja:`);
  console.log(`   Email: ${mitraJogja.email}`);
  console.log(`   Pass : Mitra@12345`);
  console.log(`   Mobil: ${vehicleJogja.model} (${vehicleJogja.plateNumber})`);
  console.log('');
  console.log(`🚗 Mitra Solo:`);
  console.log(`   Email: ${mitraSolo.email}`);
  console.log(`   Pass : Mitra@12345`);
  console.log(`   Mobil: ${vehicleSolo.model} (${vehicleSolo.plateNumber})`);
  console.log('');
  console.log(`👤 Customer Jogja:`);
  console.log(`   Email: ${customerJogja.email}`);
  console.log(`   Pass : Customer@12345`);
  console.log(`   Poin : 1.000 | Voucher Aktif: 2`);
  console.log('');
  console.log(`👤 Customer Solo:`);
  console.log(`   Email: ${customerSolo.email}`);
  console.log(`   Pass : Customer@12345`);
  console.log(`   Poin : 1.000 | Voucher Aktif: 2`);
  console.log('─'.repeat(55));
  console.log('\n📍 POS RESMI JOGJA TERSEDIA:');
  console.log(`   - ${pickupPointJogja1.name} (Bantul/Kota)`);
  console.log(`   - ${pickupPointJogja2.name} (Sleman)`);
  console.log(`   - ${pickupPointJogja3.name} (Kota Yogyakarta)`);
  console.log(`   - ${pickupPointJogja4.name} (Sleman - Adisutjipto) ✈️`);
  console.log('─'.repeat(55));
}

main()
  .catch((e) => {
    console.error('❌ Seeding gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
