-- AlterTable
ALTER TABLE `orders` ADD COLUMN `discount_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `voucher_code` VARCHAR(50) NULL;

-- Backfill existing orders
UPDATE `orders` SET `subtotal` = `total_price` WHERE `subtotal` = 0;

-- AlterTable
ALTER TABLE `wallet_transactions` MODIFY `type` ENUM('credit', 'debit', 'escrow_hold', 'escrow_release', 'payment') NOT NULL;

-- CreateTable
CREATE TABLE `vouchers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `applies_to` ENUM('passenger', 'parcel') NULL,
    `discount_type` ENUM('percentage', 'fixed_amount') NOT NULL,
    `discount_value` DECIMAL(10, 2) NOT NULL,
    `max_discount_amount` DECIMAL(10, 2) NULL,
    `min_order_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `usage_limit` INTEGER NULL,
    `usage_per_user_limit` INTEGER NOT NULL DEFAULT 1,
    `valid_from` DATETIME(3) NOT NULL,
    `valid_until` DATETIME(3) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vouchers_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `voucher_redemptions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `voucher_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `order_id` BIGINT NOT NULL,
    `discount_amount` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('reserved', 'used', 'released') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `voucher_redemptions_order_id_key`(`order_id`),
    INDEX `voucher_redemptions_voucher_id_status_idx`(`voucher_id`, `status`),
    INDEX `voucher_redemptions_user_id_voucher_id_status_idx`(`user_id`, `voucher_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `voucher_redemptions` ADD CONSTRAINT `voucher_redemptions_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `voucher_redemptions` ADD CONSTRAINT `voucher_redemptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `voucher_redemptions` ADD CONSTRAINT `voucher_redemptions_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
