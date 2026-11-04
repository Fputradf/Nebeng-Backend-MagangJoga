import { VehicleMapper } from '../../vehicles/mappers/vehicle.mapper';

export class TripMapper {
  static toResponse(trip: any) {
    if (!trip) return null;

    return {
      id: trip.id.toString(),
      mitraId: trip.mitraId ? trip.mitraId.toString() : null,
      vehicleId: trip.vehicleId ? trip.vehicleId.toString() : null,
      originPointId: trip.originPointId ? trip.originPointId.toString() : null,
      destinationPointId: trip.destinationPointId
        ? trip.destinationPointId.toString()
        : null,
      vehicleType: trip.vehicleType,
      departureDate: trip.departureDate,
      departureTime: trip.departureTime,
      price: Number(trip.price),
      seatTotal: Number(trip.seatTotal),
      seatAvailable: Number(trip.seatAvailable),
      maxWeightCapacityKg: Number(trip.maxWeightCapacityKg),
      remainingWeightCapacityKg: Number(trip.remainingWeightCapacityKg),
      qrCodeTrip: trip.qrCodeTrip,
      status: trip.status,
      mapsPolyline: trip.mapsPolyline ?? null,
      distanceKm: trip.distanceKm ? Number(trip.distanceKm) : null,
      estimatedDurationMinutes: trip.estimatedDurationMinutes
        ? Number(trip.estimatedDurationMinutes)
        : null,
      estimatedDurationFormatted: trip.estimatedDurationMinutes
        ? `${Math.floor(Number(trip.estimatedDurationMinutes) / 60) > 0 ? `${Math.floor(Number(trip.estimatedDurationMinutes) / 60)} Jam ` : ''}${Number(trip.estimatedDurationMinutes) % 60} Menit`
        : null,
      totalEscrow: trip.orders
        ? trip.orders.reduce((sum: number, order: any) => {
            if (order.status !== 'cancelled') {
              return sum + Number(order.totalPrice || 0);
            }
            return sum;
          }, 0)
        : undefined,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      mitra: trip.mitra
        ? {
            id: trip.mitra.id.toString(),
            name: trip.mitra.name,
            phone: trip.mitra.phone,
            avatar: trip.mitra.avatar ?? null,
            homeRegionId: trip.mitra.regionId ? trip.mitra.regionId.toString() : null,
            homeRegionName: trip.mitra.region?.name ?? null,
            rating:
              trip.mitra.reviewsReceived && trip.mitra.reviewsReceived.length > 0
                ? Number(
                    (
                      trip.mitra.reviewsReceived.reduce(
                        (acc: number, r: any) => acc + (Number(r.rating) || 0),
                        0,
                      ) / trip.mitra.reviewsReceived.length
                    ).toFixed(1),
                  )
                : trip.mitra.rating != null
                ? Number(Number(trip.mitra.rating).toFixed(1))
                : null,
            totalReviews:
              trip.mitra.reviewsReceived != null
                ? trip.mitra.reviewsReceived.length
                : trip.mitra.totalReviews != null
                ? Number(trip.mitra.totalReviews)
                : 0,
          }
        : undefined,
      vehicle: trip.vehicle
        ? VehicleMapper.toResponse(trip.vehicle)
        : undefined,
      originPoint: trip.originPoint
        ? {
            id: trip.originPoint.id.toString(),
            name: trip.originPoint.name,
            qrCodePos: trip.originPoint.qrCodePos,
            address: trip.originPoint.address,
            regionId: trip.originPoint.regionId ? trip.originPoint.regionId.toString() : null,
            regionName: trip.originPoint.region?.name ?? null,
            lat: trip.originPoint.latitude
              ? Number(trip.originPoint.latitude)
              : null,
            lng: trip.originPoint.longitude
              ? Number(trip.originPoint.longitude)
              : null,
          }
        : undefined,
      destinationPoint: trip.destinationPoint
        ? {
            id: trip.destinationPoint.id.toString(),
            name: trip.destinationPoint.name,
            qrCodePos: trip.destinationPoint.qrCodePos,
            address: trip.destinationPoint.address,
            regionId: trip.destinationPoint.regionId ? trip.destinationPoint.regionId.toString() : null,
            regionName: trip.destinationPoint.region?.name ?? null,
            lat: trip.destinationPoint.latitude
              ? Number(trip.destinationPoint.latitude)
              : null,
            lng: trip.destinationPoint.longitude
              ? Number(trip.destinationPoint.longitude)
              : null,
          }
        : undefined,
      serviceType: trip.serviceType,
      orders: trip.orders
        ? trip.orders.map((o: any) => ({
            id: o.id.toString(),
            customerId: o.customerId ? o.customerId.toString() : null,
            type: o.type,
            seatsBooked: o.seatsBooked,
            totalItemsCount: o.totalItemsCount,
            totalWeightKg: o.totalWeightKg ? Number(o.totalWeightKg) : 0,
            totalPrice: Number(o.totalPrice || 0),
            status: o.status,
            escrowStatus: o.escrowStatus,
            qrCodeTicket: o.qrCodeTicket,
            customer: o.customer
              ? {
                  id: o.customer.id.toString(),
                  name: o.customer.name,
                  phone: o.customer.phone,
                  avatar: o.customer.avatar ?? null,
                  email: o.customer.email,
                }
              : null,
            passengers: o.passengers
              ? o.passengers.map((p: any) => ({
                  id: p.id.toString(),
                  name: p.name,
                  phone: p.phone,
                  seatNumber: p.seatNumber,
                  isContact: p.isContact,
                }))
              : [],
            checkpointsLogs: o.checkpointsLogs
              ? o.checkpointsLogs.map((l: any) => ({
                  id: l.id.toString(),
                  scanType: l.scanType,
                  createdAt: l.createdAt,
                }))
              : [],
          }))
        : undefined,
    };
  }

  static toResponseList(trips: any[]): any[] {
    if (!Array.isArray(trips)) return [];
    return trips.map((t) => this.toResponse(t));
  }
}
