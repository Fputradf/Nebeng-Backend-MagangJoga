# Frontend Push Notification System Implementation Guide

## 📋 Overview

This document provides a comprehensive guide for implementing push notification system on the frontend (React Native / React Web / Flutter / etc.) to work with the Nebeng Backend's Firebase Cloud Messaging (FCM) integration.

## 🔧 Backend API Endpoints

### Base URL
```
http://localhost:3000/api
```

### Firebase Configuration for Frontend

**VAPID Key (for Web Push):**
```
BOVKHgiSfHfVHT6NIZflujN55s8ykBVMWsTKEp9UrbKTvPc0PwK-jPDhqN4dCI1JHgw-zYVCozDTUFlimGqydl8
```

**Firebase Web Config:**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBoXUQO5lhBt9qIrW_66EZCCsEXvdFarkE",
  authDomain: "nebeng-99cb7.firebaseapp.com",
  projectId: "nebeng-99cb7",
  storageBucket: "nebeng-99cb7.firebasestorage.app",
  messagingSenderId: "463441720786",
  appId: "1:463441720786:web:b38be5f55082437980c40b",
  measurementId: "G-7XX9S7850K"
};
```

**Note:** Backend (NestJS) uses Firebase Admin SDK with Service Account credentials. Frontend uses Firebase Client SDK with the config above.

### 1. Register Device Token
**Endpoint:** `POST /notifications/register-device`
**Authentication:** Required (JWT Bearer Token)

**Request Body:**
```json
{
  "token": "fcm_device_token_here",
  "platform": "android" // "android", "ios", or "web"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device registered successfully"
}
```

**Implementation Notes:**
- Call this endpoint when user logs in successfully
- Call this endpoint again if the FCM token changes (token refresh)
- Store the token locally to avoid duplicate registration

---

### 2. Unregister Device Token
**Endpoint:** `POST /notifications/unregister-device`
**Authentication:** Required (JWT Bearer Token)

**Request Body:**
```json
{
  "token": "fcm_device_token_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device unregistered successfully"
}
```

**Implementation Notes:**
- Call this endpoint when user logs out
- Call this endpoint when token becomes invalid

---

### 3. Update Notification Preferences
**Endpoint:** `PUT /notifications/preferences`
**Authentication:** Required (JWT Bearer Token)

**Request Body:**
```json
{
  "enablePushNotifications": true,
  "enableEmailNotifications": true,
  "orderNotifications": true,
  "tripNotifications": true,
  "chatNotifications": true,
  "paymentNotifications": true,
  "promotionNotifications": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Preferences updated successfully"
}
```

---

### 4. Get Notification Preferences
**Endpoint:** `GET /notifications/preferences`
**Authentication:** Required (JWT Bearer Token)

**Response:**
```json
{
  "id": "1",
  "userId": "123",
  "enablePushNotifications": true,
  "enableEmailNotifications": true,
  "orderNotifications": true,
  "tripNotifications": true,
  "chatNotifications": true,
  "paymentNotifications": true,
  "promotionNotifications": false,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

---

### 5. Get Notification History
**Endpoint:** `GET /notifications/history`
**Authentication:** Required (JWT Bearer Token)

**Query Parameters:**
- `limit` (optional, default: 50) - Number of notifications to fetch
- `offset` (optional, default: 0) - Pagination offset

**Response:**
```json
[
  {
    "id": "1",
    "userId": "123",
    "type": "order_created",
    "title": "Pesanan Berhasil Dibuat",
    "body": "Pesanan #123 untuk perjalanan Anda telah dibuat.",
    "data": "{\"orderId\":\"123\",\"type\":\"order_created\"}",
    "status": "sent",
    "deviceId": "456",
    "errorMessage": null,
    "sentAt": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

## 🔔 Notification Types

The backend sends notifications with the following types:

| Type | Description | Use Case |
|------|-------------|----------|
| `order_created` | Order successfully created | Customer creates a new order |
| `order_paid` | Payment successful | Customer completes payment |
| `order_cancelled` | Order cancelled | Order is cancelled |
| `trip_started` | Trip started | Mitra starts the trip |
| `trip_arrived` | Trip arrived at destination | Trip reaches destination |
| `trip_completed` | Trip completed | Trip is finished |
| `checkpoint_scanned` | QR check-in | QR code scanned at checkpoint |
| `chat_message` | New chat message | New message in conversation |
| `payment_success` | Payment successful | Wallet payment success |
| `payment_failed` | Payment failed | Wallet payment failed |
| `escrow_released` | Escrow funds released | Funds released to mitra wallet |
| `reward_earned` | Reward points earned | User earns reward points |
| `reward_redeemed` | Reward points redeemed | User redeems reward points |
| `verification_approved` | Verification approved | Document verification approved |
| `verification_rejected` | Verification rejected | Document verification rejected |
| `trip_booking_request` | New booking request | Mitra receives new booking |

---

## 📱 Platform-Specific Implementation

### React Native Implementation

#### 1. Install Dependencies
```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
# or
yarn add @react-native-firebase/app @react-native-firebase/messaging
```

#### 2. Configure Firebase
- Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from Firebase Console
- Place them in the appropriate platform folders

#### 3. Register Device Token
```javascript
import messaging from '@react-native-firebase/messaging';
import { registerDeviceToken } from './api/notifications';

const requestUserPermission = async () => {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('Authorization status:', authStatus);
  }
};

const getToken = async (userId) => {
  await requestUserPermission();
  const token = await messaging().getToken();
  console.log('FCM Token:', token);

  // Register token with backend
  await registerDeviceToken(token, Platform.OS);
};

// Call this when user logs in
getToken(userId);
```

#### 4. Handle Incoming Notifications
```javascript
const setupNotificationListeners = () => {
  // Foreground message handler
  messaging().onMessage(async remoteMessage => {
    console.log('Foreground notification:', remoteMessage);
    // Show in-app notification or update UI
  });

  // Background/quit state handler
  messaging().onNotificationOpenedApp(remoteMessage => {
    console.log('Notification opened app:', remoteMessage);
    // Navigate to specific screen based on notification data
    handleNotificationNavigation(remoteMessage.data);
  });

  // Check if app was opened from notification
  messaging().getInitialNotification().then(remoteMessage => {
    if (remoteMessage) {
      console.log('App opened from notification:', remoteMessage);
      handleNotificationNavigation(remoteMessage.data);
    }
  });
};

const handleNotificationNavigation = (data) => {
  const { type, orderId, tripId, conversationId } = data;

  switch (type) {
    case 'order_created':
    case 'order_paid':
      navigation.navigate('OrderDetail', { orderId });
      break;
    case 'trip_started':
    case 'trip_completed':
      navigation.navigate('TripDetail', { tripId });
      break;
    case 'chat_message':
      navigation.navigate('Chat', { conversationId });
      break;
    case 'checkpoint_scanned':
      navigation.navigate('Tracking', { tripId });
      break;
    default:
      navigation.navigate('Notifications');
  }
};
```

#### 5. Handle Token Refresh
```javascript
messaging().onTokenRefresh(token => {
  console.log('Token refreshed:', token);
  // Register new token with backend
  registerDeviceToken(token, Platform.OS);
});
```

---

### React Web Implementation

#### 1. Install Dependencies
```bash
npm install firebase
# or
yarn add firebase
```

#### 2. Initialize Firebase
```javascript
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const firebaseApp = initializeApp(firebaseConfig);
const messaging = getMessaging(firebaseApp);
```

#### 3. Request Permission and Get Token
```javascript
const requestNotificationPermission = async () => {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    console.log('Notification permission granted.');
    const token = await getToken(messaging, { 
      vapidKey: 'BOVKHgiSfHfVHT6NIZflujN55s8ykBVMWsTKEp9UrbKTvPc0PwK-jPDhqN4dCI1JHgw-zYVCozDTUFlimGqydl8'
    });
    console.log('FCM Token:', token);
    await registerDeviceToken(token, 'web');
  }
};

// Call this when user logs in
requestNotificationPermission();
```

#### 4. Handle Foreground Notifications
```javascript
onMessage(messaging, (payload) => {
  console.log('Foreground notification:', payload);
  // Show custom in-app notification
  showInAppNotification(payload.notification.title, payload.notification.body);
});
```

---

### Flutter Implementation

#### 1. Install Dependencies
```yaml
dependencies:
  firebase_messaging: ^14.7.0
  flutter_local_notifications: ^16.0.0
```

#### 2. Configure Firebase
- Follow Firebase Flutter setup guide
- Add `google-services.json` and `GoogleService-Info.plist`

#### 3. Register Device Token
```dart
import 'package:firebase_messaging/firebase_messaging.dart';

Future<void> registerDevice(String userId) async {
  FirebaseMessaging messaging = FirebaseMessaging.instance;

  NotificationSettings settings = await messaging.requestPermission(
    alert: true,
    announcement: false,
    badge: true,
    carPlay: false,
    criticalAlert: false,
    provisional: false,
    sound: true,
  );

  if (settings.authorizationStatus == AuthorizationStatus.authorized) {
    String? token = await messaging.getToken();
    print('FCM Token: $token');
    await registerDeviceToken(token!, 'android');
  }
}
```

#### 4. Handle Notifications
```dart
FirebaseMessaging.onMessage.listen((RemoteMessage message) {
  print('Foreground notification: ${message.notification?.title}');
  // Show local notification
  showLocalNotification(message);
});

FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
  print('Notification opened app: ${message.data}');
  handleNotificationNavigation(message.data);
});
```

---

## 🎨 UI Implementation Recommendations

### 1. Notification Permission Request Screen
- Show a dedicated screen asking for notification permission
- Explain the benefits of enabling notifications
- Provide "Allow" and "Not Now" options

### 2. Notification Settings Screen
```javascript
// Settings screen with toggle switches
<Switch
  value={preferences.enablePushNotifications}
  onValueChange={(value) => updatePreferences({ enablePushNotifications: value })}
/>
<Switch
  value={preferences.orderNotifications}
  onValueChange={(value) => updatePreferences({ orderNotifications: value })}
/>
<Switch
  value={preferences.chatNotifications}
  onValueChange={(value) => updatePreferences({ chatNotifications: value })}
/>
// ... other switches
```

### 3. Notification List Screen
- Display notification history from `/notifications/history`
- Show notification type, title, body, and timestamp
- Implement pagination (load more on scroll)
- Tap on notification to navigate to relevant screen
- Mark as read functionality (optional)

### 4. In-App Notification Badge
- Show badge count on notification icon
- Update badge count when new notification arrives
- Clear badge when notifications are read

---

## 🔐 Security Considerations

1. **Always authenticate requests** - All notification endpoints require JWT authentication
2. **Secure FCM token storage** - Store tokens securely in device storage
3. **Handle token refresh** - FCM tokens can expire, always refresh and re-register
4. **Validate notification data** - Don't blindly trust notification data, validate before navigation
5. **Rate limiting** - Implement client-side rate limiting for preference updates

---

## 🧪 Testing

### Test Scenarios
1. **Token Registration**
   - Register device token on login
   - Verify token is saved in backend
   - Test token refresh scenario

2. **Notification Reception**
   - Create an order and verify notification received
   - Complete a payment and verify notification received
   - Send a chat message and verify notification received

3. **Navigation**
   - Tap on notification and verify correct screen opens
   - Test with app in foreground, background, and killed state

4. **Preferences**
   - Disable specific notification types
   - Verify notifications are not received for disabled types
   - Re-enable and verify notifications resume

5. **Notification History**
   - Fetch notification history
   - Test pagination
   - Verify data integrity

---

## 📊 Analytics (Optional)

Consider tracking the following metrics:
- Notification opt-in rate
- Notification open rate
- Click-through rate per notification type
- Token refresh frequency
- Failed notification attempts

---

## 🐛 Troubleshooting

### Common Issues

1. **Notifications not received**
   - Check if device token is registered
   - Verify Firebase project configuration
   - Check notification preferences are enabled
   - Check if Firebase credentials are valid in backend

2. **Token registration fails**
   - Verify network connectivity
   - Check if JWT token is valid
   - Verify API endpoint is correct

3. **Navigation not working**
   - Check if notification data is correct
   - Verify screen names match navigation structure
   - Test with app in different states (foreground, background)

4. **Permission denied**
   - User may have denied notification permission
   - Show settings to enable permission manually
   - Handle gracefully with in-app notifications

---

## 📝 Checklist

- [ ] Install FCM SDK for your platform
- [ ] Configure Firebase project
- [ ] Implement device token registration on login
- [ ] Implement token refresh handler
- [ ] Implement foreground notification handler
- [ ] Implement background notification handler
- [ ] Implement notification tap navigation
- [ ] Create notification settings screen
- [ ] Create notification history screen
- [ ] Test all notification types
- [ ] Test with app in different states
- [ ] Handle edge cases (no token, permission denied, etc.)

---

## 📞 Support

For any issues or questions regarding the notification system, please contact the backend team or refer to:
- Firebase Cloud Messaging Documentation: https://firebase.google.com/docs/cloud-messaging
- Backend API Documentation: http://localhost:3000/api (Swagger UI)

---

**Last Updated:** 2024-10-22
**Backend Version:** 1.0.0
