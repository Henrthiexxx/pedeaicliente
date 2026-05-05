// firebase-messaging-sw.js
// Deve ficar no mesmo nível do index.html para controlar as páginas do cliente.
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');
firebase.initializeApp({
    apiKey: "AIzaSyAnIJRcUxN-0swpVnonPbJjTSK87o4CQ_g",
    authDomain: "pedrad-814d0.firebaseapp.com",
    projectId: "pedrad-814d0",
    storageBucket: "pedrad-814d0.firebasestorage.app",
    messagingSenderId: "293587190550",
    appId: "1:293587190550:web:80c9399f82847c80e20637"
});
const messaging = firebase.messaging();
const APP_BASE = new URL('./', self.location.href);

function appUrl(path) {
    return new URL(path || 'home.html', APP_BASE).href;
}

function notificationTarget(data) {
    if (data.url) {
        try {
            const candidate = new URL(data.url, APP_BASE);
            if (candidate.origin === self.location.origin) return candidate.href;
        } catch (e) {}
    }

    if (data.storeId) {
        return appUrl(`store.html?id=${encodeURIComponent(data.storeId)}`);
    }

    if (['order_update', 'order_status', 'order_ready', 'order_delivered', 'new_order'].includes(data.type)) {
        return appUrl('orders.html');
    }

    return appUrl('home.html');
}

// Recebe mensagens em background (app fechado)
messaging.onBackgroundMessage((payload) => {
    console.log('📩 Mensagem em background:', payload);

    const { title, body, icon } = payload.notification || {};
    const data = payload.data || {};

    const options = {
        body: body || 'Você tem uma nova atualização',
        icon: icon || appUrl('icon-192.png'),
        badge: appUrl('icon-192.png'),
        vibrate: [200, 100, 200],
        tag: data.orderId || 'pedrad-notification',
        data: {
            ...data,
            targetUrl: notificationTarget(data)
        },
        actions: [
            { action: 'open', title: 'Abrir' },
            { action: 'close', title: 'Fechar' }
        ]
    };

    return self.registration.showNotification(title || 'Pedrad', options);
});
// Clique na notificação
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close') return;

    const data = event.notification.data || {};
    const url = data.targetUrl || notificationTarget(data);

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                for (const client of clientList) {
                    if (!client.url.startsWith(self.location.origin) || !('focus' in client)) continue;

                    if ('navigate' in client) {
                        return client.navigate(url).then(navigated => (navigated || client).focus());
                    }

                    if (client.url === url) {
                        return client.focus();
                    }
                }
                return clients.openWindow(url);
            })
    );
});
