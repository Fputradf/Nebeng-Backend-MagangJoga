# 🚀 Frontend Development Prompt: Push Notification System Implementation

## 📋 Project Context

**Project Name:** Nebeng (Ride-Sharing & Logistics Platform)
**Backend:** NestJS with Firebase Cloud Messaging (FCM)
**Frontend Framework:** [Specify: React Native / React Web / Flutter / Other]
**Firebase Project ID:** nebeng-99cb7

---

## 🎯 Task Overview

Implement push notification system on the frontend to work with the existing backend's Firebase Cloud Messaging integration. The backend is already fully implemented with the following features:

- Device token registration/management
- User notification preferences
- Notification history tracking
- Auto-delete notifications older than 3 months
- Integration with orders, trips, chat, payments, verifications, and rewards modules

---

## 🔥 Firebase Configuration

### Firebase Project Details
- **Project ID:** `nebeng-99cb7`
- **App ID:** `1:463441720786:web:b38be5f55082437980c40b`
- **Messaging Sender ID:** `463441720786`

### Firebase Client SDK Configuration (for Frontend Web)
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

### VAPID Key (for Web Push Only)
```
BOVKHgiSfHfVHT6NIZflujN55s8ykBVMWsTKEp9UrbKTvPc0PwK-jPDhqN4dCI1JHgw-zYVCozDTUFlimGqydl8
```

**Note:** Backend uses Firebase Admin SDK with Service Account credentials. Frontend uses Firebase Client SDK with the config above.

---

## 🌐 Backend API Base URL

```
http://localhost:3000/api
```

**Note:** Update this to production URL when deploying.

---

## 📡 API Endpoints

### 1. Register Device Token
**Endpoint:** `POST /notifications/register-device`
**Authentication:** JWT Bearer Token required
**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "token": "fcm_device_token_here",
  "platform": "android"
}
```

**Platform Options:** `android`, `ios`, `web`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Device registered successfully"
}
```

**Implementation Timing:**
- Call when user successfully logs in
- Call again if FCM token refreshes (token changes)
- Store token locally to avoid duplicate registration

---

### 2. Unregister Device Token
**Endpoint:** `POST /notifications/unregister-device`
**Authentication:** JWT Bearer Token required

**Request Body:**
```json
{
  "token": "fcm_device_token_here"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Device unregistered successfully"
}
```

**Implementation Timing:**
- Call when user logs out
- Call when token becomes invalid (handle token refresh errors)

---

### 3. Update Notification Preferences
**Endpoint:** `PUT /notifications/preferences`
**Authentication:** JWT Bearer Token required

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

**All fields are optional.**

**Success Response (200):**
```json
{
  "success": true,
  "message": "Preferences updated successfully"
}
```

---

### 4. Get Notification Preferences
**Endpoint:** `GET /notifications/preferences`
**Authentication:** JWT Bearer Token required

**Success Response (200):**
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
**Authentication:** JWT Bearer Token required

**Query Parameters:**
- `limit` (optional, default: 50) - Number of notifications to fetch
- `offset` (optional, default: 0) - Pagination offset

**Example:**
```
GET /notifications/history?limit=20&offset=0
```

**Success Response (200):**
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

The backend sends notifications with the following types. Use these for routing/navigation logic:

| Type | Description | Navigation Target |
|------|-------------|-------------------|
| `order_created` | Order successfully created | Order Detail Screen (orderId) |
| `order_paid` | Payment successful | Order Detail Screen (orderId) |
| `order_cancelled` | Order cancelled | Order Detail Screen (orderId) |
| `trip_started` | Trip started | Trip/Tracking Screen (tripId) |
| `trip_arrived` | Trip arrived at destination | Trip/Tracking Screen (tripId) |
| `trip_completed` | Trip completed | Trip/Tracking Screen (tripId) |
| `checkpoint_scanned` | QR check-in | Tracking Screen (tripId) |
| `chat_message` | New chat message | Chat Screen (conversationId) |
| `payment_success` | Payment successful | Wallet/History Screen |
| `payment_failed` | Payment failed | Wallet/History Screen |
| `escrow_released` | Escrow funds released | Wallet Screen |
| `reward_earned` | Reward points earned | Rewards Screen |
| `reward_redeemed` | Reward points redeemed | Rewards Screen |
| `verification_approved` | Verification approved | Profile/Verification Screen |
| `verification_rejected` | Verification rejected | Profile/Verification Screen |
| `trip_booking_request` | New booking request | Order List Screen (Mitra) |

---

## 📱 Platform-Specific Implementation

### A. React Native Implementation

#### 1. Install Dependencies
```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
# or
yarn add @react-native-firebase/app @react-native-firebase/messaging
```

#### 2. Configure Firebase
- Download `google-services.json` (Android) from Firebase Console
- Download `GoogleService-Info.plist` (iOS) from Firebase Console
- Place `google-services.json` in `android/app/`
- Place `GoogleService-Info.plist` in `ios/Runner/`

#### 3. Android Configuration
Add to `android/app/build.gradle`:
```gradle
apply plugin: 'com.google.gms.google-services'
```

Add to `android/build.gradle`:
```gradle
buildscript {
  dependencies {
    classpath 'com.google.gms:google-services:4.3.15'
  }
}
```

#### 4. iOS Configuration
Add to `ios/Podfile`:
```ruby
pod 'Firebase/Core'
pod 'Firebase/Messaging'
```

Run:
```bash
cd ios
pod install
```

#### 5. Implementation Code

**Register Device Token:**
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

**Handle Incoming Notifications:**
```javascript
import { useNavigation } from '@react-navigation/native';

const setupNotificationListeners = () => {
  const navigation = useNavigation();

  // Foreground message handler
  messaging().onMessage(async remoteMessage => {
    console.log('Foreground notification:', remoteMessage);
    // Show in-app notification or update UI
    Alert.alert(
      remoteMessage.notification.title,
      remoteMessage.notification.body
    );
  });

  // Background/quit state handler
  messaging().onNotificationOpenedApp(remoteMessage => {
    console.log('Notification opened app:', remoteMessage);
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
    case 'order_cancelled':
      navigation.navigate('OrderDetail', { orderId });
      break;
    case 'trip_started':
    case 'trip_arrived':
    case 'trip_completed':
    case 'checkpoint_scanned':
      navigation.navigate('Tracking', { tripId });
      break;
    case 'chat_message':
      navigation.navigate('Chat', { conversationId });
      break;
    case 'payment_success':
    case 'payment_failed':
    case 'escrow_released':
      navigation.navigate('Wallet');
      break;
    case 'reward_earned':
    case 'reward_redeemed':
      navigation.navigate('Rewards');
      break;
    case 'verification_approved':
    case 'verification_rejected':
      navigation.navigate('Profile');
      break;
    case 'trip_booking_request':
      navigation.navigate('OrdersList');
      break;
    default:
      navigation.navigate('Notifications');
  }
};
```

**Handle Token Refresh:**
```javascript
messaging().onTokenRefresh(token => {
  console.log('Token refreshed:', token);
  // Register new token with backend
  registerDeviceToken(token, Platform.OS);
});
```

**API Helper:**
```javascript
// api/notifications.js
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

export const registerDeviceToken = async (token, platform) => {
  try {
    const jwtToken = await AsyncStorage.getItem('jwt_token');
    const response = await axios.post(
      `${API_BASE_URL}/notifications/register-device`,
      { token, platform },
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to register device token:', error);
    throw error;
  }
};

export const unregisterDeviceToken = async (token) => {
  try {
    const jwtToken = await AsyncStorage.getItem('jwt_token');
    const response = await axios.post(
      `${API_BASE_URL}/notifications/unregister-device`,
      { token },
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to unregister device token:', error);
    throw error;
  }
};

export const getNotificationPreferences = async () => {
  try {
    const jwtToken = await AsyncStorage.getItem('jwt_token');
    const response = await axios.get(
      `${API_BASE_URL}/notifications/preferences`,
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to get preferences:', error);
    throw error;
  }
};

export const updateNotificationPreferences = async (preferences) => {
  try {
    const jwtToken = await AsyncStorage.getItem('jwt_token');
    const response = await axios.put(
      `${API_BASE_URL}/notifications/preferences`,
      preferences,
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to update preferences:', error);
    throw error;
  }
};

export const getNotificationHistory = async (limit = 50, offset = 0) => {
  try {
    const jwtToken = await AsyncStorage.getItem('jwt_token');
    const response = await axios.get(
      `${API_BASE_URL}/notifications/history`,
      {
        params: { limit, offset },
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to get notification history:', error);
    throw error;
  }
};
```

---

### B. React Web Implementation

#### 1. Install Dependencies
```bash
npm install firebase
# or
yarn add firebase
```

#### 2. Initialize Firebase
```javascript
// firebaseConfig.js
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyBoXUQO5lhBt9qIrW_66EZCCsEXvdFarkE",
  authDomain: "nebeng-99cb7.firebaseapp.com",
  projectId: "nebeng-99cb7",
  storageBucket: "nebeng-99cb7.firebasestorage.app",
  messagingSenderId: "463441720786",
  appId: "1:463441720786:web:b38be5f55082437980c40b",
  measurementId: "G-7XX9S7850K"
};

const firebaseApp = initializeApp(firebaseConfig);
const messaging = getMessaging(firebaseApp);

export { firebaseApp, messaging };
```

#### 3. Request Permission and Get Token
```javascript
import { messaging } from './firebaseConfig';
import { registerDeviceToken } from './api/notifications';

const VAPID_KEY = 'BOVKHgiSfHfVHT6NIZflujN55s8ykBVMWsTKEp9UrbKTvPc0PwK-jPDhqN4dCI1JHgw-zYVCozDTUFlimGqydl8';

const requestNotificationPermission = async () => {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    console.log('Notification permission granted.');
    const token = await getToken(messaging, { 
      vapidKey: VAPID_KEY 
    });
    console.log('FCM Token:', token);
    await registerDeviceToken(token, 'web');
  } else {
    console.log('Notification permission denied.');
  }
};

// Call this when user logs in
requestNotificationPermission();
```

#### 4. Handle Foreground Notifications
```javascript
import { messaging } from './firebaseConfig';

onMessage(messaging, (payload) => {
  console.log('Foreground notification:', payload);
  // Show custom in-app notification
  showInAppNotification(
    payload.notification.title, 
    payload.notification.body,
    payload.data
  );
});

const showInAppNotification = (title, body, data) => {
  // Implement your custom in-app notification UI
  // Example: using react-toastify, notistack, or custom component
  console.log('In-app notification:', { title, body, data });
};
```

#### 5. Service Worker Setup
Create `firebase-messaging-sw.js` in your `public` folder:
```javascript
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBoXUQO5lhBt9qIrW_66EZCCsEXvdFarkE",
  authDomain: "nebeng-99cb7.firebaseapp.com",
  projectId: "nebeng-99cb7",
  storageBucket: "nebeng-99cb7.firebasestorage.app",
  messagingSenderId: "463441720786",
  appId: "1:463441720786:web:b38be5f55082437980c40b",
  measurementId: "G-7XX9S7850K"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Background notification:', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/firebase-logo.png',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
```

Register service worker in your main entry file:
```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then((registration) => {
      console.log('Service Worker registered:', registration);
    })
    .catch((error) => {
      console.error('Service Worker registration failed:', error);
    });
}
```

---

### C. Flutter Implementation

#### 1. Install Dependencies
Add to `pubspec.yaml`:
```yaml
dependencies:
  firebase_messaging: ^14.7.0
  flutter_local_notifications: ^16.0.0
```

#### 2. Configure Firebase
- Follow Firebase Flutter setup guide
- Add `google-services.json` to `android/app/`
- Add `GoogleService-Info.plist` to `ios/Runner/`

#### 3. Implementation Code
```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  Future<void> initialize() async {
    // Request permission
    NotificationSettings settings = await _messaging.requestPermission(
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      criticalAlert: false,
      provisional: false,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      print('Notification permission granted');
      String? token = await _messaging.getToken();
      print('FCM Token: $token');
      await registerDeviceToken(token!, 'android');
    }

    // Initialize local notifications
    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const InitializationSettings initializationSettings =
        InitializationSettings(android: initializationSettingsAndroid);
    await _localNotifications.initialize(initializationSettings);

    // Foreground handler
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print('Foreground notification: ${message.notification?.title}');
      _showLocalNotification(message);
    });

    // Background handler
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      print('Notification opened app: ${message.data}');
      handleNotificationNavigation(message.data);
    });
  }

  Future<void> _showLocalNotification(RemoteMessage message) async {
    const AndroidNotificationDetails androidPlatformChannelSpecifics =
        AndroidNotificationDetails(
      'nebeng_channel',
      'Nebeng Notifications',
      importance: Importance.max,
      priority: Priority.high,
    );
    const NotificationDetails platformChannelSpecifics =
        NotificationDetails(android: androidPlatformChannelSpecifics);

    await _localNotifications.show(
      0,
      message.notification?.title,
      message.notification?.body,
      platformChannelSpecifics,
      payload: message.data.toString(),
    );
  }

  void handleNotificationNavigation(Map<String, dynamic> data) {
    final type = data['type'];
    final orderId = data['orderId'];
    final tripId = data['tripId'];
    final conversationId = data['conversationId'];

    // Navigate based on type
    switch (type) {
      case 'order_created':
      case 'order_paid':
        Navigator.pushNamed(context, '/order-detail', arguments: orderId);
        break;
      case 'trip_started':
      case 'trip_completed':
        Navigator.pushNamed(context, '/tracking', arguments: tripId);
        break;
      case 'chat_message':
        Navigator.pushNamed(context, '/chat', arguments: conversationId);
        break;
      // ... other cases
    }
  }
}
```

---

## 🎨 UI Components to Implement

### 1. Notification Permission Request Screen
Create a screen that:
- Asks user for notification permission
- Explains benefits of enabling notifications
- Shows "Allow" and "Not Now" buttons
- Stores user's choice locally

### 2. Notification Settings Screen
Create a settings screen with toggle switches:
```javascript
// Example React Native component
import Switch from 'react-native-switch';

const NotificationSettingsScreen = () => {
  const [preferences, setPreferences] = useState({
    enablePushNotifications: true,
    orderNotifications: true,
    tripNotifications: true,
    chatNotifications: true,
    paymentNotifications: true,
    promotionNotifications: false,
  });

  const handleToggle = async (key, value) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    await updateNotificationPreferences(updated);
  };

  return (
    <ScrollView>
      <Text>Push Notifications</Text>
      <Switch
        value={preferences.enablePushNotifications}
        onValueChange={(val) => handleToggle('enablePushNotifications', val)}
      />

      <Text>Order Notifications</Text>
      <Switch
        value={preferences.orderNotifications}
        onValueChange={(val) => handleToggle('orderNotifications', val)}
      />

      <Text>Trip Notifications</Text>
      <Switch
        value={preferences.tripNotifications}
        onValueChange={(val) => handleToggle('tripNotifications', val)}
      />

      <Text>Chat Notifications</Text>
      <Switch
        value={preferences.chatNotifications}
        onValueChange={(val) => handleToggle('chatNotifications', val)}
      />

      <Text>Payment Notifications</Text>
      <Switch
        value={preferences.paymentNotifications}
        onValueChange={(val) => handleToggle('paymentNotifications', val)}
      />

      <Text>Promotion Notifications</Text>
      <Switch
        value={preferences.promotionNotifications}
        onValueChange={(val) => handleToggle('promotionNotifications', val)}
      />
    </ScrollView>
  );
};
```

### 3. Notification List Screen
Create a screen to display notification history:
- Fetch from `/notifications/history`
- Display notification type, title, body, timestamp
- Implement pagination (load more on scroll)
- Tap on notification to navigate to relevant screen
- Mark as read functionality (optional)

### 4. In-App Notification Badge
Add badge to notification icon:
- Show unread count
- Update when new notification arrives
- Clear when notifications are read

---

## 🔐 Security Best Practices

1. **Always authenticate requests** - All notification endpoints require JWT Bearer token
2. **Secure token storage** - Store FCM tokens securely (AsyncStorage for React Native, localStorage for web)
3. **Handle token refresh** - FCM tokens can expire, always refresh and re-register
4. **Validate notification data** - Don't blindly trust notification data, validate before navigation
5. **Rate limiting** - Implement client-side rate limiting for preference updates
6. **HTTPS in production** - Always use HTTPS for API calls in production

---

## 🧪 Testing Checklist

### Device Token Registration
- [ ] Register device token on login
- [ ] Verify token is saved in backend
- [ ] Test token refresh scenario

### Notification Reception
- [ ] Create an order and verify notification received
- [ ] Complete a payment and verify notification received
- [ ] Send a chat message and verify notification received
- [ ] Scan QR checkpoint and verify notification received

### Navigation
- [ ] Tap on notification and verify correct screen opens
- [ ] Test with app in foreground state
- [ ] Test with app in background state
- [ ] Test with app killed (not running) state

### Preferences
- [ ] Disable specific notification types
- [ ] Verify notifications are not received for disabled types
- [ ] Re-enable and verify notifications resume

### Notification History
- [ ] Fetch notification history
- [ ] Test pagination (load more)
- [ ] Verify data integrity

### Error Handling
- [ ] Test with no network connection
- [ ] Test with invalid JWT token
- [ ] Test with permission denied
- [ ] Test with invalid FCM token

---

## 🐛 Troubleshooting

### Notifications Not Received
1. Check if device token is registered
2. Verify Firebase project configuration
3. Check notification preferences are enabled
4. Verify JWT token is valid
5. Check backend logs for errors

### Token Registration Fails
1. Verify network connectivity
2. Check if JWT token is valid
3. Verify API endpoint is correct
4. Check if user is authenticated

### Navigation Not Working
1. Check if notification data is correct
2. Verify screen names match navigation structure
3. Test with app in different states (foreground, background, killed)

### Permission Denied
1. User may have denied notification permission
2. Show settings to enable permission manually
3. Handle gracefully with in-app notifications

### Web Push Not Working
1. Verify VAPID key is correct
2. Check if service worker is registered
3. Verify HTTPS is used (required for web push)
4. Check browser compatibility

---

## 📊 Success Metrics

Track the following metrics after implementation:
- Notification opt-in rate
- Notification open rate
- Click-through rate per notification type
- Token refresh frequency
- Failed notification attempts

---

## 📝 Implementation Timeline Estimate

### Phase 1: Setup (2-3 hours)
- Install dependencies
- Configure Firebase
- Set up basic FCM integration

### Phase 2: Core Features (4-6 hours)
- Device token registration
- Token refresh handling
- Foreground notification handler
- Background notification handler

### Phase 3: API Integration (2-3 hours)
- Implement API helper functions
- Connect to backend endpoints
- Handle authentication

### Phase 4: UI Implementation (4-6 hours)
- Notification permission screen
- Settings screen
- Notification history screen
- Badge indicator

### Phase 5: Testing & Debugging (3-4 hours)
- Test all notification types
- Test different app states
- Fix bugs and edge cases

**Total Estimated Time:** 15-22 hours

---

## 🚀 Deployment Checklist

- [ ] Test with production Firebase project
- [ ] Update API base URL to production
- [ ] Test with production backend
- [ ] Verify all notification types work
- [ ] Test with real devices (not just simulator)
- [ ] Test on both Android and iOS (if applicable)
- [ ] Test on web browsers (if applicable)
- [ ] Monitor error logs after deployment
- [ ] Set up analytics for notification metrics

---

## 📞 Support & Resources

### Documentation
- Backend API: http://localhost:3000/api (Swagger UI)
- Firebase Cloud Messaging: https://firebase.google.com/docs/cloud-messaging
- React Native Firebase: https://rnfirebase.io/
- Firebase Web SDK: https://firebase.google.com/docs/web/setup

### Backend Team Contact
For backend-related issues or questions, contact the backend team.

---

**Last Updated:** 2024-10-22
**Backend Version:** 1.0.0
**Firebase Project:** nebeng-99cb7
