# Estructura del Proyecto

<!-- PROJECT_STRUCTURE_START -->
```
├── 📁 .devin/
│   └── 📄 config.local.json
├── 📄 .env
├── 📄 .env.example
├── 📄 .env.test
├── 📄 .env.test.backup
├── 📄 .gitignore
├── 📄 .prettierrc
├── 📄 eslint.config.mjs
├── 📄 fix-escrow.js
├── 📄 fix-escrow.ts
├── 📄 fix_main.py
├── 📄 FRONTEND_DEVELOPMENT_PROMPT.md
├── 📄 FRONTEND_NOTIFICATION_IMPLEMENTATION.md
├── 📄 GPS_TRACKING_IMPLEMENTATION.md
├── 📄 HANDOFF_LANGKAH2.md
├── 📄 jest.integration.config.js
├── 📄 migration.sql
├── 📄 nest-cli.json
├── 📄 NOTIFICATION_SYSTEM_BACKEND_SUMMARY.md
├── 📄 package-lock.json
├── 📄 package.json
├── 📁 prisma/
│   ├── 📁 data/
│   │   ├── 📄 diy-polygon.json
│   │   └── 📄 solo-polygon.json
│   ├── 📁 migrations/
│   │   ├── 📁 20260815125510_init/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20260826093230_allow_soft_delete_and_anonymization/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20260831024110_add_price_per_km_to_region/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20260919025700_add_merchandise_and_qr_session/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261019132034_nebeng/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261022071850_sync_schema/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261022131913_add_notification_system/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261023090547_add_user_notifications/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261024075519_add_no_show_status/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261024080446_add_no_show_audit_fields/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261024082626_add_push_subscription/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261024102908_add_user_agent_to_device_tokens/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261026144000_fase_10_mitra_cancel/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261027000000_add_payment_late_refund_marker/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261027064344_remove_service_type_default/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261027130909_add_vouchers/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261028160000_add_user_vouchers/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261029154500_add_social_links/
│   │   │   └── 📄 migration.sql
│   │   ├── 📁 20261029163600_make_checkpoints_log_order_id_nullable/
│   │   │   └── 📄 migration.sql
│   │   └── 📄 migration_lock.toml
│   ├── 📄 run-seed.js
│   ├── 📄 schema.prisma
│   └── 📄 seed.ts
├── 📄 prisma.config.ts
├── 📄 README.md
├── 📄 replace.py
├── 📄 replace_express.py
├── 📄 run-seed.js
├── 📄 SEEDER_INSTRUCTIONS.md
├── 📁 src/
│   ├── 📄 app.controller.ts
│   ├── 📄 app.module.ts
│   ├── 📄 app.service.ts
│   ├── 📄 cancel-mitra-test.int-spec.ts
│   ├── 📁 common/
│   │   ├── 📁 decorators/
│   │   │   ├── 📄 get-user.decorators.ts
│   │   │   └── 📄 roles.decorator.ts
│   │   ├── 📁 filters/
│   │   │   └── 📄 http-exception.filter.ts
│   │   ├── 📁 guards/
│   │   │   └── 📄 roles.guard.ts
│   │   ├── 📁 interceptors/
│   │   │   └── 📄 audit-log.interceptor.ts
│   │   └── 📁 utils/
│   │       ├── 📄 financial.util.ts
│   │       └── 📄 geo.util.ts
│   ├── 📄 env-guard.spec.ts
│   ├── 📁 generated/
│   │   └── 📁 prisma/
│   │       ├── 📄 browser.ts
│   │       ├── 📄 client.ts
│   │       ├── 📄 commonInputTypes.ts
│   │       ├── 📄 enums.ts
│   │       ├── 📁 internal/
│   │       │   ├── 📄 class.ts
│   │       │   ├── 📄 prismaNamespace.ts
│   │       │   └── 📄 prismaNamespaceBrowser.ts
│   │       ├── 📁 models/
│   │       │   ├── 📄 Banner.ts
│   │       │   ├── 📄 CheckpointsLog.ts
│   │       │   ├── 📄 City.ts
│   │       │   ├── 📄 Conversation.ts
│   │       │   ├── 📄 DeviceToken.ts
│   │       │   ├── 📄 ItemOrder.ts
│   │       │   ├── 📄 MerchandiseItem.ts
│   │       │   ├── 📄 MerchandiseRedemption.ts
│   │       │   ├── 📄 Message.ts
│   │       │   ├── 📄 MitraSanction.ts
│   │       │   ├── 📄 MitraSanctionAppeal.ts
│   │       │   ├── 📄 NoShowAuditLog.ts
│   │       │   ├── 📄 NotificationLog.ts
│   │       │   ├── 📄 NotificationPreference.ts
│   │       │   ├── 📄 Order.ts
│   │       │   ├── 📄 OrderPassenger.ts
│   │       │   ├── 📄 OrderQrSession.ts
│   │       │   ├── 📄 OsmRouteCache.ts
│   │       │   ├── 📄 Payment.ts
│   │       │   ├── 📄 PickupPoint.ts
│   │       │   ├── 📄 PricingSetting.ts
│   │       │   ├── 📄 PushSubscription.ts
│   │       │   ├── 📄 Region.ts
│   │       │   ├── 📄 RewardTransaction.ts
│   │       │   ├── 📄 SocialLink.ts
│   │       │   ├── 📄 Trip.ts
│   │       │   ├── 📄 TripQrSession.ts
│   │       │   ├── 📄 TripReview.ts
│   │       │   ├── 📄 TripTracking.ts
│   │       │   ├── 📄 User.ts
│   │       │   ├── 📄 UserNotification.ts
│   │       │   ├── 📄 UserProfile.ts
│   │       │   ├── 📄 UserVoucher.ts
│   │       │   ├── 📄 Vehicle.ts
│   │       │   ├── 📄 Verification.ts
│   │       │   ├── 📄 VerificationFile.ts
│   │       │   ├── 📄 Voucher.ts
│   │       │   ├── 📄 VoucherRedemption.ts
│   │       │   ├── 📄 Wallet.ts
│   │       │   └── 📄 WalletTransaction.ts
│   │       └── 📄 models.ts
│   ├── 📄 guard-test.int-spec.ts
│   ├── 📁 mail/
│   │   ├── 📄 mail.module.ts
│   │   └── 📄 mail.service.ts
│   ├── 📄 main.ts
│   ├── 📁 modules/
│   │   ├── 📁 admin/
│   │   │   ├── 📄 admin.controller.ts
│   │   │   ├── 📄 admin.module.ts
│   │   │   ├── 📄 admin.repository.ts
│   │   │   ├── 📄 admin.service.ts
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 process-withdrawal.dto.ts
│   │   │   │   ├── 📄 system-setting.dto.ts
│   │   │   │   ├── 📄 update-pricing-policy.dto.ts
│   │   │   │   └── 📄 update-user-governance.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 admin.mapper.ts
│   │   │   └── 📄 sanction.service.ts
│   │   ├── 📁 auth/
│   │   │   ├── 📄 auth.controller.ts
│   │   │   ├── 📄 auth.module.ts
│   │   │   ├── 📄 auth.service.ts
│   │   │   ├── 📁 decorators/
│   │   │   │   └── 📄 roles.decorator.ts
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 forgot-password.dto.ts
│   │   │   │   ├── 📄 login.dto.ts
│   │   │   │   ├── 📄 refresh-token.dto.ts
│   │   │   │   ├── 📄 register.dto.ts
│   │   │   │   ├── 📄 reset-password.dto.ts
│   │   │   │   └── 📄 verify-otp.dto.ts
│   │   │   ├── 📁 guards/
│   │   │   │   ├── 📄 jwt-auth.guard.ts
│   │   │   │   ├── 📄 roles.guard.ts
│   │   │   │   └── 📄 ws-jwt.guard.ts
│   │   │   └── 📁 strategies/
│   │   │       └── 📄 jwt.strategy.ts
│   │   ├── 📁 banners/
│   │   │   ├── 📄 banners.controller.spec.ts
│   │   │   ├── 📄 banners.controller.ts
│   │   │   ├── 📄 banners.module.ts
│   │   │   ├── 📄 banners.service.spec.ts
│   │   │   ├── 📄 banners.service.ts
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 create-banner.dto.ts
│   │   │   │   └── 📄 update-banner.dto.ts
│   │   │   └── 📁 repository/
│   │   │       └── 📄 banners.repository.ts
│   │   ├── 📁 chat/
│   │   │   ├── 📄 chat.controller.ts
│   │   │   ├── 📄 chat.gateway.ts
│   │   │   ├── 📄 chat.module.ts
│   │   │   ├── 📄 chat.service.ts
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 create-conversation.dto.ts
│   │   │   │   └── 📄 send-message.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 chat.mapper.ts
│   │   │   └── 📁 repository/
│   │   │       └── 📄 chat.repository.ts
│   │   ├── 📁 checkpoints/
│   │   │   ├── 📄 checkpoints.controller.ts
│   │   │   ├── 📄 checkpoints.module.ts
│   │   │   ├── 📄 checkpoints.service.spec.ts
│   │   │   ├── 📄 checkpoints.service.ts
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 dispute-no-show.dto.ts
│   │   │   │   ├── 📄 manifest.dto.ts
│   │   │   │   ├── 📄 mitra-no-show.dto.ts
│   │   │   │   ├── 📄 passenger-no-show.dto.ts
│   │   │   │   └── 📄 scan-checkpoint.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 checkpoint.mapper.ts
│   │   │   └── 📁 repository/
│   │   │       └── 📄 checkpoints.repository.ts
│   │   ├── 📁 merchandises/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 create-merchandise.dto.ts
│   │   │   │   ├── 📄 redeem-merchandise.dto.ts
│   │   │   │   ├── 📄 update-merchandise.dto.ts
│   │   │   │   └── 📄 update-redemption-status.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 merchandise.mapper.ts
│   │   │   ├── 📄 merchandise.controller.ts
│   │   │   ├── 📄 merchandise.module.ts
│   │   │   ├── 📄 merchandise.service.ts
│   │   │   └── 📁 repository/
│   │   │       └── 📄 merchandise.repository.ts
│   │   ├── 📁 notifications/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 push-subscribe.dto.ts
│   │   │   │   ├── 📄 register-device.dto.ts
│   │   │   │   └── 📄 update-preference.dto.ts
│   │   │   ├── 📄 firebase.service.ts
│   │   │   ├── 📁 interfaces/
│   │   │   │   └── 📄 notification-payload.interface.ts
│   │   │   ├── 📄 notification-helper.service.ts
│   │   │   ├── 📄 notifications.controller.ts
│   │   │   ├── 📄 notifications.gateway.ts
│   │   │   ├── 📄 notifications.module.ts
│   │   │   ├── 📄 notifications.scheduler.ts
│   │   │   ├── 📄 notifications.service.ts
│   │   │   ├── 📄 push.service.ts
│   │   │   └── 📁 repository/
│   │   │       └── 📄 notifications.repository.ts
│   │   ├── 📁 orders/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 create-order-item.dto.ts
│   │   │   │   ├── 📄 create-order-passenger.dto.ts
│   │   │   │   └── 📄 create-order.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 order.mapper.ts
│   │   │   ├── 📄 orders-cancellation.cron.ts
│   │   │   ├── 📄 orders.controller.ts
│   │   │   ├── 📄 orders.module.ts
│   │   │   ├── 📄 orders.service.spec.ts
│   │   │   ├── 📄 orders.service.ts
│   │   │   └── 📁 repository/
│   │   │       └── 📄 orders.repository.ts
│   │   ├── 📁 payments/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 checkout-payment.dto.ts
│   │   │   │   ├── 📄 create-xendit-invoice.dto.ts
│   │   │   │   └── 📄 operator-summary.dto.ts
│   │   │   ├── 📄 payments.controller.ts
│   │   │   ├── 📄 payments.module.ts
│   │   │   ├── 📄 payments.service.spec.ts
│   │   │   ├── 📄 payments.service.ts
│   │   │   └── 📁 repository/
│   │   │       └── 📄 payments.repository.ts
│   │   ├── 📁 pickup-points/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 create-pickup-point.dto.ts
│   │   │   │   └── 📄 update-pickup-point.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 pickup-point.mapper.ts
│   │   │   ├── 📄 pickup-point.controller.ts
│   │   │   ├── 📄 pickup-point.service.ts
│   │   │   ├── 📄 pickup-points.module.ts
│   │   │   └── 📁 repository/
│   │   │       └── 📄 pickup-point.repository.ts
│   │   ├── 📁 regions/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 create-city.dto.ts
│   │   │   │   ├── 📄 create-region.dto.ts
│   │   │   │   └── 📄 update-region.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 region.mapper.ts
│   │   │   ├── 📄 region.controller.ts
│   │   │   ├── 📄 region.module.ts
│   │   │   ├── 📄 region.service.ts
│   │   │   └── 📁 repositories/
│   │   │       └── 📄 region.repository.ts
│   │   ├── 📁 reviews/
│   │   │   ├── 📁 dto/
│   │   │   │   └── 📄 create-review.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 review.mapper.ts
│   │   │   ├── 📁 repository/
│   │   │   │   └── 📄 reviews.repository.ts
│   │   │   ├── 📄 reviews.controller.ts
│   │   │   ├── 📄 reviews.module.ts
│   │   │   └── 📄 reviews.service.ts
│   │   ├── 📁 rewards/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 earn-reward.dto.ts
│   │   │   │   └── 📄 redeem-reward.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 reward.mapper.ts
│   │   │   ├── 📁 repository/
│   │   │   │   └── 📄 rewards.repository.ts
│   │   │   ├── 📄 rewards.controller.ts
│   │   │   ├── 📄 rewards.module.ts
│   │   │   └── 📄 rewards.service.ts
│   │   ├── 📁 social-links/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 create-social-link.dto.ts
│   │   │   │   └── 📄 update-social-link.dto.ts
│   │   │   ├── 📄 social-links.controller.ts
│   │   │   ├── 📄 social-links.module.ts
│   │   │   └── 📄 social-links.service.ts
│   │   ├── 📁 tracking/
│   │   │   ├── 📁 dto/
│   │   │   │   └── 📄 update-location.dto.ts
│   │   │   ├── 📄 osm.service.ts
│   │   │   ├── 📄 tracking.controller.ts
│   │   │   ├── 📄 tracking.cron.ts
│   │   │   ├── 📄 tracking.gateway.ts
│   │   │   ├── 📄 tracking.module.ts
│   │   │   ├── 📄 tracking.repository.ts
│   │   │   └── 📄 tracking.service.ts
│   │   ├── 📁 trips/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 cancel-trip-by-mitra.dto.ts
│   │   │   │   ├── 📄 create-trip.dto.ts
│   │   │   │   ├── 📄 query-trip.dto.ts
│   │   │   │   └── 📄 update-trip.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 trip.mapper.ts
│   │   │   ├── 📁 repository/
│   │   │   │   └── 📄 trips.repository.ts
│   │   │   ├── 📄 trips-expiration.cron.ts
│   │   │   ├── 📄 trips.controller.ts
│   │   │   ├── 📄 trips.module.ts
│   │   │   ├── 📄 trips.service.spec.ts
│   │   │   └── 📄 trips.service.ts
│   │   ├── 📁 users/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 create-user.dto.ts
│   │   │   │   ├── 📄 set-pin.dto.ts
│   │   │   │   ├── 📄 update-user-me.dto.ts
│   │   │   │   ├── 📄 update-user-profile.dto.ts
│   │   │   │   ├── 📄 update-user-status.dto.ts
│   │   │   │   ├── 📄 update-user.dto.ts
│   │   │   │   ├── 📄 user-response.dto.ts
│   │   │   │   └── 📄 verify-pin.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 user.mapper.ts
│   │   │   ├── 📁 repositories/
│   │   │   │   └── 📄 user.repository.ts
│   │   │   ├── 📄 users.controller.ts
│   │   │   ├── 📄 users.module.ts
│   │   │   └── 📄 users.service.ts
│   │   ├── 📁 vehicles/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 create-vehicle.dto.ts
│   │   │   │   └── 📄 update-vehicle.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 vehicle.mapper.ts
│   │   │   ├── 📁 repository/
│   │   │   │   └── 📄 vehicles.repository.ts
│   │   │   ├── 📄 vehicles.controller.ts
│   │   │   ├── 📄 vehicles.module.ts
│   │   │   └── 📄 vehicles.service.ts
│   │   ├── 📁 verifications/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 review-verification.dto.ts
│   │   │   │   └── 📄 submit-verification.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 verification.mapper.ts
│   │   │   ├── 📁 repositories/
│   │   │   │   └── 📄 verification.repository.ts
│   │   │   ├── 📄 verification.controller.ts
│   │   │   ├── 📄 verification.service.ts
│   │   │   └── 📄 verifications.module.ts
│   │   ├── 📁 vouchers/
│   │   │   ├── 📁 dto/
│   │   │   │   ├── 📄 create-voucher.dto.ts
│   │   │   │   ├── 📄 redeem-voucher.dto.ts
│   │   │   │   ├── 📄 update-voucher-status.dto.ts
│   │   │   │   ├── 📄 update-voucher.dto.ts
│   │   │   │   └── 📄 validate-voucher.dto.ts
│   │   │   ├── 📁 mappers/
│   │   │   │   └── 📄 voucher.mapper.ts
│   │   │   ├── 📁 repository/
│   │   │   │   └── 📄 vouchers.repository.ts
│   │   │   ├── 📄 vouchers-admin.controller.ts
│   │   │   ├── 📄 vouchers.controller.ts
│   │   │   ├── 📄 vouchers.module.ts
│   │   │   ├── 📄 vouchers.service.spec.ts
│   │   │   └── 📄 vouchers.service.ts
│   │   └── 📁 wallets/
│   │       ├── 📁 mappers/
│   │       │   └── 📄 wallet.mapper.ts
│   │       ├── 📁 repository/
│   │       │   └── 📄 wallets.repository.ts
│   │       ├── 📄 top-up-wallet.dto.ts
│   │       ├── 📄 wallets.controller.ts
│   │       ├── 📄 wallets.module.ts
│   │       ├── 📄 wallets.service.spec.ts
│   │       ├── 📄 wallets.service.ts
│   │       └── 📄 withdraw-wallet.dto.ts
│   ├── 📄 orders-cancel-test.int-spec.ts
│   ├── 📄 parcel-flow.int-spec.ts
│   ├── 📄 payments-bypass-and-wallet.int-spec.ts
│   ├── 📁 prisma/
│   │   ├── 📄 prisma.module.ts
│   │   └── 📄 prisma.service.ts
│   ├── 📄 prisma-real-test.int-spec.ts
│   ├── 📁 test-integration/
│   ├── 📄 trip-service-type.int-spec.ts
│   ├── 📄 upload.controller.ts
│   └── 📄 voucher-orders.int-spec.ts
├── 📄 structure.md
├── 📄 structure.md.bak
├── 📄 structure_clean.md
├── 📁 swagger-spec/
│   └── 📄 swagger.json
├── 📁 test/
│   ├── 📄 app.e2e-spec.ts
│   └── 📄 jest-e2e.json
├── 📄 test-env-wrong-dbname.sh
├── 📄 test-env-wrong.sh
├── 📁 test-integration/
│   ├── 📄 env-guard.ts
│   ├── 📄 seed-helper.ts
│   ├── 📄 setup.ts
│   ├── 📄 test-clean-db.ts
│   ├── 📄 test-guard-real.js
│   ├── 📄 test-guard.js
│   └── 📄 test-helper.ts
├── 📄 TESTING_NOTIFICATION_SYSTEM.md
├── 📄 tsconfig.build.json
├── 📄 tsconfig.json
├── 📄 tsconfig.seed.json
└── 📁 uploads/
    ├── 📁 avatars/
    │   ├── 📄 avatar-1788332370069-507329396.jpeg
    │   ├── 📄 avatar-1788332864727-338293548.jpeg
    │   ├── 📄 avatar-1788333906940-820627186.jpg
    │   ├── 📄 avatar-1788334157596-716724118.jpeg
    │   ├── 📄 avatar-1792504180150-601611566.jpg
    │   ├── 📄 avatar-1792760847474-655824222.jpg
    │   ├── 📄 avatar-1792824417202-368141972.jpg
    │   └── 📄 avatar-1793104629310-192887533.jpg
    ├── 📁 banners/
    │   ├── 📄 banner-1792485389613-613940662.png
    │   ├── 📄 banner-1792485463576-927977587.jpg
    │   ├── 📄 banner-1792500528328-3800301.png
    │   ├── 📄 banner-1792500543641-662995271.png
    │   ├── 📄 banner-1792501235499-175951537.png
    │   ├── 📄 banner-1792578134073-233665344.jpg
    │   ├── 📄 banner-1792578171074-114887119.png
    │   ├── 📄 banner-1792653884808-971734207.png
    │   ├── 📄 banner-1792653911947-336789201.png
    │   ├── 📄 banner-1792653926679-575531154.png
    │   ├── 📄 banner-1792653946963-21884174.png
    │   ├── 📄 banner-1792653966450-218918763.jpg
    │   ├── 📄 banner-1792757739014-515429641.png
    │   ├── 📄 banner-1792757754878-191026695.png
    │   ├── 📄 banner-1792757858346-774996812.png
    │   ├── 📄 banner-1792762146894-949560349.png
    │   ├── 📄 banner-1792762169182-964579961.jpg
    │   ├── 📄 banner-1792827146020-188121364.jpeg
    │   ├── 📄 banner-1792827253214-769705733.jpg
    │   ├── 📄 banner-1792827267602-63497054.jpg
    │   └── 📄 banner-1792827283172-536825223.jpg
    └── 📁 verifications/
        ├── 📄 verif-1788583468306-156373500.jpg
        ├── 📄 verif-1788583468386-930793520.jpg
        ├── 📄 verif-1788583468399-795820004.jpg
        ├── 📄 verif-1788583468414-554438908.jpg
        ├── 📄 verif-1788860928885-440396595.jpeg
        ├── 📄 verif-1788861661145-623720401.jpg
        ├── 📄 verif-1788872659798-108407092.jpg
        ├── 📄 verif-1788873170011-935646128.jpeg
        ├── 📄 verif-1788873738916-803214935.jpg
        ├── 📄 verif-1788873738928-288661530.jpg
        ├── 📄 verif-1788874205049-257973883.jpeg
        ├── 📄 verif-1788874205061-227353238.jpg
        ├── 📄 verif-1788874257417-882294846.jpeg
        ├── 📄 verif-1788874257431-460679731.jpg
        ├── 📄 verif-1788879503176-646768818.jpg
        ├── 📄 verif-1788879503276-102828651.jpg
        ├── 📄 verif-1788879503292-301094049.jpeg
        ├── 📄 verif-1788879503312-653688900.jpg
        ├── 📄 verif-1788880015534-579782306.jpg
        ├── 📄 verif-1788880015553-831186403.jpg
        ├── 📄 verif-1792480458632-15821027.jpg
        ├── 📄 verif-1792480459081-432071494.jpg
        ├── 📄 verif-1792480459101-982364727.jpg
        ├── 📄 verif-1792480459126-301687222.jpg
        ├── 📄 verif-1792485208548-341897593.jpg
        ├── 📄 verif-1792485208591-274305506.jpg
        ├── 📄 verif-1792486030754-243897117.jpg
        ├── 📄 verif-1792486030898-75392694.jpg
        ├── 📄 verif-1792486030929-352169450.jpg
        ├── 📄 verif-1792486030959-744870182.jpg
        ├── 📄 verif-1792486030991-310851058.jpg
        ├── 📄 verif-1792651704370-500129508.gif
        ├── 📄 verif-1792657368795-402384805.jpg
        ├── 📄 verif-1792657368996-897121387.jpg
        ├── 📄 verif-1792657369021-860704079.jpg
        ├── 📄 verif-1792657369052-318036963.jpg
        ├── 📄 verif-1793280124445-685732801.jpg
        ├── 📄 verif-1793280130607-366006890.jpg
        ├── 📄 verif-1793280131214-283454386.jpg
        ├── 📄 verif-1793280687774-618740266.jpg
        ├── 📄 verif-1793341968229-180279795.png
        ├── 📄 verif-1793345257390-836665500.png
        ├── 📄 verif-1793345259076-5753878.png
        ├── 📄 verif-1793345305804-351515240.png
        ├── 📄 verif-1793345801990-169314796.jpg
        ├── 📄 verif-1793345811298-433998241.jpg
        ├── 📄 verif-1793346253699-252723577.jpg
        ├── 📄 verif-1793346293867-842130419.jpg
        ├── 📄 verif-1793346460067-423435834.jpg
        ├── 📄 verif-1793351551352-867913206.jpg
        ├── 📄 verif-1793351551455-378229465.jpg
        ├── 📄 verif-1793351551478-185446926.jpg
        ├── 📄 verif-1793351551499-777127449.jpg
        ├── 📄 verif-1793351551516-296283440.jpg
        ├── 📄 verif-1793351794533-776194608.jpg
        └── 📄 verif-1793351794553-343147260.jpg
```
<!-- PROJECT_STRUCTURE_END -->
