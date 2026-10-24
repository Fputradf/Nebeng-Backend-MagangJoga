# 🧪 Testing Guide: Realtime Notification System

## 📋 Overview

This guide provides comprehensive steps to test the push notification system for both backend and frontend implementations.

---

## 🔧 Prerequisites

### Backend
- ✅ Backend server running (`npm run start:dev`)
- ✅ Firebase credentials configured in `.env`
- ✅ Database connected and migrated
- ✅ Test user account created

### Frontend
- ✅ Frontend app running
- ✅ Firebase configuration added
- ✅ VAPID key configured
- ✅ Service worker registered

---

## 🧪 Backend Testing

### 1. Test Device Token Registration

#### Using cURL:
```bash
# Register device token
curl -X POST http://localhost:3000/api/notifications/register-device \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "token": "test_fcm_token_12345",
    "platform": "web"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Device registered successfully"
}
```

#### Using Postman:
1. Open Postman
2. Create POST request to `http://localhost:3000/api/notifications/register-device`
3. Add header: `Authorization: Bearer YOUR_JWT_TOKEN`
4. Add body (JSON):
```json
{
  "token": "test_fcm_token_12345",
  "platform": "web"
}
```

#### Verify in Database:
```sql
SELECT * FROM device_tokens WHERE user_id = YOUR_USER_ID;
```

---

### 2. Test Notification Preferences

#### Get Preferences:
```bash
curl -X GET http://localhost:3000/api/notifications/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Update Preferences:
```bash
curl -X PUT http://localhost:3000/api/notifications/preferences \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "enablePushNotifications": true,
    "orderNotifications": true,
    "chatNotifications": true
  }'
```

---

### 3. Test Notification History

```bash
curl -X GET "http://localhost:3000/api/notifications/history?limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 4. Test Direct Notification Send (Backend Only)

Create a temporary test endpoint in `notifications.controller.ts`:

```typescript
@Post('test-send')
async testSend(@Request() req) {
  const userId = req.user?.id || req.user?.sub;
  
  await this.notificationsService.sendNotification({
    userId,
    type: 'order_created' as any,
    payload: {
      title: 'Test Notification',
      body: 'This is a test notification from backend',
      data: {
        type: 'test',
        timestamp: new Date().toISOString()
      }
    }
  });

  return { success: true, message: 'Test notification sent' };
}
```

Test it:
```bash
curl -X POST http://localhost:3000/api/notifications/test-send \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 5. Test Notification Helper Methods

Create a test endpoint for each helper method:

```typescript
@Post('test-order-created')
async testOrderCreated(@Request() req) {
  const userId = req.user?.id || req.user?.sub;
  await this.notificationHelper.notifyOrderCreated(userId, 'TEST-123', {
    origin: 'Jakarta',
    destination: 'Bandung',
    departureDate: new Date().toISOString()
  });
  return { success: true };
}

@Post('test-chat-message')
async testChatMessage(@Request() req) {
  const userId = req.user?.id || req.user?.sub;
  await this.notificationHelper.notifyChatMessage(userId, 'conv-123', 'Test User');
  return { success: true };
}
```

---

## 📱 Frontend Testing

### 1. Test FCM Token Generation

#### Browser Console:
```javascript
// Open browser console (F12)

// Check if Firebase is initialized
console.log('Firebase App:', firebase.app());

// Get FCM token
import { getMessaging, getToken } from 'firebase/messaging';
const messaging = getMessaging(firebase.app());

getToken(messaging, { 
  vapidKey: 'BOVKHgiSfHfVHT6NIZflujN55s8ykBVMWsTKEp9UrbKTvPc0PwK-jPDhqN4dCI1JHgw-zYVCozDTUFlimGqydl8'
}).then(token => {
  console.log('FCM Token:', token);
  // Copy this token for testing
});
```

#### React Native Console:
```javascript
// In React Native
import messaging from '@react-native-firebase/messaging';

messaging().getToken().then(token => {
  console.log('FCM Token:', token);
});
```

---

### 2. Test Permission Request

#### Manual Trigger:
```javascript
// In browser console
Notification.requestPermission().then(permission => {
  console.log('Permission:', permission);
});
```

#### Via UI:
1. Log in to the app
2. Look for permission request popup
3. Click "Allow"
4. Check browser console for token generation

---

### 3. Test Foreground Notifications

#### Method 1: Use Firebase Console
1. Go to Firebase Console: https://console.firebase.google.com/project/nebeng-99cb7/cloud-messaging
2. Click "Send your first message"
3. Target: "User segment" → "New user segment" → Select your test device token
4. Enter title and body
5. Click "Send"
6. Check if notification appears in app (foreground)

#### Method 2: Use Backend Test Endpoint
```bash
# After adding test endpoint in backend
curl -X POST http://localhost:3000/api/notifications/test-send \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Method 3: Trigger Real Events
- Create a new order → Should receive `order_created` notification
- Complete a payment → Should receive `order_paid` notification
- Send a chat message → Should receive `chat_message` notification

---

### 4. Test Background Notifications

#### Steps:
1. Open the app
2. Log in
3. Minimize the app (don't close)
4. Trigger a notification (via Firebase Console or backend)
5. Check system notification tray
6. Click the notification
7. Verify app opens and navigates to correct screen

---

### 5. Test Killed State Notifications

#### Steps:
1. Open the app
2. Log in
3. Completely close the app (kill process)
3. Trigger a notification
4. Check system notification tray
5. Click the notification
6. Verify app opens and navigates to correct screen

---

## 🔗 Integration Testing (Backend + Frontend)

### Test Scenario 1: Order Creation Flow

**Backend:**
```bash
# Create an order via API
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer CUSTOMER_JWT_TOKEN" \
  -d '{
    "tripId": "1",
    "type": "passenger",
    "seatsBooked": 1
  }'
```

**Frontend (Customer):**
- Should receive notification: "Pesanan Berhasil Dibuat"
- Click notification → Should navigate to order detail

**Frontend (Mitra):**
- Should receive notification: "Booking Baru"
- Click notification → Should navigate to order list

---

### Test Scenario 2: Payment Flow

**Backend:**
```bash
# Complete payment
curl -X POST http://localhost:3000/api/payments/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer CUSTOMER_JWT_TOKEN" \
  -d '{
    "orderId": "1",
    "paymentGateway": "WALLET",
    "pin": "123456"
  }'
```

**Frontend (Customer):**
- Should receive notification: "Pembayaran Berhasil"
- Click notification → Should navigate to order detail

---

### Test Scenario 3: Chat Flow

**Backend:**
```bash
# Send chat message
curl -X POST http://localhost:3000/api/chat/messages/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SENDER_JWT_TOKEN" \
  -d '{
    "messageText": "Hello, this is a test message"
  }'
```

**Frontend (Recipient):**
- Should receive notification: "Pesan Baru"
- Click notification → Should navigate to chat screen

---

### Test Scenario 4: Checkpoint Flow

**Backend:**
```bash
# Scan QR checkpoint
curl -X POST http://localhost:3000/api/checkpoints/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OPERATOR_JWT_TOKEN" \
  -d '{
    "qrCodeTrip": "TRIP-1",
    "qrCodeTicket": "TKT-1",
    "scanType": "checkin_origin",
    "posId": "1"
  }'
```

**Frontend (Customer):**
- Should receive notification: "Check-in Berhasil"
- Click notification → Should navigate to tracking screen

---

## 🛠️ Testing Tools

### 1. Firebase Console (Web-based)
**URL:** https://console.firebase.google.com/project/nebeng-99cb7/cloud-messaging

**Features:**
- Send test notifications
- View device tokens
- Analyze delivery statistics
- Debug failed notifications

**Steps:**
1. Go to Cloud Messaging
2. Click "Send your first message"
3. Configure notification
4. Send to specific device token
5. Monitor delivery status

---

### 2. Postman (API Testing)

**Create Collection:**
1. Create new collection: "Nebeng Notifications"
2. Add requests:
   - Register Device
   - Unregister Device
   - Get Preferences
   - Update Preferences
   - Get History
   - Test Send (if endpoint added)

**Environment Variables:**
```
BASE_URL = http://localhost:3000/api
JWT_TOKEN = your_jwt_token_here
```

---

### 3. Browser DevTools

**Console Testing:**
```javascript
// Test FCM token
getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY' })
  .then(token => console.log('Token:', token));

// Test permission
Notification.requestPermission()
  .then(permission => console.log('Permission:', permission));

// Test service worker
navigator.serviceWorker.getRegistrations()
  .then(registrations => console.log('SW:', registrations));
```

**Network Tab:**
- Monitor API calls to `/notifications/*`
- Check request/response headers
- Verify JWT token is sent

**Application Tab:**
- Check Service Workers status
- View Cache Storage
- Monitor IndexedDB (if used)

---

### 4. React Native Debugger

**Flipper:**
- Connect to React Native app
- View network requests
- Check console logs
- Inspect React component tree

**Reactotron:**
- Configure Reactotron for debugging
- View Redux state
- Monitor API calls
- Track navigation

---

## 📊 Testing Checklist

### Backend Tests
- [ ] Device token registration works
- [ ] Device token unregistration works
- [ ] Notification preferences update works
- [ ] Notification history fetch works
- [ ] Firebase SDK initializes without errors
- [ ] Notification helper methods execute successfully
- [ ] Invalid tokens are cleaned up
- [ ] Auto-delete scheduler runs (check after 24h)

### Frontend Tests (Web)
- [ ] Permission request popup appears
- [ ] User can grant/deny permission
- [ ] FCM token is generated
- [ ] Token is registered with backend
- [ ] Foreground notifications appear
- [ ] Background notifications appear
- [ ] Killed state notifications appear
- [ ] Navigation works correctly
- [ ] Notification history displays
- [ ] Preferences toggle works
- [ ] Unread count updates

### Frontend Tests (Mobile)
- [ ] Permission request appears (Android/iOS)
- [ ] FCM token is generated
- [ ] Token is registered with backend
- [ ] Foreground notifications appear
- [ ] Background notifications appear
- [ ] Killed state notifications appear
- [ ] Navigation works correctly
- [ ] Notification sound plays
- [ ] Badge count updates

### Integration Tests
- [ ] Order creation triggers notification
- [ ] Payment triggers notification
- [ ] Chat message triggers notification
- [ ] Checkpoint scan triggers notification
- [ ] Verification approval triggers notification
- [ ] Reward earned triggers notification
- [ ] Preferences filter notifications correctly
- [ ] Multiple devices receive notifications

---

## 🐛 Common Issues & Solutions

### Issue: Token Registration Fails
**Symptoms:** 401 Unauthorized or token not saved

**Solutions:**
1. Check JWT token is valid and not expired
2. Verify API endpoint is correct
3. Check network connectivity
4. Check browser console for CORS errors

**Debug:**
```javascript
// Check JWT token
localStorage.getItem('jwt_token');

// Check API call
fetch('http://localhost:3000/api/notifications/register-device', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ token: 'test', platform: 'web' })
}).then(r => r.json()).then(console.log);
```

---

### Issue: Notifications Not Received

**Symptoms:** No notification appears even after trigger

**Solutions:**
1. Check Firebase Console to see if delivery failed
2. Verify device token is valid
3. Check notification preferences are enabled
4. Verify backend logs for errors
5. Check if user is logged in

**Debug:**
```javascript
// Check FCM token
console.log('FCM Token:', localStorage.getItem('fcm_token'));

// Check preferences
fetch('http://localhost:3000/api/notifications/preferences', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log);
```

---

### Issue: Navigation Not Working

**Symptoms:** Notification appears but clicking doesn't navigate

**Solutions:**
1. Check notification data is correct
2. Verify route names match navigation structure
3. Check if routing is properly configured
4. Test with app in different states

**Debug:**
```javascript
// Add logging in service worker
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification.data);
});
```

---

### Issue: Permission Denied

**Symptoms:** User denied permission, can't request again

**Solutions:**
1. User must manually enable in browser settings
2. Show UI instruction to enable permission
3. Use browser notification settings guide

**Chrome:**
Settings → Privacy and security → Site Settings → Notifications

**Firefox:**
Preferences → Privacy & Security → Permissions → Notifications

---

### Issue: Service Worker Not Registered

**Symptoms:** Background notifications don't work

**Solutions:**
1. Check service worker file is in `public/` folder
2. Verify service worker is served from root
3. Check browser console for SW errors
4. Verify HTTPS is used (production)

**Debug:**
```javascript
// Check service worker registration
navigator.serviceWorker.getRegistrations().then(registrations => {
  console.log('Registered SWs:', registrations);
});

// Unregister and re-register
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(reg => reg.unregister());
});
```

---

## 📈 Performance Testing

### Load Testing

Test notification delivery under high load:

```bash
# Install artillery
npm install -g artillery

# Create test config (load-test.yml)
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - flow:
    - post:
        url: '/api/notifications/register-device'
        headers:
          Authorization: 'Bearer YOUR_JWT_TOKEN'
        json:
          token: 'test_token_{{$randomNumber()}}'
          platform: 'web'
```

**Run test:**
```bash
artillery run load-test.yml
```

---

## 🎯 Automation Testing

### Jest Tests for Backend

Create `notifications.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './repository/notifications.repository';
import { FirebaseService } from './firebase.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NotificationsRepository,
          useValue: {
            createDeviceToken: jest.fn(),
            getActiveDeviceTokens: jest.fn().mockResolvedValue([
              { token: 'test_token' }
            ]),
            createNotificationLog: jest.fn(),
            updateNotificationLogStatus: jest.fn(),
          },
        },
        {
          provide: FirebaseService,
          useValue: {
            sendMulticast: jest.fn().mockResolvedValue({
              success: 1,
              failure: 0,
              invalidTokens: []
            }),
            isInitialized: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should send notification successfully', async () => {
    const result = await service.sendNotification({
      userId: '1',
      type: 'order_created' as any,
      payload: {
        title: 'Test',
        body: 'Test body',
      },
    });

    expect(result).toBe(true);
  });
});
```

**Run tests:**
```bash
npm test -- notifications.service.spec.ts
```

---

## 📝 Test Report Template

```markdown
# Notification System Test Report

**Date:** [DATE]
**Tester:** [NAME]
**Environment:** [DEV/STAGING/PROD]

## Backend Tests

| Test Case | Status | Notes |
|----------|--------|-------|
| Device Token Registration | ✅/❌ | |
| Device Token Unregistration | ✅/❌ | |
| Update Preferences | ✅/❌ | |
| Get Preferences | ✅/❌ | |
| Get History | ✅/❌ | |
| Firebase Initialization | ✅/❌ | |

## Frontend Tests (Web)

| Test Case | Status | Notes |
|----------|--------|-------|
| Permission Request | ✅/❌ | |
| Token Generation | ✅/❌ | |
| Foreground Notification | ✅/❌ | |
| Background Notification | ✅/❌ | |
| Killed State Notification | ✅/❌ | |
| Navigation | ✅/❌ | |
| Preferences Toggle | ✅/❌ | |

## Integration Tests

| Test Case | Status | Notes |
|----------|--------|-------|
| Order Creation Notification | ✅/❌ | |
| Payment Notification | ✅/❌ | |
| Chat Notification | ✅/❌ | |
| Checkpoint Notification | ✅/❌ | |

## Issues Found

1. [Description]
2. [Description]

## Recommendations

1. [Recommendation]
2. [Recommendation]
```

---

## 🚀 Production Readiness Checklist

Before deploying to production:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Firebase project is in production mode
- [ ] Service worker is HTTPS ready
- [ ] Error tracking is set up (Sentry, etc.)
- [ ] Analytics is configured
- [ ] Rate limiting is enabled
- [ ] Database cleanup scheduler is working
- [ ] Monitoring is set up for notification delivery
- [ ] Fallback mechanisms are in place

---

**Last Updated:** 2024-10-23
