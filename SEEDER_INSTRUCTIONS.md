# 🌱 Seeder Instructions

## Cara Menjalankan Seeder

### 1. Pastikan Database Berjalan
```bash
# Pastikan MySQL/MariaDB server berjalan
# Default: localhost:3306
```

### 2. Jalankan Migrasi (Jika Belum)
```bash
cd C:\Users\Fput\Documents\Nebeng-Backend
npx prisma migrate dev
```

### 3. Jalankan Seeder (Rekomendasi)
```bash
cd C:\Users\Fput\Documents\Nebeng-Backend
node -r dotenv/config run-seed.js
```

ATAU
```bash
npx prisma db seed
```

---

## 📋 Data yang Dibuat oleh Seeder

### 1. Users (5 Akun)
| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@nebeng.com | Admin@12345 |
| Regional Admin | regional.jkt@nebeng.com | Regional@12345 |
| Operator Pos | operator.gambir@nebeng.com | Operator@12345 |
| Mitra | mitra@nebeng.com | Mitra@12345 |
| Customer | customer@nebeng.com | Customer@12345 |

### 2. Regions
- Jakarta (JKT)
  - Price per km: Rp 3.000
  - Center: -6.2088, 106.8456

### 3. Cities
- Jakarta (DKI Jakarta)
- Bandung (Jawa Barat)
- Surabaya (Jawa Timur)

### 4. Pickup Points
- Stasiun Gambir (Jakarta) - Origin
- Stasiun Hall Bandung (Bandung) - Destination

### 5. Vehicles
- Toyota Avanza (B 1234 CD)
  - Type: Mobil
  - Capacity: 4 kursi
  - Max weight: 200 kg

### 6. Pricing Settings
- Motor: Base Rp 5.000 + Rp 3.000/km
- Mobil: Base Rp 8.000 + Rp 3.000/km
- Barang (XXS-XL): Rp 10.000-50.000 + Rp 2.000/km + Rp 500/kg

### 7. Trip (1 Jam dari Sekarang)
- Route: Stasiun Gambir → Stasiun Hall Bandung
- Mitra: Budi Santoso
- Kendaraan: Toyota Avanza
- Jam: 1 jam dari sekarang
- Status: scheduled
- QR Trip: TRIP-XXXX
- Kursi: 4 tersedia

### 8. Order
- Customer: Andi Pratama
- Type: Passenger x1
- Harga: Rp 150.000
- Status: paid
- Escrow: held
- QR Ticket: TKT-XXXX

### 9. Wallets
- Mitra: Balance Rp 500.000, Escrow Rp 135.000
- Customer: Balance Rp 200.000
- Admin: Balance Rp 1.000.000

### 10. Merchandise Items
- T-Shirt Nebeng (1000 poin)
- Tote Bag Nebeng (500 poin)
- Voucher Diskon 10% (2000 poin)

### 11. Banners
- Promo Awal Tahun
- Diskon Mitra Baru

---

## 🧪 Testing Setelah Seeder

### Test Login Super Admin
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@nebeng.com",
    "password": "Admin@12345"
  }'
```

### Test Login Mitra
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "mitra@nebeng.com",
    "password": "Mitra@12345"
  }'
```

### Test Login Customer
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@nebeng.com",
    "password": "Customer@12345"
  }'
```

### Test Check-in Origin (Setelah Login sebagai Operator)
```bash
curl -X POST http://localhost:3000/api/checkpoints/scan \
  -H "Authorization: Bearer <operator_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "qrCodeTrip": "<TRIP_QR_FROM_SEEDER>",
    "qrCodeTicket": "<TICKET_QR_FROM_SEEDER>",
    "scanType": "checkin_origin"
  }'
```

---

## ⚠️ Catatan Penting

1. **Password** - Ganti password setelah login pertama untuk keamanan
2. **Trip Schedule** - Trip dijadwalkan 1 jam dari waktu seeder dijalankan
3. **Order Status** - Order sudah dalam status `paid` (siap untuk check-in origin)
4. **Escrow** - Dana sudah ditahan di escrow mitra (Rp 135.000 dari Rp 150.000)
5. **QR Codes** - QR codes di-generate secara random, cek di database setelah seeder selesai

---

## 🔄 Reset Database (Jika Ingin Ulang)

```bash
# Hapus semua data dan reset database
npx prisma migrate reset

# Jalankan seeder lagi
npx prisma db seed
```

---

## 📊 Cek Data Setelah Seeder

```sql
-- Cek users
SELECT id, name, email, role FROM users;

-- Cek trip
SELECT id, qrCodeTrip, departureDate, departureTime, status FROM trips;

-- Cek order
SELECT id, qrCodeTicket, type, status, escrowStatus FROM orders;

-- Cek wallets
SELECT userId, balance, heldEscrowBalance FROM wallets;
```
