// firebase-messaging-sw.js - App Entregador
// Coloque na RAIZ do projeto (mesmo nível do index.html)

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

// Mensagens por tipo
const NOTIF_TEMPLATES = {
    new_order: {
        icon: '📦',
        getTitle: (d) => '📦 Nova Entrega Disponível!',
        getBody: (d) => `${d.storeName || 'Loja'} → ${d.neighborhood || 'Entregar'}`,
        vibrate: [300, 100, 300, 100, 300]
    },
    order_ready: {
        icon: '✅',
        getTitle: (d) => '✅ Pedido Pronto!',
        getBody: (d) => `#${(d.orderId || '').slice(-6).toUpperCase()} pronto para retirada em ${d.storeName || 'Loja'}`,
        vibrate: [500, 200, 500]
    },
    order_status: {
        icon: '🔔',
        getTitle: (d) => '🔔 Atualização do Pedido',
        getBody: (d) => d.message || `Pedido #${(d.orderId || '').slice(-6).toUpperCase()} atualizado`,
        vibrate: [200, 100, 200]
    },
    transfer_offer: {
        icon: '🔄',
        getTitle: (d) => '🔄 Oferta de Troca',
        getBody: (d) => `${d.driverName || 'Entregador'} quer trocar entrega com você`,
        vibrate: [200, 100, 200, 100, 200]
    },
    rating: {
        icon: '⭐',
        getTitle: (d) => '⭐ Nova Avaliação',
        getBody: (d) => d.message || 'Você recebeu uma nova avaliação',
        vibrate: [200]
    },
    marketing: {
        icon: '🎉',
        getTitle: (d) => d.title || '🎉 Pedrad',
        getBody: (d) => d.body || d.message || 'Confira as novidades!',
        vibrate: [200, 100, 200]
    }
};

messaging.onBackgroundMessage((payload) => {
    console.log('📩 Background:', payload);

    const data = payload.data || {};
    const notif = payload.notification || {};
    const type = data.type || 'order_status';
    const template = NOTIF_TEMPLATES[type] || NOTIF_TEMPLATES.order_status;

    const title = notif.title || template.getTitle(data);
    const body = notif.body || template.getBody(data);

    const options = {
        body,
        icon: '/pedeaientregador/icon-192.png',
        badge: '/pedeaientregador/icon-72.png',
        vibrate: template.vibrate,
        tag: data.orderId || `pedrad-${type}-${Date.now()}`,
        data: { ...data, type },
        renotify: true,
        requireInteraction: type === 'new_order' || type === 'order_ready',
        actions: type === 'new_order'
            ? [{ action: 'accept', title: '👍 Ver Entrega' }, { action: 'close', title: 'Depois' }]
            : [{ action: 'open', title: 'Abrir' }, { action: 'close', title: 'Fechar' }]
    };

    return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'close') return;

    const data = event.notification.data || {};
    let url = '/pedeaientregador/home.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url.includes('pedeaientregador') && 'focus' in client) {
                    client.postMessage({ type: 'NOTIFICATION_CLICK', data });
                    return client.focus();
                }
            }
            return clients.openWindow(url);
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
