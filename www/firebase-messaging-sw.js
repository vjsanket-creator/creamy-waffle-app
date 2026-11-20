importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCI0J1SPzk4blw7en9Mwsnp2Q8KpbP__R4",
  authDomain: "creamywaffleapp.firebaseapp.com",
  projectId: "creamywaffleapp",
  storageBucket: "creamywaffleapp.appspot.com",
  messagingSenderId: "920534737774",
  appId: "1:920534737774:web:2c219c0ad019f59af9977f"
});

const messaging = firebase.messaging();

// Jab app band/background mein ho tab mobile notification dikhane ke liye
messaging.onBackgroundMessage(function (payload) {
  const data = payload.data || {};
  const notif = payload.notification || {};
  const title = notif.title || data.title || 'Creamy Waffle';
  const options = {
    body: notif.body || data.body || 'Shop status updated!',
    icon: 'waffle-logo.png',
    badge: 'waffle-logo.png',
    data: { url: './index.html' }
  };

  self.registration.showNotification(title, options);
});

// Notification par click karne par app open karne ke liye
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        if ('focus' in clientList[i]) return clientList[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});