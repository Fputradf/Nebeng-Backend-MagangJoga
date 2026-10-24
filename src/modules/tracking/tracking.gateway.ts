import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TrackingService } from './tracking.service';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt.guard';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'tracking',
})
export class TrackingGateway {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  constructor(private readonly trackingService: TrackingService) {}

  /**
   * Handle client connection
   */
  afterInit(server: Server) {
    this.logger.log('[TRACKING] WebSocket Gateway initialized on namespace: /tracking');
  }

  /**
   * Handle client disconnect
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`[TRACKING] Client disconnected: ${client.id}`);
  }

  /**
   * Handle client connection
   */
  handleConnection(client: Socket) {
    this.logger.log(`[TRACKING] Client connected: ${client.id}`);
  }

  /**
   * 1. Customer & Mitra bergabung ke Kamar Trip
   * Kamar ini mendengarkan posisi GPS langsung dan update Checkpoint pos
   */
  @SubscribeMessage('joinTripRoom')
  handleJoinTripRoom(
    @MessageBody('tripId') tripId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`[JOIN_TRIP] Client ${client.id} attempting to join trip: ${tripId}`);
    if (!tripId) {
      this.logger.error(`[JOIN_TRIP] Client ${client.id} failed: tripId is empty`);
      return { status: 'error', message: 'Parameter tripId wajib diisi.' };
    }
    const roomName = `trip_${tripId}`;
    client.join(roomName);
    this.logger.log(`[JOIN_TRIP] Client ${client.id} joined room: ${roomName} successfully`);
    this.logger.log(`[JOIN_TRIP] Client ${client.id} rooms: ${Array.from(client.rooms).join(', ')}`);
    return { event: 'joinedRoom', room: roomName };
  }

  /**
   * Alternative handler for frontend using 'joinTrip' event name
   */
  @SubscribeMessage('joinTrip')
  handleJoinTrip(
    @MessageBody('tripId') tripId: any,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`[JOIN_TRIP_ALT] Client ${client.id} attempting to join trip (alt): ${tripId} (type: ${typeof tripId})`);
    if (!tripId) {
      this.logger.error(`[JOIN_TRIP_ALT] Client ${client.id} failed: tripId is empty`);
      return { status: 'error', message: 'Parameter tripId wajib diisi.' };
    }

    // Convert to string first
    const tripIdStr = String(tripId);

    // Normalize tripId - if it already has 'trip_' prefix, don't add it again
    const roomName = tripIdStr.startsWith('trip_') ? tripIdStr : `trip_${tripIdStr}`;

    client.join(roomName);
    this.logger.log(`[JOIN_TRIP_ALT] Client ${client.id} joined room: ${roomName} successfully`);
    return { event: 'joinedRoom', room: roomName };
  }

  /**
   * 2. Admin Regional bergabung ke Kamar Wilayah
   * Kamar ini mendengarkan seluruh pergerakan armada di wilayah tersebut
   */
  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('joinRegionRoom')
  handleJoinRegionRoom(
    @MessageBody('regionId') regionId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (!regionId) {
      return { status: 'error', message: 'Parameter regionId wajib diisi.' };
    }
    const roomName = `region_${regionId}`;
    client.join(roomName);
    this.logger.log(
      `Admin ${client.id} bergabung ke kamar wilayah: ${roomName}`,
    );
    return { event: 'joinedRegionRoom', room: roomName };
  }

  /**
   * 3. Mitra mengirim koordinat GPS terbaru secara live
   */
  @SubscribeMessage('updateLocation')
  async handleUpdateLocation(
    @ConnectedSocket() client: any,
    @MessageBody() dto: any,
  ) {
    try {
      const mitraUserId = client.user?.id || client.user?.sub || 'demo_user';
      this.logger.log(`[UPDATE_LOCATION] Client ${client.id} (User: ${mitraUserId}) sending GPS for trip: ${dto.tripId}`);
      this.logger.log(`[UPDATE_LOCATION] Raw DTO: ${JSON.stringify(dto)}`);

      // Check if DTO has required fields
      if (!dto.tripId || dto.latitude === undefined || dto.longitude === undefined) {
        this.logger.error(`[UPDATE_LOCATION] Invalid GPS data - missing required fields`);
        return { status: 'error', message: 'Missing required fields: tripId, latitude, longitude' };
      }

      // Handle both longitude and longtitude (typo in DTO)
      const longitude = dto.longitude ?? dto.longtitude ?? (dto as any).longtitude;

      this.logger.log(`[UPDATE_LOCATION] GPS Data - Lat: ${dto.latitude}, Lng: ${longitude}, Speed: ${dto.speed}`);

      // Normalize DTO for service (use longitude not longtitude)
      const normalizedDto = {
        ...dto,
        longitude: longitude,
        longtitude: longitude, // Keep both for compatibility
      };

      // Save to database (simplified version without validation)
      try {
        await this.trackingService.validateAndSaveLocation(
          String(mitraUserId),
          normalizedDto,
        );
      } catch (err: any) {
        this.logger.warn(`[UPDATE_LOCATION] Validation failed (continuing anyway): ${err.message}`);
      }

      const roomName = `trip_${dto.tripId}`;

      // Siarkan ke seluruh penumpang di trip tersebut
      const payload = {
        tripId: dto.tripId,
        latitude: dto.latitude,
        longitude: longitude,
        altitude: dto.altitude ?? 0,
        speed: dto.speed ?? 0,
        heading: dto.heading ?? 0,
        accuracy: dto.accuracy ?? 0,
        timestamp: new Date().toISOString(),
      };

      this.server.to(roomName).emit('locationUpdated', payload);
      this.logger.log(`[UPDATE_LOCATION] Broadcasted to room: ${roomName} with ${Object.keys(payload).length} fields`);

      return { status: 'success' };
    } catch (error: any) {
      this.logger.error(`[UPDATE_LOCATION] Error: ${error.message}`);
      this.logger.error(`[UPDATE_LOCATION] Error stack: ${error.stack}`);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * Alternative handler for frontend using different event names
   */
  @SubscribeMessage('location')
  async handleLocation(
    @ConnectedSocket() client: any,
    @MessageBody() dto: any,
  ) {
    return this.handleUpdateLocation(client, dto);
  }

  /**
   * Catch-all handler for any location-related events
   */
  @SubscribeMessage('gps')
  async handleGps(
    @ConnectedSocket() client: any,
    @MessageBody() dto: any,
  ) {
    this.logger.log(`[GPS_ALT] Received via 'gps' event`);
    return this.handleUpdateLocation(client, dto);
  }

  /**
   * 4. Helper Method: Memancarkan event pemindaian Checkpoint (Dipanggil dari CheckpointsService)
   */
  emitCheckpointScanned(tripId: string, regionId: string, payload: any) {
    if (!this.server) return;

    // A. Kirim ke penumpang & mitra di trip terkait (update status & kode QR baru)
    const tripRoom = `trip_${tripId}`;
    this.server.to(tripRoom).emit('checkpointScanned', payload);
    this.logger.log(`[CHECKPOINT] Broadcasted to trip room: ${tripRoom}`);

    // B. Kirim ke dashboard Admin Regional jika regionId tersedia
    if (regionId) {
      const regionRoom = `region_${regionId}`;
      this.server.to(regionRoom).emit('regionalFleetUpdated', {
        tripId,
        checkpointData: payload,
        timestamp: new Date().toISOString(),
      });
      this.logger.log(`[CHECKPOINT] Broadcasted to region room: ${regionRoom}`);
    }

    this.logger.log(
      `Broadcast checkpoint untuk Trip #${tripId} berhasil dipancarkan.`,
    );
  }

  /**
   * 5. Emit event saat rute dihitung
   */
  emitRouteCalculated(tripId: string, routeData: any) {
    if (!this.server) return;
    const tripRoom = `trip_${tripId}`;
    this.server.to(tripRoom).emit('routeCalculated', {
      tripId,
      route: routeData,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Route calculated for Trip #${tripId}`);
  }

  /**
   * 6. Emit event saat ETA diperbarui
   */
  emitEtaUpdated(tripId: string, etaData: any) {
    if (!this.server) return;
    const tripRoom = `trip_${tripId}`;
    this.server.to(tripRoom).emit('etaUpdated', {
      tripId,
      eta: etaData,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`ETA updated for Trip #${tripId}`);
  }

  /**
   * 7. Emit event saat armada mendekat pos tujuan (Geofencing)
   */
  emitGeofenceAlert(tripId: string, geofenceData: any) {
    if (!this.server) return;
    const tripRoom = `trip_${tripId}`;
    this.server.to(tripRoom).emit('geofenceAlert', {
      tripId,
      geofence: geofenceData,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Geofence alert for Trip #${tripId}`);
  }

  /**
   * 8. Emit event saat armada menyimpang dari rute
   */
  emitDeviationAlert(tripId: string, deviationData: any) {
    if (!this.server) return;
    const tripRoom = `trip_${tripId}`;
    this.server.to(tripRoom).emit('deviationAlert', {
      tripId,
      deviation: deviationData,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Deviation alert for Trip #${tripId}`);
  }
}
