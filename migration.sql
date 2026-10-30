-- migration.sql: Tambahkan 'payment' ke enum TransactionType pada wallet_transactions
ALTER TABLE `wallet_transactions` 
MODIFY COLUMN `type` ENUM('credit', 'debit', 'escrow_hold', 'escrow_release', 'payment') NOT NULL;

