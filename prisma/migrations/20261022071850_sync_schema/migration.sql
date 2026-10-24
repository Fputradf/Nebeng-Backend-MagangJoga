-- AlterTable
ALTER TABLE `trip_trackings` ADD COLUMN `accuracy` DECIMAL(6, 2) NULL,
    ADD COLUMN `altitude` DECIMAL(8, 2) NULL,
    ADD COLUMN `heading` DECIMAL(6, 2) NULL,
    ADD COLUMN `speed` DECIMAL(8, 2) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `password_reset_token` VARCHAR(191) NULL,
    ADD COLUMN `password_reset_token_expires_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `osm_route_cache` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `origin_lat` DECIMAL(10, 8) NOT NULL,
    `origin_lng` DECIMAL(11, 8) NOT NULL,
    `dest_lat` DECIMAL(10, 8) NOT NULL,
    `dest_lng` DECIMAL(11, 8) NOT NULL,
    `distance_km` DECIMAL(10, 2) NOT NULL,
    `duration_minutes` DECIMAL(8, 2) NOT NULL,
    `polyline` TEXT NOT NULL,
    `cached_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `osm_route_cache_expires_at_idx`(`expires_at`),
    UNIQUE INDEX `osm_route_cache_origin_lat_origin_lng_dest_lat_dest_lng_key`(`origin_lat`, `origin_lng`, `dest_lat`, `dest_lng`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `trip_trackings_trip_id_recorded_at_idx` ON `trip_trackings`(`trip_id`, `recorded_at`);
