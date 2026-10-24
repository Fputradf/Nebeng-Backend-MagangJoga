require('dotenv/config');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { PrismaClient } = require('./dist/generated/prisma/client');
const bcrypt = require('bcrypt');
const { randomBytes } = require('crypto');

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nebeng',
  connectionLimit: 5,
});

const prisma = new PrismaClient({ adapter });

// Helper functions
function generateQr(prefix) {
  const hex = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${hex}`;
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Calculate time 1 hour from now
function getOneHourFromNow() {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  return now;
}

async function main() {
  console.log('🌱 Memulai proses seeding lengkap...\n');

  try {
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
          role: 'admin',
          status: 'active',
          statusVerification: 'approved',
        },
      });
      console.log(`✅ Super Admin dibuat: ${admin.email}`);
    } else {
      console.log(`⚠️  Super Admin sudah ada: ${admin.email}`);
    }

    // Regional Admin
    let regionalAdmin = await prisma.user.findFirst({
      where: { role: 'regional' },
    });

    if (!regionalAdmin) {
      const hashedPassword = await bcrypt.hash('Regional@12345', 10);
      regionalAdmin = await prisma.user.create({
        data: {
          name: 'Regional Admin Jakarta',
          email: 'regional.jkt@nebeng.com',
          phone: '081200000001',
          password: hashedPassword,
          role: 'regional',
          status: 'active',
          statusVerification: 'approved',
        },
      });
      console.log(`✅ Regional Admin dibuat: ${regionalAdmin.email}`);
    } else {
      console.log(`⚠️  Regional Admin sudah ada: ${regionalAdmin.email}`);
    }

    // Operator Pos
    let operator = await prisma.user.findFirst({
      where: { role: 'operator' },
    });

    if (!operator) {
      const hashedPassword = await bcrypt.hash('Operator@12345', 10);
      operator = await prisma.user.create({
        data: {
          name: 'Operator Pos Gambir',
          email: 'operator.gambir@nebeng.com',
          phone: '081200000002',
          password: hashedPassword,
          role: 'operator',
          status: 'active',
          statusVerification: 'approved',
        },
      });
      console.log(`✅ Operator dibuat: ${operator.email}`);
    } else {
      console.log(`⚠️  Operator sudah ada: ${operator.email}`);
    }

    // Mitra
    let mitra = await prisma.user.findFirst({
      where: { role: 'mitra' },
    });

    if (!mitra) {
      const hashedPassword = await bcrypt.hash('Mitra@12345', 10);
      mitra = await prisma.user.create({
        data: {
          name: 'Budi Santoso',
          email: 'mitra@nebeng.com',
          phone: '081200000003',
          password: hashedPassword,
          role: 'mitra',
          status: 'active',
          statusVerification: 'approved',
        },
      });
      console.log(`✅ Mitra dibuat: ${mitra.email}`);
    } else {
      console.log(`⚠️  Mitra sudah ada: ${mitra.email}`);
    }

    // Customer
    let customer = await prisma.user.findFirst({
      where: { role: 'customer' },
    });

    if (!customer) {
      const hashedPassword = await bcrypt.hash('Customer@12345', 10);
      customer = await prisma.user.create({
        data: {
          name: 'Andi Pratama',
          email: 'customer@nebeng.com',
          phone: '081200000004',
          password: hashedPassword,
          role: 'customer',
          status: 'active',
          statusVerification: 'approved',
        },
      });
      console.log(`✅ Customer dibuat: ${customer.email}`);
    } else {
      console.log(`⚠️  Customer sudah ada: ${customer.email}`);
    }

    // ─────────────────────────────────────────────
    // 2. REGIONS
    // ─────────────────────────────────────────────
    console.log('\n🌍 Seeding Regions...');

    let region = await prisma.region.findFirst();

    if (!region) {
      region = await prisma.region.create({
        data: {
          name: 'Jakarta',
          code: 'JKT',
          pricePerKm: 3000,
          isActive: true,
          latitude: -6.2088,
          longitude: 106.8456,
          radiusKm: 20,
        },
      });
      console.log(`✅ Region dibuat: ${region.name}`);
    } else {
      console.log(`⚠️  Region sudah ada: ${region.name}`);
    }

    // Update regional admin region
    await prisma.user.update({
      where: { id: regionalAdmin.id },
      data: { regionId: region.id },
    });

    // ─────────────────────────────────────────────
    // 3. CITIES
    // ─────────────────────────────────────────────
    console.log('\n🏙️  Seeding Cities...');

    const cities = [
      { name: 'Jakarta', province: 'DKI Jakarta' },
      { name: 'Bandung', province: 'Jawa Barat' },
      { name: 'Surabaya', province: 'Jawa Timur' },
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

    const jakartaCity = await prisma.city.findFirst({
      where: { name: 'Jakarta' },
    });
    const bandungCity = await prisma.city.findFirst({
      where: { name: 'Bandung' },
    });

    if (!jakartaCity || !bandungCity) {
      throw new Error('Cities Jakarta dan Bandung harus ada');
    }

    // ─────────────────────────────────────────────
    // 4. PICKUP POINTS
    // ─────────────────────────────────────────────
    console.log('\n📍 Seeding Pickup Points...');

    let pickupPoint1 = await prisma.pickupPoint.findFirst({
      where: { name: 'Stasiun Gambir' },
    });

    if (!pickupPoint1) {
      pickupPoint1 = await prisma.pickupPoint.create({
        data: {
          regionId: region.id,
          cityId: jakartaCity.id,
          operatorId: operator.id,
          name: 'Stasiun Gambir',
          address: 'Jl. Medan Merdeka Barat No.1, Gambir, Jakarta Pusat',
          latitude: -6.175392,
          longitude: 106.827153,
          qrCodePos: generateQr('POS'),
          isActive: true,
        },
      });
      console.log(`✅ Pickup Point dibuat: ${pickupPoint1.name}`);
    } else {
      console.log(`⚠️  Pickup Point sudah ada: ${pickupPoint1.name}`);
    }

    let pickupPoint2 = await prisma.pickupPoint.findFirst({
      where: { name: 'Stasiun Hall Bandung' },
    });

    if (!pickupPoint2) {
      pickupPoint2 = await prisma.pickupPoint.create({
        data: {
          regionId: region.id,
          cityId: bandungCity.id,
          name: 'Stasiun Hall Bandung',
          address: 'Jl. Stasiun Hall No.1, Bandung',
          latitude: -6.917464,
          longitude: 107.619123,
          qrCodePos: generateQr('POS'),
          isActive: true,
        },
      });
      console.log(`✅ Pickup Point dibuat: ${pickupPoint2.name}`);
    } else {
      console.log(`⚠️  Pickup Point sudah ada: ${pickupPoint2.name}`);
    }

    // ─────────────────────────────────────────────
    // 5. VEHICLES
    // ─────────────────────────────────────────────
    console.log('\n🚗 Seeding Vehicles...');

    let vehicle = await prisma.vehicle.findFirst({
      where: { userId: mitra.id },
    });

    if (!vehicle) {
      vehicle = await prisma.vehicle.create({
        data: {
          userId: mitra.id,
          type: 'mobil',
          model: 'Toyota Avanza',
          plateNumber: 'B 1234 CD',
          color: 'Silver',
          capacitySeats: 4,
          maxWeightCapacityKg: 200,
        },
      });
      console.log(`✅ Vehicle dibuat: ${vehicle.model} (${vehicle.plateNumber})`);
    } else {
      console.log(`⚠️  Vehicle sudah ada: ${vehicle.model}`);
    }

    // ─────────────────────────────────────────────
    // 6. PRICING SETTINGS
    // ─────────────────────────────────────────────
    console.log('\n💰 Seeding Pricing Settings...');

    const pricingSettings = [
      {
        serviceType: 'motor',
        size: null,
        baseFare: 5000,
        farePerKm: 3000,
        farePerKg: null,
        maxWeightKg: null,
        adminFeePercentage: 10,
      },
      {
        serviceType: 'mobil',
        size: null,
        baseFare: 8000,
        farePerKm: 3000,
        farePerKg: null,
        maxWeightKg: null,
        adminFeePercentage: 10,
      },
      {
        serviceType: 'barang',
        size: 'xxs',
        baseFare: 10000,
        farePerKm: 2000,
        farePerKg: 500,
        maxWeightKg: 1,
        adminFeePercentage: 12,
      },
      {
        serviceType: 'barang',
        size: 'xs',
        baseFare: 15000,
        farePerKm: 2000,
        farePerKg: 500,
        maxWeightKg: 3,
        adminFeePercentage: 12,
      },
      {
        serviceType: 'barang',
        size: 's',
        baseFare: 20000,
        farePerKm: 2000,
        farePerKg: 500,
        maxWeightKg: 5,
        adminFeePercentage: 12,
      },
      {
        serviceType: 'barang',
        size: 'm',
        baseFare: 30000,
        farePerKm: 2000,
        farePerKg: 500,
        maxWeightKg: 10,
        adminFeePercentage: 12,
      },
      {
        serviceType: 'barang',
        size: 'l',
        baseFare: 40000,
        farePerKm: 2000,
        farePerKg: 500,
        maxWeightKg: 20,
        adminFeePercentage: 12,
      },
      {
        serviceType: 'barang',
        size: 'xl',
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

    let trip = await prisma.trip.findFirst({
      where: { mitraId: mitra.id },
    });

    if (!trip) {
      trip = await prisma.trip.create({
        data: {
          mitraId: mitra.id,
          vehicleId: vehicle.id,
          originPointId: pickupPoint1.id,
          destinationPointId: pickupPoint2.id,
          vehicleType: 'mobil',
          departureDate,
          departureTime,
          price: 150000,
          seatTotal: 4,
          seatAvailable: 4,
          maxWeightCapacityKg: 200,
          remainingWeightCapacityKg: 200,
          qrCodeTrip: generateQr('TRIP'),
          status: 'scheduled',
          serviceType: 'mobil',
        },
      });
      console.log(`✅ Trip dibuat: ${pickupPoint1.name} → ${pickupPoint2.name}`);
      console.log(`   Jam: ${departureTime.toLocaleTimeString('id-ID')}`);
    } else {
      console.log(`⚠️  Trip sudah ada untuk mitra ini`);
    }

    // ─────────────────────────────────────────────
    // 8. ORDERS
    // ─────────────────────────────────────────────
    console.log('\n🎫 Seeding Orders...');

    let order = await prisma.order.findFirst({
      where: { customerId: customer.id },
    });

    if (!order) {
      order = await prisma.order.create({
        data: {
          tripId: trip.id,
          customerId: customer.id,
          type: 'passenger',
          seatsBooked: 1,
          totalItemsCount: 0,
          totalWeightKg: 0,
          totalPrice: 150000,
          adminFeePercentage: 10,
          qrCodeTicket: generateQr('TKT'),
          otpClaim: null,
          readinessStatus: 'ready',
          status: 'paid',
          escrowStatus: 'held',
        },
      });
      console.log(`✅ Order dibuat: Passenger x1 (Rp 150.000)`);
    } else {
      // Update existing order to ensure it's in paid status
      order = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'paid',
          escrowStatus: 'held',
        },
      });
      console.log(`⚠️  Order sudah ada, status di-reset ke paid`);
    }

    // ─────────────────────────────────────────────
    // 9. WALLETS
    // ─────────────────────────────────────────────
    console.log('\n💳 Seeding Wallets...');

    // Wallet Mitra
    let mitraWallet = await prisma.wallet.findUnique({
      where: { userId: mitra.id },
    });

    if (!mitraWallet) {
      mitraWallet = await prisma.wallet.create({
        data: {
          userId: mitra.id,
          balance: 500000,
          heldEscrowBalance: 135000,
        },
      });
      console.log(`✅ Wallet Mitra dibuat: Balance Rp 500.000, Escrow Rp 135.000`);
    } else {
      console.log(`⚠️  Wallet Mitra sudah ada`);
    }

    // Wallet Customer
    let customerWallet = await prisma.wallet.findUnique({
      where: { userId: customer.id },
    });

    if (!customerWallet) {
      customerWallet = await prisma.wallet.create({
        data: {
          userId: customer.id,
          balance: 200000,
          heldEscrowBalance: 0,
        },
      });
      console.log(`✅ Wallet Customer dibuat: Balance Rp 200.000`);
    } else {
      console.log(`⚠️  Wallet Customer sudah ada`);
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

    // Escrow hold for mitra
    await prisma.walletTransaction.create({
      data: {
        walletId: mitraWallet.id,
        orderId: order.id,
        amount: 135000,
        type: 'escrow_hold',
        description: 'Escrow hold untuk order #' + order.id,
      },
    });

    // Admin fee credit
    await prisma.walletTransaction.create({
      data: {
        walletId: adminWallet.id,
        orderId: order.id,
        amount: 15000,
        type: 'credit',
        description: 'Admin fee dari order #' + order.id,
      },
    });

    console.log(`✅ Wallet transactions dibuat`);

    // ─────────────────────────────────────────────
    // 11. PAYMENTS
    // ─────────────────────────────────────────────
    console.log('\n💳 Seeding Payments...');

    // Delete existing payment for this order
    await prisma.payment.deleteMany({
      where: { orderId: order.id },
    });

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        paymentGateway: 'XENDIT_DUMMY',
        transactionId: generateQr('TRX'),
        amount: 150000,
        status: 'success',
      },
    });
    console.log(`✅ Payment dibuat: Rp 150.000 (Success)`);

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
        targetRole: 'mitra',
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

    // Profile Mitra
    let mitraProfile = await prisma.userProfile.findUnique({
      where: { userId: mitra.id },
    });

    if (!mitraProfile) {
      mitraProfile = await prisma.userProfile.create({
        data: {
          userId: mitra.id,
          ktpNumber: '3175000000000001',
          fullNameKtp: 'Budi Santoso',
          addressKtp: 'Jl. Sudirman No.1, Jakarta',
          bankName: 'BCA',
          bankAccountNumber: '1234567890',
          bankAccountHolder: 'Budi Santoso',
        },
      });
      console.log(`✅ Profile Mitra dibuat`);
    } else {
      console.log(`⚠️  Profile Mitra sudah ada`);
    }

    // Profile Customer
    let customerProfile = await prisma.userProfile.findUnique({
      where: { userId: customer.id },
    });

    if (!customerProfile) {
      customerProfile = await prisma.userProfile.create({
        data: {
          userId: customer.id,
          ktpNumber: '3175000000000002',
          fullNameKtp: 'Andi Pratama',
          addressKtp: 'Jl. Thamrin No.1, Jakarta',
          bankName: 'Mandiri',
          bankAccountNumber: '0987654321',
          bankAccountHolder: 'Andi Pratama',
        },
      });
      console.log(`✅ Profile Customer dibuat`);
    } else {
      console.log(`⚠️  Profile Customer sudah ada`);
    }

    // ─────────────────────────────────────────────
    // 15. REWARD TRANSACTIONS
    // ─────────────────────────────────────────────
    console.log('\n⭐ Seeding Reward Transactions...');

    // Give customer some reward points
    await prisma.user.update({
      where: { id: customer.id },
      data: { rewardPoints: 500 },
    });

    await prisma.rewardTransaction.create({
      data: {
        userId: customer.id,
        points: 500,
        type: 'earn',
        description: 'Bonus poin registrasi',
      },
    });

    console.log(`✅ Reward transaction dibuat: 500 poin untuk customer`);

    // ─────────────────────────────────────────────
    // 16. ORDER QR SESSION
    // ─────────────────────────────────────────────
    console.log('\n🔐 Seeding Order QR Sessions...');

    const tokenExpiry = new Date();
    tokenExpiry.setHours(tokenExpiry.getHours() + 48);

    await prisma.orderQrSession.create({
      data: {
        orderId: order.id,
        qrToken: order.qrCodeTicket,
        scanPhase: 'checkin_origin',
        isUsed: false,
        expiredAt: tokenExpiry,
      },
    });

    console.log(`✅ Order QR Session dibuat`);

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
    console.log(`👨‍💼 Regional Admin:`);
    console.log(`   Email: ${regionalAdmin.email}`);
    console.log(`   Pass: Regional@12345`);
    console.log('');
    console.log(`👷 Operator Pos:`);
    console.log(`   Email: ${operator.email}`);
    console.log(`   Pass: Operator@12345`);
    console.log('');
    console.log(`🚗 Mitra:`);
    console.log(`   Email: ${mitra.email}`);
    console.log(`   Pass: Mitra@12345`);
    console.log('');
    console.log(`👤 Customer:`);
    console.log(`   Email: ${customer.email}`);
    console.log(`   Pass: Customer@12345`);
    console.log('');
    console.log('─'.repeat(50));
    console.log(`🚀 TRIP INFO:`);
    console.log(`   Route: ${pickupPoint1.name} → ${pickupPoint2.name}`);
    console.log(`   Jam: ${departureTime.toLocaleTimeString('id-ID')}`);
    console.log(`   Status: scheduled (siap untuk check-in)`);
    console.log(`   QR Trip: ${trip.qrCodeTrip}`);
    console.log('');
    console.log(`🎫 ORDER INFO:`);
    console.log(`   Customer: ${customer.name}`);
    console.log(`   Type: Passenger x1`);
    console.log(`   Price: Rp 150.000`);
    console.log(`   Status: paid (escrow held)`);
    console.log(`   QR Ticket: ${order.qrCodeTicket}`);
    console.log('─'.repeat(50));
    console.log('\n⚠️  JANGAN LUPAN:');
    console.log('1. Ganti password setelah login pertama!');
    console.log('2. Trip dijadwalkan 1 jam dari sekarang');
    console.log('3. Order sudah dalam status paid (siap check-in)');
    console.log('4. Escrow sudah held di wallet mitra');
    console.log('');
  } catch (error) {
    console.error('❌ Seeding gagal:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
