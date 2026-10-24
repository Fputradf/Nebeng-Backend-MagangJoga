-- AlterTable
ALTER TABLE `orders` ADD COLUMN `dispute_deadline` DATETIME(3) NULL,
    ADD COLUMN `is_disputed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `no_show_marked_at` DATETIME(3) NULL,
    ADD COLUMN `no_show_marked_by` BIGINT NULL,
    ADD COLUMN `no_show_reason` TEXT NULL;

-- AlterTable
ALTER TABLE `trips` ADD COLUMN `mitra_no_show_evidence_url` TEXT NULL,
    ADD COLUMN `mitra_no_show_marked_at` DATETIME(3) NULL,
    ADD COLUMN `mitra_no_show_marked_by` BIGINT NULL,
    ADD COLUMN `mitra_no_show_reason` TEXT NULL;

-- CreateTable
CREATE TABLE `no_show_audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `type` ENUM('passenger_no_show', 'mitra_no_show') NOT NULL,
    `order_id` BIGINT NULL,
    `trip_id` BIGINT NULL,
    `pos_id` BIGINT NOT NULL,
    `operator_id` BIGINT NOT NULL,
    `reason` TEXT NOT NULL,
    `evidence_url` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `no_show_audit_logs_type_created_at_idx`(`type`, `created_at`),
    INDEX `no_show_audit_logs_pos_id_created_at_idx`(`pos_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_mitra_no_show_marked_by_fkey` FOREIGN KEY (`mitra_no_show_marked_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_no_show_marked_by_fkey` FOREIGN KEY (`no_show_marked_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `no_show_audit_logs` ADD CONSTRAINT `no_show_audit_logs_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `no_show_audit_logs` ADD CONSTRAINT `no_show_audit_logs_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `no_show_audit_logs` ADD CONSTRAINT `no_show_audit_logs_pos_id_fkey` FOREIGN KEY (`pos_id`) REFERENCES `pickup_points`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `no_show_audit_logs` ADD CONSTRAINT `no_show_audit_logs_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
