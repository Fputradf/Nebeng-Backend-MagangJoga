# 🌱 Seeder Instructions (Region Aglomerasi: D.I. Yogyakarta & Surakarta)

## Cara Menjalankan Seeder

### 1. Pastikan Database Berjalan
```bash
# Pastikan MySQL/MariaDB server berjalan
# Default: localhost:3306
```

### 2. Jalankan Seeder
```bash
cd C:\Users\Fput\Documents\Nebeng\Nebeng-Backend
node -r dotenv/config run-seed.js
```
ATAU:
```bash
npx prisma db seed
```

---

## 📋 Data yang Dibuat oleh Seeder

### 1. Akun Pengguna (Users)
| Role | Nama | Email | Password | Wilayah Operasional |
|------|------|-------|----------|---------------------|
| Super Admin | Super Admin | `admin@nebeng.com` | `Admin@12345` | Global |
| Regional Admin Jogja | Regional Admin D.I. Yogyakarta | `regional.jogja@nebeng.com` | `Regional@12345` | Seluruh D.I. Yogyakarta (Sleman, Bantul, Kota, Kulon Progo) |
| Regional Admin Solo | Regional Admin Surakarta | `regional.solo@nebeng.com` | `Regional@12345` | Surakarta / Solo Raya |
| Operator Pos Jogja | Operator Pos Giwangan | `operator.jogja@nebeng.com` | `Operator@12345` | Pos Terminal Giwangan |
| Operator Pos Solo | Operator Pos Tirtonadi | `operator.solo@nebeng.com` | `Operator@12345` | Pos Terminal Tirtonadi |
| Mitra Jogja | Budi Santoso | `mitra.jogja@nebeng.com` | `Mitra@12345` | D.I. Yogyakarta (Mobil Avanza AB 1234 CD) |
| Mitra Solo | Agus Prasetyo | `mitra.solo@nebeng.com` | `Mitra@12345` | Surakarta (Mobil Innova AD 5678 EF) |
| Customer Jogja | Andi Pratama | `customer.jogja@nebeng.com` | `Customer@12345` | D.I. Yogyakarta (1.000 Poin, 2 Voucher Aktif) |
| Customer Solo | Dewi Lestari | `customer.solo@nebeng.com` | `Customer@12345` | Surakarta (1.000 Poin, 2 Voucher Aktif) |

### 2. Regions (Batas Poligon Resmi)
- **D.I. Yogyakarta (`JOG`)**: Poligon GeoJSON resmi mencakup seluruh 5 kabupaten/kota di DIY (Tarif dasar: Rp 2.500/km, Radius: 40 km).
- **Surakarta (`SOC`)**: Poligon GeoJSON resmi mencakup area Kota Surakarta (Tarif dasar: Rp 2.500/km, Radius: 30 km).

### 3. Pickup Points (Titik Pos Resmi)
- **Area D.I. Yogyakarta:**
  - `Terminal Giwangan` (Bantul/Kota)
  - `Terminal Jombor` (Sleman)
  - `Stasiun Tugu Yogyakarta` (Kota Yogyakarta)
  - `Bandar Udara Adisutjipto` (Sleman) ✈️
- **Area Surakarta:**
  - `Terminal Tirtonadi`
  - `Stasiun Solo Balapan`

### 4. Kendaraan (Vehicles)
- Mitra Jogja: **Toyota Avanza** (`AB 1234 CD`), Silver, 4 Kursi, Max 200 kg
- Mitra Solo: **Toyota Innova** (`AD 5678 EF`), Hitam Metalik, 6 Kursi, Max 300 kg

### 5. Banners & Merchandise (Gambar Diambil dari Folder `uploads/banners`)
- **Banners:** Promo Jogja - Solo (All), Insentif Mitra (Mitra), Kirim Paket Kilat (Customer)
- **Merchandise:** T-Shirt Eksklusif (1000 Poin), Tote Bag Canvas (500 Poin), Tumbler Stainless (750 Poin), Topi Komunitas (350 Poin)
- **Sample Redemption:** 1 pesanan penukaran Tote Bag status `ready_at_pos` untuk Andi Pratama.

### 6. Vouchers & User Vouchers
- `NEBENGJOGJA` (Diskon 25%), `KIRIMHEMAT` (Flat Rp 10.000), `NEBENGHEMAT` (Flat Rp 15.000), `KODEBARU` (Diskon 50%).
- Customer Jogja & Solo masing-masing otomatis mengklaim 2 voucher aktif.

### 7. Social Links
- Instagram, WhatsApp, TikTok, YouTube resmi platform Nebeng.
