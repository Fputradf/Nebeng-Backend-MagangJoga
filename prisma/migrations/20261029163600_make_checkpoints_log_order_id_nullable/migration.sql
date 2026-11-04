-- DropForeignKey
ALTER TABLE `checkpoints_log` DROP FOREIGN KEY `checkpoints_log_order_id_fkey`;

-- DropIndex
DROP INDEX `checkpoints_log_order_id_fkey` ON `checkpoints_log`;

-- AlterTable
ALTER TABLE `checkpoints_log` MODIFY `order_id` BIGINT NULL;

-- AlterTable
ALTER TABLE `social_links` ALTER COLUMN `updated_at` DROP DEFAULT;

-- AddForeignKey
ALTER TABLE `checkpoints_log` ADD CONSTRAINT `checkpoints_log_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

