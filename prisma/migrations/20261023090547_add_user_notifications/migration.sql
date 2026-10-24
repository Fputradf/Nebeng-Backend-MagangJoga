-- CreateTable
CREATE TABLE `user_notifications` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `type` ENUM('order_created', 'order_paid', 'order_cancelled', 'trip_started', 'trip_arrived', 'trip_completed', 'checkpoint_scanned', 'chat_message', 'payment_success', 'payment_failed', 'escrow_released', 'reward_earned', 'reward_redeemed', 'verification_approved', 'verification_rejected', 'trip_booking_request', 'generic') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `data` TEXT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `conversation_id` BIGINT NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_notifications_user_id_is_read_idx`(`user_id`, `is_read`),
    INDEX `user_notifications_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `user_notifications_conversation_id_idx`(`conversation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_notifications` ADD CONSTRAINT `user_notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
