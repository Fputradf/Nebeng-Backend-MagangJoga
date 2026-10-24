-- AlterTable
ALTER TABLE `merchandise_items` MODIFY `image_url` LONGTEXT NULL;

-- CreateTable
CREATE TABLE `banners` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `image_url` LONGTEXT NOT NULL,
    `link_url` LONGTEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `targetRole` ENUM('admin', 'regional', 'operator', 'mitra', 'customer') NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
