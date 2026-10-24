-- AlterTable
ALTER TABLE `orders` MODIFY `status` ENUM('pending_payment', 'paid', 'checked_in_origin', 'in_transit', 'arrived_destination', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'pending_payment';

-- AlterTable
ALTER TABLE `trips` MODIFY `status` ENUM('scheduled', 'in_origin_pos', 'in_transit', 'arrived_dest_pos', 'completed', 'cancelled', 'mitra_no_show') NOT NULL DEFAULT 'scheduled';
