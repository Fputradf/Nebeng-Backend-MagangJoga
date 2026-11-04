-- AlterTable
ALTER TABLE `vouchers` ADD COLUMN `claim_type` ENUM('code_redemption', 'direct_platform') NOT NULL DEFAULT 'direct_platform';

-- CreateTable
CREATE TABLE `user_vouchers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `voucher_id` BIGINT NOT NULL,
    `claimed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_vouchers_user_id_voucher_id_key`(`user_id`, `voucher_id`),
    INDEX `user_vouchers_user_id_idx`(`user_id`),
    INDEX `user_vouchers_voucher_id_idx`(`voucher_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_vouchers` ADD CONSTRAINT `user_vouchers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_vouchers` ADD CONSTRAINT `user_vouchers_voucher_id_fkey` FOREIGN KEY (`voucher_id`) REFERENCES `vouchers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
