-- Add columns to payments table for late payment refund tracking
ALTER TABLE `payments` ADD COLUMN `refund_required_at` DATETIME(3) NULL,
  ADD COLUMN `refund_note` VARCHAR(500) NULL;
