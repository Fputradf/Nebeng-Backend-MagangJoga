# GPS Real-time Tracking Implementation Summary

## 📋 Overview
Implementasi GPS Real-time Tracking dengan OpenStreetMap untuk platform Nebeng Backend.

## ✅ Yang Sudah Diterapkan

### 1. **Update Prisma Schema**
**File**: `prisma/schema.prisma`

#### Enhanced `TripTracking` Model:
- Menambahkan field baru:
  - `altitude` (Decimal) - Tinggi dari sea level
  - `speed` (Decimal) - Kecepatan (km/h)
  - `heading` (Decimal) - Arah (derajat 0-360)
  - `accuracy` (Decimal) - Akurasi GPS (meter)
- Menambahkan index pada `[tripId, recordedAt]` untuk query lebih cepat

#### New `OsmRouteCache` Model:
- Untuk caching hasil route calculation dari OSRM
- Field:
  - `originLat`, `originLng`, `destLat`, `destLng`
  - `distanceKm`, `durationMinutes`
  - `polyline` (encoded geometry)
  - `cachedAt`, `expiresAt`
- Unique constraint pada kombinasi koordinat
- Index pada `expiresAt` untuk cleanup cepat

---

### 2. **OpenStreetMap Service (OSM Service)**
**File**: `src/modules/tracking/osm.service.ts`

#### Fitur:
1. **Geocoding** (Nominatim API)
   - `geocode(address)` - Alamat → Lat/Long
   - `reverseGeocode(lat, lng)` - Lat/Long → Alamat

2. **Route Calculation** (OSRM API)
   - `calculateRoute(origin, dest)` - Hitung jarak & durasi rute
   - Caching otomatis (default 7 hari)
   - Return polyline untuk rendering di map frontend

3. **Distance Calculation**
   - Haversine formula untuk hitung jarak antar dua titik

4. **ETA Calculation**
   - Hitung ETA berdasarkan jarak & kecepatan rata-rata

5. **Auto Cleanup**
   - `cleanupExpiredCache()` - Hapus cache yang expired

---

### 3. **Enhanced Tracking Service**
**File**: `src/modules/tracking/tracking.service.ts`

#### Method Baru:
1. `calculateRoute()` - Hitung rute via OSRM
2. `getEstimatedTimeOfArrival(tripId)` - Hitung ETA trip
3. `checkGeofencing(tripId)` - Cek apakah armada dekat pos tujuan
4. `detectRouteDeviation(tripId)` - Deteksi penyimpangan dari rute
5. `cleanupOldTrackingData()` - Hapus data GPS > 3 bulan
6. `geocodeAddress()` - Geocoding alamat
7. `reverseGeocode()` - Reverse geocoding

#### Enhancement Existing:
- `validateAndSaveLocation()` - Sekarang support altitude, speed, heading, accuracy
- `getTripHistory()` - Return data GPS lengkap

---

### 4. **Enhanced Tracking Gateway**
**File**: `src/modules/tracking/tracking.gateway.ts`

#### WebSocket Events Baru:
1. `routeCalculated` - Broadcast saat rute dihitung
2. `etaUpdated` - Broadcast saat ETA diperbarui
3. `geofenceAlert` - Alert saat armada dekat pos tujuan
4. `deviationAlert` - Alert saat armada menyimpang dari rute

#### Enhancement Existing:
- `locationUpdated` - Sekarang broadcast altitude, speed, heading, accuracy

---

### 5. **GPS Controller**
**File**: `src/modules/tracking/tracking.controller.ts`

#### API Endpoints:

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| GET | `/api/tracking/route` | Public | Hitung rute antar dua titik |
| GET | `/api/tracking/eta/:tripId` | JWT | Get ETA trip |
| GET | `/api/tracking/geofence/:tripId` | JWT | Cek geofencing trip |
| GET | `/api/tracking/deviation/:tripId` | JWT | Deteksi deviasi rute |
| GET | `/api/tracking/history/:tripId` | JWT | Get history GPS trip |
| GET | `/api/tracking/geocode` | Public | Geocoding alamat |
| GET | `/api/tracking/reverse-geocode` | Public | Reverse geocoding |
| POST | `/api/tracking/cleanup` | Admin | Manual trigger cleanup |

---

### 6. **Auto-Cleanup Cron Job**
**File**: `src/modules/tracking/tracking.cron.ts`

#### Schedule:
1. **GPS Data Cleanup** - Setiap hari jam 2:00 AM
   - Hapus `TripTracking` yang > 3 bulan (configurable via env)

2. **Route Cache Cleanup** - Setiap hari jam 3:00 AM
   - Hapus `OsmRouteCache` yang expired

#### Manual Trigger:
- POST `/api/tracking/cleanup` (Admin only)

---

### 7. **Environment Variables**
**File**: `.env.example`

```env
# OpenStreetMap Configuration
OSM_NOMINATIM_API_URL="https://nominatim.openstreetmap.org"
OSRM_API_URL="https://router.project-osrm.org"
OSM_USER_AGENT="NebengApp/1.0"

# GPS Configuration
GPS_UPDATE_INTERVAL_SECONDS=30
GPS_RETENTION_MONTHS=3
GPS_DEVIATION_THRESHOLD_METERS=500
GEOFENCE_RADIUS_METERS=1000
ROUTE_CACHE_DAYS=7
```

---

### 8. **RBAC Guards & Decorators**
**Files Baru**:
- `src/modules/auth/guards/roles.guard.ts`
- `src/modules/auth/decorators/roles.decorator.ts`

#### Fitur:
- `@Roles(Role.admin, Role.regional)` decorator
- `RolesGuard` untuk protection endpoint berdasarkan role

---

## 📝 Database Migration

**Status**: Schema sudah diupdate, tapi migrasi belum dijalankan karena database tidak aktif.

**Command untuk migrasi** (jalankan saat database aktif):
```bash
npx prisma migrate dev --name add_gps_tracking_enhancements
```

**Command untuk generate Prisma Client** (sudah dijalankan):
```bash
npx prisma generate
```

---

## 🧪 Testing

### Manual Testing API:

1. **Calculate Route**:
```bash
curl "http://localhost:3000/api/tracking/route?originLat=-6.2088&originLng=106.8456&destLat=-6.1751&destLng=106.8650"
```

2. **Geocode Address**:
```bash
curl "http://localhost:3000/api/tracking/geocode?address=Monas,Jakarta"
```

3. **Reverse Geocode**:
```bash
curl "http://localhost:3000/api/tracking/reverse-geocode?lat=-6.2088&lng=106.8456"
```

4. **Get ETA** (dengan JWT token):
```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/tracking/eta/1"
```

5. **Check Geofencing** (dengan JWT token):
```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/tracking/geofence/1"
```

---

## 🚀 Langkah Selanjutnya

### Untuk Backend:
1. Jalankan database MySQL
2. Jalankan migrasi: `npx prisma migrate dev`
3. Update `.env` dengan konfigurasi OSM
4. Jalankan server: `npm run start:dev`

### Untuk Frontend:
1. Implementasi OpenStreetMap / Leaflet map
2. Display polyline rute di map
3. Real-time update GPS location
4. Display ETA countdown
5. Geofencing alert UI
6. Deviation alert UI

---

## 📊 Flow GPS Tracking

### 1. Mitra Update Location (WebSocket)
```
Mitra App → WebSocket: updateLocation
  ↓
TrackingGateway.handleUpdateLocation()
  ↓
TrackingService.validateAndSaveLocation()
  ↓
TripTracking.create() (ke database)
  ↓
Broadcast: locationUpdated ke customer
```

### 2. Customer Request ETA
```
Customer App → GET /api/tracking/eta/:tripId
  ↓
TrackingController.getETA()
  ↓
TrackingService.getEstimatedTimeOfArrival()
  ↓
  - Get latest GPS location
  - Calculate route via OSRM (with cache)
  - Calculate ETA based on speed
  ↓
Return: distanceRemaining, etaMinutes, estimatedArrivalTime
```

### 3. Geofencing Check
```
Backend → Check distance current location to destination
  ↓
If distance < GEOFENCE_RADIUS_METERS
  ↓
Broadcast: geofenceAlert via WebSocket
  ↓
Customer receive notification
```

---

## 🔒 Security Notes

1. Public endpoints (geocode, reverse-geocode, route) tidak butuh auth untuk flexibility
2. Endpoints trip-related (eta, geofence, deviation) butuh JWT auth
3. Cleanup endpoint hanya untuk admin/regional
4. Rate limiting sudah ada via ThrottlerGuard (300 req/60s)

---

## 📦 Dependencies Added

- `@nestjs/schedule` - Untuk cron job auto-cleanup

---

## ✨ Summary

Implementasi GPS Real-time Tracking dengan OpenStreetMap sudah **COMPLETED** untuk backend:

✅ Schema update (TripTracking + OsmRouteCache)
✅ OSM Service (Nominatim + OSRM integration)
✅ Enhanced Tracking Service (Route, ETA, Geofencing, Deviation)
✅ Enhanced Tracking Gateway (WebSocket events)
✅ GPS Controller (API endpoints)
✅ Auto-cleanup Cron Job (GPS data 3 bulan, Route cache 7 hari)
✅ RBAC Guards & Decorators
✅ Environment configuration
✅ Build successful

**Next**: Frontend implementation & database migration!
