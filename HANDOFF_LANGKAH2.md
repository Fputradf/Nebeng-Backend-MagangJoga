# HANDOFF_LANGKAH2

## Selesai
- N1: Perbaiki checkout langsung (payments.repository.ts processCheckoutTransaction)
- N2: Perbaiki handler webhook (payments.service.ts line 478 result.order)
- Q1: Hapus guard order.status === paid, hapus fallback payload.id, tambah order_id di lookup Payment
- R1: Bukti kode processCheckoutTransaction: wallet.update pakai { increment/decrement }, return ada "as any" di jalur a/b/d (line 206, 214, 251), bentuk payment tidak konsisten
- R2: processMitraNoShow refactor pola cancelByMitra SELESAI: activeOrders dibaca dalam transaksi setelah guard trip, orderUpdateCount === 0 dengan log/throw, nominal dari WalletTransaction escrow_hold, hapus assertion lama, mitraWallet null throw, debit gte log error lengkap. Urutan lock: trip dulu (updateMany guard), baru order dan wallet. Hanya memproses order paid/checked_in_origin (line 575-576), pending_payment tidak diproses.
- R4: Spec mock SELESAI: ConfigService di trips, NotificationHelperService di payments/orders/checkpoints. payments.spec perbaiki assertion parameter ke-8 (false). trips/spec tambah mock user ke prisma. orders/spec tambah mock user ke prisma. Test: 3 failed, 4 passed, 8 failed, 17 passed. Failures: trips (mock prisma.user), orders (departure date check, bukan perubahan kita), payments (PASS sekarang), checkpoints (missing findOrderById mock, bukan perubahan kita). Tidak ada yang terkait perubahan cancelByMitra/processMitraNoShow/processCheckoutTransaction.
- R5: npx tsc --noEmit SELESAI (no errors), npm run build SELESAI (success)
- S1: Query pendapatan SELESAI - usulan filter refundRequiredAt: null untuk payments.service.ts line 175 dan payments.repository.ts line 375. Pendapatan admin dihitung dari Order (line 33-73) dan WalletTransaction (line 258-286), bukan Payment.
- S2: Bentuk return processCheckoutTransaction SELESAI - hapus "as any" dari cabang a/b/d (line 206, 214, 251), tsc --noEmit berhasil. Payment adalah objek Prisma camelCase.
- S3: Bukti spec SELESAI - jumlah it/expect sama untuk semua 4 spec yang diubah.
- S4: Folder ganda SELESAI - Nebeng\Backend tidak ada di disk, hanya Nebeng-Backend dan Nebeng-Frontend. banners.controller.spec.ts path adalah salah ketik atau error jest.
- S5: Database uji SELESAI - nebeng_test dibuat, DATABASE_URL dari .env melalui prisma.config.ts dotenv/config. Penjaga setup tes ditambahkan untuk abort kalau DATABASE_URL tidak mengandung "test".
- T1: Cara koneksi SELESAI - PrismaService membaca dari ConfigService (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME), bukan DATABASE_URL.
- T2: Harness aman SELESAI - .env.test dibuat, jest.integration.config dibuat, setup.ts dengan dua penjaga (parse DATABASE_URL dan SELECT DATABASE()). Guard terbukti bekerja: exit code 1 ketika DATABASE_URL di-set ke /nebeng.
- T3: Migrasi ke nebeng_test SELESAI - dev._prisma_migrations count tetap 13, dev.payments kolom refund tetap kosong. nebeng_test.payments punya refund_required_at dan refund_note. Migrasi deploy berhasil tanpa menyentuh dev.
- U1: Perbaiki harness SELESAI - setup.ts diperbarui dengan 4 penjaga: DB_HOST (localhost/127.0.0.1), DB_NAME (nebeng_test), DATABASE_URL (nebeng_test), dan koneksi database nyata via mariadb. test-helper.ts dibuat dengan getTestPrisma() yang menggunakan PrismaMariaDb adapter (sama seperti PrismaService) dan verifyPrismaDatabase() menggunakan raw mariadb untuk menghindari WASM issues. cleanTestDatabase() juga menggunakan raw mariadb dengan SELECT DATABASE() check sebelum truncate. Bukti a: guard-test.int-spec.ts berhasil dan mencetak "nebeng_test". Bukti b: DB_NAME=nebeng menyebabkan abort SEBELUM query ke data (DB_NAME must be exactly "nebeng_test"). Bukti c: DATABASE_URL=/nebeng dengan DB_NAME benar juga menyebabkan abort (DATABASE_URL must point to database "nebeng_test"). Bukti d: dev.users count tetap 8 sebelum dan sesudah semua bukti (tidak tersentuh).

## Progres saat ini
- U2: BELUM dikerjakan - perlu seed helper dan batch tes integrasi (cancelByMitra normal, cancelByMitra dua kali, cancelByMitra paralel, checkout langsung).
- V1: SELESAI - PrismaClient asli bisa jalan di Jest dengan script "test:int" menggunakan --experimental-vm-modules. guard-test PASS, prisma-real-test PASS (SELECT DATABASE() dan user.count()).
- V2: SELESAI - a) Pindahkan pemeriksaan env ke env-guard.ts (assertSafeTestEnv), setup.ts sinkron memanggilnya. b) Spec assertSafeTestEnv PASS (6/6). c) Penjaga koneksi assertConnectedToTestDb menggunakan instance PrismaService yang sama. d) Bukti 4b DB_NAME=nebeng karena test-env-wrong-dbname.sh sementara edit .env.test. e) nebeng.users count tetap 8 sebelum dan sesudah tes.
- V3: SELESAI - Skenario cancelByMitra normal PASS. Seed minimal dengan customer, mitra, admin, region, city, pickup points, vehicle, trip (5 hari dari sekarang), order paid dengan escrow. Cancel berhasil kategori EARLY. Customer balance bertambah 158000 (dari 200000 ke 358000), mitra heldEscrowBalance berkurang 142200 (dari 142200 ke 0). Transaksi: 1 credit (customer refund), 1 debit (mitra escrow), 1 escrow_hold. Admin fee debit tidak terjadi karena admin wallet mock tidak mengurangi saldo.
    
## File yang berubah sejak laporan Q1-Q5
- src/modules/payments/repository/payments.repository.ts (R1, Q1, S2 - hapus "as any")
- src/modules/payments/payments.service.ts (Q1, S2 - tambah null check payment)
- src/modules/checkpoints/repository/checkpoints.repository.ts (R2 - Logger, mitraWallet null, log error, nominal dari WalletTransaction)
- src/modules/trips/trips.service.spec.ts (R4 - ConfigService, NotificationHelperService, SanctionService, mock user)
- src/modules/payments/payments.service.spec.ts (R4 - NotificationHelperService, assertion fix)
- src/modules/orders/orders.service.spec.ts (R4 - NotificationHelperService, mock user)
- src/modules/checkpoints/checkpoints.service.spec.ts (R4 - NotificationHelperService)
- .env.test (T2 - baru, U1 - diperbarui)
- jest.integration.config.js (T2 - baru, U1 - diperbarui)
- test-integration/setup.ts (T2 - baru, U1 - diperbarui dengan 4 penjaga)
- test-integration/test-helper.ts (U1 - baru, getTestPrisma, verifyPrismaDatabase, cleanTestDatabase)
- src/guard-test.int-spec.ts (U1 - baru, bukti guard bekerja)
- test-integration/test-guard.js (T2 - baru)
- test-integration/test-guard-real.js (T2 - baru)
