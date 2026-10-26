-- AlterTable
ALTER TABLE `no_show_audit_logs` MODIFY `type` ENUM('passenger_no_show', 'mitra_no_show', 'mitra_cancel') NOT NULL;

-- AlterTable
ALTER TABLE `orders` MODIFY `status` ENUM('pending_payment', 'paid', 'checked_in_origin', 'in_transit', 'arrived_destination', 'completed', 'cancelled', 'no_show', 'cancelled_by_mitra') NOT NULL DEFAULT 'pending_payment';

-- AlterTable
ALTER TABLE `trips` ADD COLUMN `cancel_category` VARCHAR(191) NULL,
    ADD COLUMN `cancel_reason` TEXT NULL,
    ADD COLUMN `cancelled_at` DATETIME(3) NULL,
    ADD COLUMN `cancelled_by` BIGINT NULL,
    MODIFY `status` ENUM('scheduled', 'in_origin_pos', 'in_transit', 'arrived_dest_pos', 'completed', 'cancelled', 'mitra_no_show', 'cancelled_by_mitra', 'pending_admin_review') NOT NULL DEFAULT 'scheduled';

-- CreateTable
CREATE TABLE `mitra_sanctions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `mitra_id` BIGINT NOT NULL,
    `trip_id` BIGINT NULL,
    `violation_type` ENUM('MITRA_CANCEL_EARLY', 'MITRA_CANCEL_LATE', 'MITRA_NO_SHOW') NOT NULL,
    `score_deduction` INTEGER NOT NULL DEFAULT 0,
    `tier` INTEGER NOT NULL DEFAULT 1,
    `is_suspended` BOOLEAN NOT NULL DEFAULT false,
    `suspended_until` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'EXPIRED', 'APPEALED', 'WAIVED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mitra_sanctions_mitra_id_status_idx`(`mitra_id`, `status`),
    INDEX `mitra_sanctions_violation_type_created_at_idx`(`violation_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mitra_sanction_appeals` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `sanction_id` BIGINT NOT NULL,
    `mitra_id` BIGINT NOT NULL,
    `reason` TEXT NOT NULL,
    `evidence_url` TEXT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewed_by` BIGINT NULL,
    `review_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mitra_sanction_appeals_sanction_id_status_idx`(`sanction_id`, `status`),
    INDEX `mitra_sanction_appeals_mitra_id_status_idx`(`mitra_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_cancelled_by_fkey` FOREIGN KEY (`cancelled_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mitra_sanctions` ADD CONSTRAINT `mitra_sanctions_mitra_id_fkey` FOREIGN KEY (`mitra_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mitra_sanctions` ADD CONSTRAINT `mitra_sanctions_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mitra_sanction_appeals` ADD CONSTRAINT `mitra_sanction_appeals_sanction_id_fkey` FOREIGN KEY (`sanction_id`) REFERENCES `mitra_sanctions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mitra_sanction_appeals` ADD CONSTRAINT `mitra_sanction_appeals_mitra_id_fkey` FOREIGN KEY (`mitra_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
