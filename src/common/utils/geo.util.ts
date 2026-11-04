/**
 * Utility Geospasial untuk Perhitungan Jarak dan Validasi Poligon Wilayah
 */

export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

/**
 * Menghitung jarak antara 2 titik koordinat dalam Kilometer menggunakan rumus Haversine
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (angle: number) => (angle * Math.PI) / 180;
  const R = 6371; // Radius bumi dalam KM

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Mengecek apakah sebuah titik [latitude, longitude] berada di dalam poligon
 * Menggunakan algoritma Ray-Casting standar Geospasial
 */
export function isPointInPolygon(
  point: LatLngPoint,
  boundaryData: any,
): boolean {
  if (!boundaryData) return true;

  try {
    let polygon = boundaryData;
    if (typeof boundaryData === 'string') {
      polygon = JSON.parse(boundaryData);
    }

    // Ekstrak ring koordinat dari GeoJSON format yang beragam
    let rings: number[][][] = [];

    if (Array.isArray(polygon)) {
      if (polygon.length > 0 && Array.isArray(polygon[0])) {
        if (typeof polygon[0][0] === 'number') {
          // Format sederhana: [[lat, lng], [lat, lng], ...]
          // Kita anggap sebagai 1 ring
          rings = [polygon];
        } else if (Array.isArray(polygon[0][0])) {
          // Format GeoJSON Polygon coordinates: [[[lng, lat], ...]]
          rings = polygon;
        }
      }
    } else if (polygon && typeof polygon === 'object') {
      if (polygon.type === 'Feature' && polygon.geometry) {
        polygon = polygon.geometry;
      }
      if (polygon.type === 'Polygon' && Array.isArray(polygon.coordinates)) {
        rings = polygon.coordinates;
      } else if (
        polygon.type === 'MultiPolygon' &&
        Array.isArray(polygon.coordinates)
      ) {
        // Untuk multipolygon, gabungkan pengecekan untuk setiap polygon
        return polygon.coordinates.some((polyRings: number[][][]) =>
          checkPointInRings(point, polyRings),
        );
      }
    }

    if (rings.length === 0) {
      return true;
    }

    return checkPointInRings(point, rings);
  } catch (err) {
    console.error('[geo.util] Gagal memvalidasi point in polygon:', err);
    return true; // Fallback jika parsing gagal
  }
}

/**
 * Mengecek titik terhadap rings (outer ring index 0, holes index 1..n)
 */
function checkPointInRings(point: LatLngPoint, rings: number[][][]): boolean {
  if (!rings || rings.length === 0) return true;

  // Cek outer ring pertama
  const outerRing = rings[0];
  if (!outerRing || outerRing.length < 3) return true;

  const inOuter = rayCasting(point, outerRing);
  if (!inOuter) return false;

  // Jika ada inner rings (holes), titik tidak boleh berada di dalam hole
  for (let i = 1; i < rings.length; i++) {
    if (rayCasting(point, rings[i])) {
      return false; // Berada di dalam lubang (hole)
    }
  }

  return true;
}

/**
 * Algoritma Ray Casting untuk 1 ring tertutup
 */
function rayCasting(point: LatLngPoint, ring: number[][]): boolean {
  const { latitude: lat, longitude: lng } = point;
  let inside = false;

  // GeoJSON standar adalah [longitude, latitude]
  // Namun beberapa sistem menyimpan [latitude, longitude].
  // Kita deteksi otomatis berdasarkan urutan nilai tipikal Indonesia (Lat: -11 s/d 6, Lng: 95 s/d 141)
  const isLngLat = Math.abs(ring[0][0]) > 60 && Math.abs(ring[0][1]) <= 60;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p1 = ring[i];
    const p2 = ring[j];

    const xi = isLngLat ? p1[0] : p1[1]; // Longitude
    const yi = isLngLat ? p1[1] : p1[0]; // Latitude
    const xj = isLngLat ? p2[0] : p2[1]; // Longitude
    const yj = isLngLat ? p2[1] : p2[0]; // Latitude

    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Membuat GeoJSON Polygon lingkaran perkiraan dengan n sisi dari titik pusat & radius km
 */
export function generateCircularPolygon(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  pointsCount = 16,
) {
  const coordinates: [number, number][] = [];
  const earthRadius = 6371; // km

  for (let i = 0; i < pointsCount; i++) {
    const angle = (i * 360) / pointsCount;
    const rad = (angle * Math.PI) / 180;

    const latRad = (centerLat * Math.PI) / 180;
    const lngRad = (centerLng * Math.PI) / 180;

    const distRatio = radiusKm / earthRadius;

    const pointLatRad = Math.asin(
      Math.sin(latRad) * Math.cos(distRatio) +
        Math.cos(latRad) * Math.sin(distRatio) * Math.cos(rad),
    );

    const pointLngRad =
      lngRad +
      Math.atan2(
        Math.sin(rad) * Math.sin(distRatio) * Math.cos(latRad),
        Math.cos(distRatio) - Math.sin(latRad) * Math.sin(pointLatRad),
      );

    const pLat = (pointLatRad * 180) / Math.PI;
    const pLng = (pointLngRad * 180) / Math.PI;

    // GeoJSON format: [longitude, latitude]
    coordinates.push([Number(pLng.toFixed(6)), Number(pLat.toFixed(6))]);
  }

  // Tutup poligon dengan titik pertama
  coordinates.push(coordinates[0]);

  return {
    type: 'Polygon',
    coordinates: [coordinates],
  };
}

