-- V2 reference schema after migrations001-014, MySQL8.4/InnoDB.
-- No data or allocated sequence values. Install with npm run db:migrate, not this snapshot.
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE `appointments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `patient_id` bigint unsigned NOT NULL,
  `practitioner_id` bigint unsigned NOT NULL,
  `room_id` bigint unsigned DEFAULT NULL,
  `starts_at` datetime(3) NOT NULL,
  `ends_at` datetime(3) NOT NULL,
  `reason` varchar(2000) NOT NULL DEFAULT '',
  `status` varchar(30) NOT NULL DEFAULT 'BOOKED',
  `version` int NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`branch_id`,`id`),
  KEY `appointments_calendar` (`branch_id`,`starts_at`),
  KEY `appointments_practitioner_overlap` (`practitioner_id`,`status`,`starts_at`,`ends_at`),
  KEY `appointments_room_overlap` (`room_id`,`status`,`starts_at`,`ends_at`),
  KEY `appointments_ibfk_2` (`tenant_id`,`patient_id`),
  KEY `appointments_ibfk_3` (`tenant_id`,`practitioner_id`),
  KEY `appointments_ibfk_4` (`tenant_id`,`branch_id`,`room_id`),
  CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`tenant_id`, `patient_id`) REFERENCES `patients` (`tenant_id`, `id`),
  CONSTRAINT `appointments_ibfk_3` FOREIGN KEY (`tenant_id`, `practitioner_id`) REFERENCES `users` (`tenant_id`, `id`),
  CONSTRAINT `appointments_ibfk_4` FOREIGN KEY (`tenant_id`, `branch_id`, `room_id`) REFERENCES `rooms` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `appointments_chk_1` CHECK ((`status` in (_utf8mb4'BOOKED',_utf8mb4'CHECKED_IN',_utf8mb4'COMPLETED',_utf8mb4'CANCELLED'))),
  CONSTRAINT `appointments_chk_2` CHECK ((`ends_at` > `starts_at`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `actor_id` bigint unsigned NOT NULL,
  `action` varchar(30) NOT NULL,
  `entity_type` varchar(30) NOT NULL,
  `entity_id` bigint unsigned DEFAULT NULL,
  `request_id` varchar(100) NOT NULL,
  `metadata` json NOT NULL DEFAULT (_utf8mb4'{}'),
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `audit_history` (`tenant_id`,`created_at` DESC),
  KEY `audit_logs_ibfk_1` (`tenant_id`,`branch_id`),
  KEY `audit_logs_ibfk_2` (`tenant_id`,`actor_id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `audit_logs_ibfk_2` FOREIGN KEY (`tenant_id`, `actor_id`) REFERENCES `users` (`tenant_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `branches` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `name` varchar(200) NOT NULL,
  `address` varchar(2000) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`id`),
  CONSTRAINT `branches_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `clinical_documents` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `encounter_id` bigint unsigned NOT NULL,
  `patient_id` bigint unsigned NOT NULL,
  `practitioner_id` bigint unsigned NOT NULL,
  `kind` varchar(10) NOT NULL,
  `document_number` varchar(200) NOT NULL,
  `payload` json NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `diagnosis_redacted` tinyint(1) NOT NULL DEFAULT '1',
  `verification_hash` varchar(200) NOT NULL,
  `signature_hash` varchar(200) NOT NULL,
  `revoked_at` datetime(3) DEFAULT NULL,
  `revoke_reason` text,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `document_number` (`document_number`),
  UNIQUE KEY `verification_hash` (`verification_hash`),
  KEY `documents_patient` (`tenant_id`,`patient_id`,`created_at` DESC),
  KEY `clinical_documents_mc_overlap` (`patient_id`,`kind`,`revoked_at`,`start_date`,`end_date`),
  KEY `clinical_documents_ibfk_1` (`tenant_id`,`branch_id`,`encounter_id`),
  KEY `clinical_documents_ibfk_3` (`tenant_id`,`practitioner_id`),
  CONSTRAINT `clinical_documents_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`, `encounter_id`) REFERENCES `encounters` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `clinical_documents_ibfk_2` FOREIGN KEY (`tenant_id`, `patient_id`) REFERENCES `patients` (`tenant_id`, `id`),
  CONSTRAINT `clinical_documents_ibfk_3` FOREIGN KEY (`tenant_id`, `practitioner_id`) REFERENCES `users` (`tenant_id`, `id`),
  CONSTRAINT `clinical_documents_chk_1` CHECK ((`kind` in (_utf8mb4'MC',_utf8mb4'REFERRAL',_utf8mb4'LAB'))),
  CONSTRAINT `clinical_documents_chk_2` CHECK (((`kind` <> _utf8mb4'MC') or ((`start_date` is not null) and (`end_date` is not null) and (`end_date` >= `start_date`))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `clinical_photos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `encounter_id` bigint unsigned NOT NULL,
  `patient_id` bigint unsigned NOT NULL,
  `actor_id` bigint unsigned NOT NULL,
  `stage` varchar(10) NOT NULL,
  `caption` varchar(500) NOT NULL DEFAULT '',
  `mime_type` varchar(30) NOT NULL,
  `encrypted_data` mediumblob NOT NULL,
  `iv` binary(12) NOT NULL,
  `auth_tag` binary(16) NOT NULL,
  `consent_recorded` tinyint(1) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `photos_encounter` (`tenant_id`,`branch_id`,`encounter_id`,`created_at`),
  KEY `clinical_photos_ibfk_2` (`tenant_id`,`patient_id`),
  KEY `clinical_photos_ibfk_3` (`tenant_id`,`actor_id`),
  CONSTRAINT `clinical_photos_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`, `encounter_id`) REFERENCES `encounters` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `clinical_photos_ibfk_2` FOREIGN KEY (`tenant_id`, `patient_id`) REFERENCES `patients` (`tenant_id`, `id`),
  CONSTRAINT `clinical_photos_ibfk_3` FOREIGN KEY (`tenant_id`, `actor_id`) REFERENCES `users` (`tenant_id`, `id`),
  CONSTRAINT `clinical_photos_chk_1` CHECK ((`stage` in (_utf8mb4'BEFORE',_utf8mb4'AFTER'))),
  CONSTRAINT `clinical_photos_chk_2` CHECK ((`mime_type` in (_utf8mb4'image/jpeg',_utf8mb4'image/png'))),
  CONSTRAINT `clinical_photos_chk_3` CHECK ((`consent_recorded` = 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `commission_ledger` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `invoice_id` bigint unsigned NOT NULL,
  `practitioner_id` bigint unsigned NOT NULL,
  `base_cents` int NOT NULL,
  `rate_basis_points` int NOT NULL,
  `amount_cents` int NOT NULL,
  `category` varchar(30) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `commissions_branch_history` (`tenant_id`,`branch_id`,`created_at`),
  KEY `commission_ledger_ibfk_1` (`tenant_id`,`branch_id`,`invoice_id`),
  KEY `commission_ledger_ibfk_2` (`tenant_id`,`practitioner_id`),
  CONSTRAINT `commission_ledger_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`, `invoice_id`) REFERENCES `invoices` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `commission_ledger_ibfk_2` FOREIGN KEY (`tenant_id`, `practitioner_id`) REFERENCES `users` (`tenant_id`, `id`),
  CONSTRAINT `commission_ledger_chk_1` CHECK ((`base_cents` > 0)),
  CONSTRAINT `commission_ledger_chk_2` CHECK ((`rate_basis_points` between 0 and 10000)),
  CONSTRAINT `commission_ledger_chk_3` CHECK ((`amount_cents` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `commission_policies` (
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `service_base_bps` int NOT NULL DEFAULT '1000',
  `service_threshold_cents` int NOT NULL DEFAULT '50000',
  `service_high_bps` int NOT NULL DEFAULT '1500',
  `product_bps` int NOT NULL DEFAULT '500',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`branch_id`),
  KEY `commission_policies_ibfk_1` (`tenant_id`,`branch_id`),
  CONSTRAINT `commission_policies_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `commission_policies_chk_1` CHECK ((`service_base_bps` between 0 and 10000)),
  CONSTRAINT `commission_policies_chk_2` CHECK ((`service_high_bps` between 0 and 10000)),
  CONSTRAINT `commission_policies_chk_3` CHECK ((`product_bps` between 0 and 10000)),
  CONSTRAINT `commission_policies_chk_4` CHECK ((`service_threshold_cents` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `dispenses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `patient_id` bigint unsigned NOT NULL,
  `encounter_id` bigint unsigned NOT NULL,
  `actor_id` bigint unsigned NOT NULL,
  `idempotency_key` varchar(200) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `encounter_id` (`encounter_id`),
  UNIQUE KEY `branch_id` (`branch_id`,`idempotency_key`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`branch_id`,`id`),
  KEY `dispenses_ibfk_1` (`tenant_id`,`branch_id`,`encounter_id`),
  KEY `dispenses_ibfk_2` (`tenant_id`,`patient_id`),
  KEY `dispenses_ibfk_3` (`tenant_id`,`actor_id`),
  CONSTRAINT `dispenses_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`, `encounter_id`) REFERENCES `encounters` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `dispenses_ibfk_2` FOREIGN KEY (`tenant_id`, `patient_id`) REFERENCES `patients` (`tenant_id`, `id`),
  CONSTRAINT `dispenses_ibfk_3` FOREIGN KEY (`tenant_id`, `actor_id`) REFERENCES `users` (`tenant_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `encounters` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `patient_id` bigint unsigned NOT NULL,
  `practitioner_id` bigint unsigned NOT NULL,
  `queue_ticket_id` bigint unsigned DEFAULT NULL,
  `specialty` varchar(20) NOT NULL DEFAULT 'GP',
  `subjective` text NOT NULL,
  `objective` text NOT NULL,
  `assessment` text NOT NULL,
  `plan` text NOT NULL,
  `vitals` json NOT NULL DEFAULT (_utf8mb4'{}'),
  `prescriptions` json NOT NULL DEFAULT (_utf8mb4'[]'),
  `procedure_notes` text NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'DRAFT',
  `version` int NOT NULL DEFAULT '1',
  `signed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`branch_id`,`id`),
  KEY `encounters_history` (`tenant_id`,`patient_id`,`created_at` DESC),
  KEY `encounters_ibfk_3` (`tenant_id`,`practitioner_id`),
  KEY `encounters_ibfk_4` (`tenant_id`,`branch_id`,`queue_ticket_id`),
  CONSTRAINT `encounters_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `encounters_ibfk_2` FOREIGN KEY (`tenant_id`, `patient_id`) REFERENCES `patients` (`tenant_id`, `id`),
  CONSTRAINT `encounters_ibfk_3` FOREIGN KEY (`tenant_id`, `practitioner_id`) REFERENCES `users` (`tenant_id`, `id`),
  CONSTRAINT `encounters_ibfk_4` FOREIGN KEY (`tenant_id`, `branch_id`, `queue_ticket_id`) REFERENCES `queue_tickets` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `encounters_chk_1` CHECK ((`specialty` in (_utf8mb4'GP',_utf8mb4'DENTAL',_utf8mb4'AESTHETIC'))),
  CONSTRAINT `encounters_chk_2` CHECK ((`status` in (_utf8mb4'DRAFT',_utf8mb4'SIGNED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `inventory_batches` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `item_id` bigint unsigned NOT NULL,
  `batch_number` varchar(100) NOT NULL,
  `expires_on` date DEFAULT NULL,
  `quantity` int NOT NULL,
  `received_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `item_id` (`item_id`,`batch_number`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`branch_id`,`id`),
  UNIQUE KEY `batch_item_scope` (`tenant_id`,`branch_id`,`item_id`,`id`),
  KEY `batches_fefo` (`item_id`,`expires_on`,`received_at`),
  CONSTRAINT `inventory_batches_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`, `item_id`) REFERENCES `inventory_items` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `inventory_batches_chk_1` CHECK ((`quantity` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `inventory_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `name` varchar(200) NOT NULL,
  `sku` varchar(200) NOT NULL,
  `ingredient` varchar(2000) NOT NULL DEFAULT '',
  `category` varchar(30) NOT NULL DEFAULT 'MEDICATION',
  `unit` varchar(50) NOT NULL DEFAULT 'unit',
  `price_cents` int NOT NULL,
  `reorder_level` int NOT NULL DEFAULT '10',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `version` int NOT NULL DEFAULT '1',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `branch_id` (`branch_id`,`sku`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`branch_id`,`id`),
  CONSTRAINT `inventory_items_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `inventory_items_chk_1` CHECK ((`price_cents` >= 0)),
  CONSTRAINT `inventory_items_chk_2` CHECK ((`reorder_level` >= 0)),
  CONSTRAINT `inventory_items_chk_3` CHECK ((`version` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `inventory_usages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `item_id` bigint unsigned NOT NULL,
  `quantity` int NOT NULL,
  `reason` varchar(500) NOT NULL,
  `actor_id` bigint unsigned NOT NULL,
  `idempotency_key` varchar(100) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `usage_idempotency` (`branch_id`,`idempotency_key`),
  UNIQUE KEY `usage_scope` (`tenant_id`,`branch_id`,`id`),
  KEY `tenant_id` (`tenant_id`,`branch_id`,`item_id`),
  KEY `actor_id` (`actor_id`),
  CONSTRAINT `inventory_usages_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`, `item_id`) REFERENCES `inventory_items` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `inventory_usages_ibfk_2` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`),
  CONSTRAINT `inventory_usages_chk_1` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `invoices` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `patient_id` bigint unsigned NOT NULL,
  `practitioner_id` bigint unsigned NOT NULL,
  `invoice_number` varchar(200) NOT NULL,
  `lines` json NOT NULL,
  `total_cents` int NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'PAID',
  `idempotency_key` varchar(200) NOT NULL,
  `request_hash` varchar(2000) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  UNIQUE KEY `branch_id` (`branch_id`,`idempotency_key`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`branch_id`,`id`),
  KEY `invoices_branch_history` (`tenant_id`,`branch_id`,`created_at`),
  KEY `invoices_ibfk_2` (`tenant_id`,`patient_id`),
  KEY `invoices_ibfk_3` (`tenant_id`,`practitioner_id`),
  CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `invoices_ibfk_2` FOREIGN KEY (`tenant_id`, `patient_id`) REFERENCES `patients` (`tenant_id`, `id`),
  CONSTRAINT `invoices_ibfk_3` FOREIGN KEY (`tenant_id`, `practitioner_id`) REFERENCES `users` (`tenant_id`, `id`),
  CONSTRAINT `invoices_chk_1` CHECK ((`total_cents` > 0)),
  CONSTRAINT `invoices_chk_2` CHECK ((`status` in (_utf8mb4'PAID',_utf8mb4'VOID')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `notification_outbox` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `patient_id` bigint unsigned NOT NULL,
  `channel` varchar(20) NOT NULL,
  `template` varchar(50) NOT NULL,
  `recipient` varchar(254) NOT NULL,
  `payload` json NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'PENDING',
  `attempts` int NOT NULL DEFAULT '0',
  `available_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_error` varchar(2000) DEFAULT NULL,
  `provider_reference` varchar(2000) DEFAULT NULL,
  `deduplication_key` varchar(200) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `deduplication_key` (`deduplication_key`),
  KEY `outbox_pending` (`available_at`),
  KEY `notification_outbox_ibfk_1` (`tenant_id`,`branch_id`),
  KEY `notification_outbox_ibfk_2` (`tenant_id`,`patient_id`),
  CONSTRAINT `notification_outbox_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `notification_outbox_ibfk_2` FOREIGN KEY (`tenant_id`, `patient_id`) REFERENCES `patients` (`tenant_id`, `id`),
  CONSTRAINT `notification_outbox_chk_1` CHECK ((`channel` in (_utf8mb4'EMAIL',_utf8mb4'WHATSAPP'))),
  CONSTRAINT `notification_outbox_chk_2` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'PROCESSING',_utf8mb4'SENT',_utf8mb4'FAILED',_utf8mb4'UNCONFIGURED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `package_redemptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `package_id` bigint unsigned NOT NULL,
  `practitioner_id` bigint unsigned NOT NULL,
  `encounter_id` bigint unsigned NOT NULL,
  `notes` text NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `package_id` (`package_id`,`encounter_id`),
  KEY `package_redemptions_ibfk_1` (`tenant_id`,`branch_id`,`package_id`),
  KEY `package_redemptions_ibfk_2` (`tenant_id`,`branch_id`,`encounter_id`),
  KEY `package_redemptions_ibfk_3` (`tenant_id`,`practitioner_id`),
  CONSTRAINT `package_redemptions_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`, `package_id`) REFERENCES `treatment_packages` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `package_redemptions_ibfk_2` FOREIGN KEY (`tenant_id`, `branch_id`, `encounter_id`) REFERENCES `encounters` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `package_redemptions_ibfk_3` FOREIGN KEY (`tenant_id`, `practitioner_id`) REFERENCES `users` (`tenant_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `patient_deposits` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `patient_id` bigint unsigned NOT NULL,
  `amount_cents` int NOT NULL,
  `reference` varchar(200) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `deposits_patient_balance` (`tenant_id`,`branch_id`,`patient_id`),
  KEY `patient_deposits_ibfk_2` (`tenant_id`,`patient_id`),
  CONSTRAINT `patient_deposits_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `patient_deposits_ibfk_2` FOREIGN KEY (`tenant_id`, `patient_id`) REFERENCES `patients` (`tenant_id`, `id`),
  CONSTRAINT `patient_deposits_chk_1` CHECK ((`amount_cents` <> 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `patients` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `name` varchar(200) NOT NULL,
  `national_id` varchar(200) NOT NULL,
  `date_of_birth` date NOT NULL,
  `sex` varchar(10) NOT NULL,
  `phone` varchar(50) NOT NULL DEFAULT '',
  `email` varchar(254) NOT NULL DEFAULT '',
  `blood_group` varchar(10) NOT NULL DEFAULT '',
  `allergies` json NOT NULL DEFAULT (_utf8mb4'[]'),
  `conditions` json NOT NULL DEFAULT (_utf8mb4'[]'),
  `notification_consent` tinyint(1) NOT NULL DEFAULT '0',
  `version` int NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `first_name` varchar(150) NOT NULL DEFAULT '',
  `last_name` varchar(150) NOT NULL DEFAULT '',
  `nationality` varchar(20) DEFAULT NULL,
  `address_line1` varchar(500) NOT NULL DEFAULT '',
  `address_line2` varchar(500) NOT NULL DEFAULT '',
  `postcode` varchar(20) NOT NULL DEFAULT '',
  `state` varchar(100) NOT NULL DEFAULT '',
  `city` varchar(100) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`national_id`),
  UNIQUE KEY `tenant_id_2` (`tenant_id`,`id`),
  KEY `patients_branch_search` (`tenant_id`,`branch_id`,`name`),
  CONSTRAINT `patients_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `patients_ibfk_2` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `patients_chk_1` CHECK ((`sex` in (_utf8mb4'MALE',_utf8mb4'FEMALE',_utf8mb4'OTHER'))),
  CONSTRAINT `patients_nationality_allowed` CHECK (((`nationality` is null) or (`nationality` in (_utf8mb4'MALAYSIAN',_utf8mb4'NON_MALAYSIAN'))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `payments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `invoice_id` bigint unsigned NOT NULL,
  `method` varchar(20) NOT NULL,
  `amount_cents` int NOT NULL,
  `reference` varchar(200) NOT NULL DEFAULT '',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `payments_ibfk_1` (`tenant_id`,`branch_id`,`invoice_id`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`, `invoice_id`) REFERENCES `invoices` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `payments_chk_1` CHECK ((`method` in (_utf8mb4'CASH',_utf8mb4'CARD',_utf8mb4'QR',_utf8mb4'DEPOSIT'))),
  CONSTRAINT `payments_chk_2` CHECK ((`amount_cents` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `prescription_dose_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `encounter_id` bigint unsigned NOT NULL,
  `item_id` bigint unsigned NOT NULL,
  `medicine_name` varchar(200) NOT NULL,
  `unit` varchar(50) NOT NULL,
  `outcome` varchar(10) NOT NULL,
  `source` varchar(30) NOT NULL,
  `occurred_at` datetime(3) NOT NULL,
  `amount` decimal(12,3) DEFAULT NULL,
  `notes` text NOT NULL,
  `actor_id` bigint unsigned NOT NULL,
  `idempotency_key` varchar(100) NOT NULL,
  `request_hash` char(64) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `dose_idempotency` (`branch_id`,`idempotency_key`),
  KEY `dose_history` (`tenant_id`,`branch_id`,`encounter_id`,`occurred_at`,`id`),
  KEY `tenant_id` (`tenant_id`,`branch_id`,`item_id`),
  KEY `tenant_id_2` (`tenant_id`,`actor_id`),
  CONSTRAINT `prescription_dose_logs_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`, `encounter_id`) REFERENCES `encounters` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `prescription_dose_logs_ibfk_2` FOREIGN KEY (`tenant_id`, `branch_id`, `item_id`) REFERENCES `inventory_items` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `prescription_dose_logs_ibfk_3` FOREIGN KEY (`tenant_id`, `actor_id`) REFERENCES `users` (`tenant_id`, `id`),
  CONSTRAINT `prescription_dose_logs_chk_1` CHECK ((`outcome` in (_utf8mb4'TAKEN',_utf8mb4'MISSED'))),
  CONSTRAINT `prescription_dose_logs_chk_2` CHECK ((`source` in (_utf8mb4'PATIENT_REPORTED',_utf8mb4'STAFF_OBSERVED'))),
  CONSTRAINT `prescription_dose_logs_chk_3` CHECK ((((`outcome` = _utf8mb4'TAKEN') and (`amount` is not null) and (`amount` > 0) and (`amount` <= 1000000)) or ((`outcome` = _utf8mb4'MISSED') and (`amount` is null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `prescription_reservations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `encounter_id` bigint unsigned NOT NULL,
  `item_id` bigint unsigned NOT NULL,
  `batch_id` bigint unsigned NOT NULL,
  `quantity` int NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'RESERVED',
  `consumed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `reservation_batch` (`encounter_id`,`batch_id`),
  KEY `reservation_available` (`batch_id`,`consumed_at`),
  KEY `tenant_id` (`tenant_id`,`branch_id`,`encounter_id`),
  KEY `tenant_id_2` (`tenant_id`,`branch_id`,`item_id`,`batch_id`),
  CONSTRAINT `prescription_reservations_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`, `encounter_id`) REFERENCES `encounters` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `prescription_reservations_ibfk_2` FOREIGN KEY (`tenant_id`, `branch_id`, `item_id`) REFERENCES `inventory_items` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `prescription_reservations_ibfk_3` FOREIGN KEY (`tenant_id`, `branch_id`, `item_id`, `batch_id`) REFERENCES `inventory_batches` (`tenant_id`, `branch_id`, `item_id`, `id`),
  CONSTRAINT `prescription_reservations_chk_1` CHECK ((`quantity` > 0)),
  CONSTRAINT `prescription_reservations_chk_2` CHECK ((`status` in (_utf8mb4'RESERVED',_utf8mb4'FULFILLED',_utf8mb4'RELEASED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `queue_tickets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `patient_id` bigint unsigned NOT NULL,
  `ticket_number` varchar(20) NOT NULL,
  `service_date` date NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'REGISTERED',
  `room_id` bigint unsigned DEFAULT NULL,
  `practitioner_id` bigint unsigned DEFAULT NULL,
  `priority` varchar(10) NOT NULL DEFAULT 'NORMAL',
  `version` int NOT NULL DEFAULT '1',
  `called_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `active_patient_id` bigint unsigned GENERATED ALWAYS AS ((case when (`status` not in (_utf8mb4'COMPLETED',_utf8mb4'SKIPPED')) then `patient_id` else NULL end)) STORED,
  `occupied_room_id` bigint unsigned GENERATED ALWAYS AS ((case when (`status` in (_utf8mb4'CALLED_TO_ROOM',_utf8mb4'IN_CONSULTATION')) then `room_id` else NULL end)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `branch_id_2` (`branch_id`,`service_date`,`ticket_number`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`branch_id`,`id`),
  UNIQUE KEY `branch_id` (`branch_id`,`active_patient_id`),
  UNIQUE KEY `occupied_room_id` (`occupied_room_id`),
  KEY `queue_live` (`branch_id`,`service_date`,`status`,`created_at`),
  KEY `queue_tickets_ibfk_2` (`tenant_id`,`patient_id`),
  KEY `queue_tickets_ibfk_3` (`tenant_id`,`practitioner_id`),
  KEY `queue_tickets_ibfk_4` (`tenant_id`,`branch_id`,`room_id`),
  CONSTRAINT `queue_tickets_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `queue_tickets_ibfk_2` FOREIGN KEY (`tenant_id`, `patient_id`) REFERENCES `patients` (`tenant_id`, `id`),
  CONSTRAINT `queue_tickets_ibfk_3` FOREIGN KEY (`tenant_id`, `practitioner_id`) REFERENCES `users` (`tenant_id`, `id`),
  CONSTRAINT `queue_tickets_ibfk_4` FOREIGN KEY (`tenant_id`, `branch_id`, `room_id`) REFERENCES `rooms` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `queue_tickets_chk_1` CHECK ((`status` in (_utf8mb4'REGISTERED',_utf8mb4'TRIAGE_WAITING',_utf8mb4'CALLED_TO_ROOM',_utf8mb4'IN_CONSULTATION',_utf8mb4'DISPENSARY_WAITING',_utf8mb4'PAYMENT_WAITING',_utf8mb4'COMPLETED',_utf8mb4'SKIPPED'))),
  CONSTRAINT `queue_tickets_chk_2` CHECK ((`priority` in (_utf8mb4'NORMAL',_utf8mb4'URGENT')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `reference_catalogs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `kind` varchar(30) NOT NULL,
  `label` varchar(200) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `version` int NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `catalog_label` (`branch_id`,`kind`,`label`),
  KEY `catalog_choices` (`tenant_id`,`branch_id`,`kind`,`active`,`sort_order`,`id`),
  CONSTRAINT `reference_catalogs_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `reference_catalogs_chk_1` CHECK ((`kind` in (_utf8mb4'LAB_PANEL',_utf8mb4'SPECIMEN_TYPE',_utf8mb4'INVENTORY_UNIT',_utf8mb4'REFERRAL_DESTINATION'))),
  CONSTRAINT `reference_catalogs_chk_2` CHECK (((`sort_order` >= 0) and (`sort_order` <= 1000000))),
  CONSTRAINT `reference_catalogs_chk_3` CHECK ((`version` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `resource_locks` (
  `lock_key` varchar(200) NOT NULL,
  PRIMARY KEY (`lock_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `role_module_permissions` (
  `tenant_id` bigint unsigned NOT NULL,
  `role` varchar(20) NOT NULL,
  `modules` json NOT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tenant_id`,`role`),
  CONSTRAINT `role_module_permissions_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `role_module_permissions_chk_1` CHECK ((`role` in (_utf8mb4'DOCTOR',_utf8mb4'RECEPTIONIST',_utf8mb4'NURSE',_utf8mb4'THERAPIST'))),
  CONSTRAINT `role_module_permissions_chk_2` CHECK ((json_type(`modules`) = _utf8mb4'ARRAY'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `rooms` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `name` varchar(200) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`branch_id`,`id`),
  UNIQUE KEY `branch_id` (`branch_id`,`name`),
  KEY `rooms_active_branch` (`tenant_id`,`branch_id`,`active`),
  CONSTRAINT `rooms_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `schema_migrations` (
  `name` varchar(200) NOT NULL,
  `checksum` char(64) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sessions` (
  `token_hash` varchar(200) NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `csrf_token` varchar(200) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`token_hash`),
  KEY `sessions_expiry` (`expires_at`),
  KEY `sessions_ibfk_1` (`user_id`),
  CONSTRAINT `sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `stock_movements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `batch_id` bigint unsigned NOT NULL,
  `dispense_id` bigint unsigned DEFAULT NULL,
  `quantity_delta` int NOT NULL,
  `reason` varchar(2000) NOT NULL,
  `actor_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `usage_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `stock_movements_batch_history` (`batch_id`,`created_at`),
  KEY `stock_movements_ibfk_1` (`tenant_id`,`branch_id`,`batch_id`),
  KEY `stock_movements_ibfk_2` (`tenant_id`,`branch_id`,`dispense_id`),
  KEY `stock_movements_ibfk_3` (`tenant_id`,`actor_id`),
  KEY `movement_usage_fk` (`tenant_id`,`branch_id`,`usage_id`),
  CONSTRAINT `movement_usage_fk` FOREIGN KEY (`tenant_id`, `branch_id`, `usage_id`) REFERENCES `inventory_usages` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `stock_movements_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`, `batch_id`) REFERENCES `inventory_batches` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `stock_movements_ibfk_2` FOREIGN KEY (`tenant_id`, `branch_id`, `dispense_id`) REFERENCES `dispenses` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `stock_movements_ibfk_3` FOREIGN KEY (`tenant_id`, `actor_id`) REFERENCES `users` (`tenant_id`, `id`),
  CONSTRAINT `stock_movements_chk_1` CHECK ((`quantity_delta` <> 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tenants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `treatment_packages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `patient_id` bigint unsigned NOT NULL,
  `name` varchar(200) NOT NULL,
  `total_sessions` int NOT NULL,
  `used_sessions` int NOT NULL DEFAULT '0',
  `price_cents` int NOT NULL,
  `expires_on` date NOT NULL,
  `version` int NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sale_invoice_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`branch_id`,`id`),
  UNIQUE KEY `package_sale_invoice_unique` (`sale_invoice_id`),
  KEY `package_sale_invoice_fk` (`tenant_id`,`branch_id`,`sale_invoice_id`),
  KEY `treatment_packages_ibfk_2` (`tenant_id`,`patient_id`),
  CONSTRAINT `package_sale_invoice_fk` FOREIGN KEY (`tenant_id`, `branch_id`, `sale_invoice_id`) REFERENCES `invoices` (`tenant_id`, `branch_id`, `id`),
  CONSTRAINT `treatment_packages_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `treatment_packages_ibfk_2` FOREIGN KEY (`tenant_id`, `patient_id`) REFERENCES `patients` (`tenant_id`, `id`),
  CONSTRAINT `treatment_packages_chk_1` CHECK ((`total_sessions` > 0)),
  CONSTRAINT `treatment_packages_chk_2` CHECK ((`price_cents` >= 0)),
  CONSTRAINT `treatment_packages_chk_3` CHECK (((`used_sessions` >= 0) and (`used_sessions` <= `total_sessions`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `user_branches` (
  `user_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`user_id`,`branch_id`),
  KEY `user_branches_ibfk_2` (`branch_id`),
  CONSTRAINT `user_branches_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `user_branches_ibfk_2` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `email` varchar(254) NOT NULL,
  `name` varchar(200) NOT NULL,
  `password_hash` varchar(300) NOT NULL,
  `role` varchar(20) NOT NULL,
  `license_number` varchar(100) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `tenant_id` (`tenant_id`,`id`),
  KEY `users_ibfk_1` (`tenant_id`,`branch_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`tenant_id`, `branch_id`) REFERENCES `branches` (`tenant_id`, `id`),
  CONSTRAINT `users_ibfk_2` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `users_chk_1` CHECK ((`role` in (_utf8mb4'ADMIN',_utf8mb4'DOCTOR',_utf8mb4'RECEPTIONIST',_utf8mb4'NURSE',_utf8mb4'THERAPIST')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS=1;
