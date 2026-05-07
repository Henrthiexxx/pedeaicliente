// ==================== FCM MODULE ====================
// Push notifications - App Cliente

const FCMModule = {
    messaging: null,
    token: null,
    swReg: null,
    customSoundUrl: null,

    getAppBasePath() {
        return new URL('./', window.location.href).pathname;
    },

    ensureMessagingSdk() {
        if (window.firebase?.messaging) return Promise.resolve(true);

        return new Promise(resolve => {
            const existing = document.querySelector('script[data-firebase-messaging-sdk]');
            if (existing) {
                existing.addEventListener('load', () => resolve(!!window.firebase?.messaging), { once: true });
                existing.addEventListener('error', () => resolve(false), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js';
            script.defer = true;
            script.dataset.firebaseMessagingSdk = 'true';
            script.onload = () => resolve(!!window.firebase?.messaging);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    },

    async init() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.log('Push não suportado');
            return false;
        }
        try {
            if (!window.firebase || !(await this.ensureMessagingSdk())) {
                console.warn('Firebase Messaging SDK não carregado');
                return false;
            }

            const basePath = this.getAppBasePath();
            this.swReg = await navigator.serviceWorker.register(`${basePath}firebase-messaging-sw.js`, {
                scope: basePath
            });
            console.log('✅ SW do cliente registrado');

            this.messaging = firebase.messaging();

            // Foreground: notificação visual + som custom
            this.messaging.onMessage((payload) => {
                console.log('📩 Foreground:', payload);
                this.handleForegroundNotification(payload);
            });

            // Carrega som custom salvo
            this.loadCustomSound();

            // Escuta cliques em notificações (quando app está aberto)
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'NOTIFICATION_CLICK') {
                    const data = event.data.data || {};
                    this.handleNotificationClick(data);
                }
            });

            return true;
        } catch (err) {
            console.error('Erro FCM init:', err);
            return false;
        }
    },

    async requestPermissionAndGetToken() {
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return null;

            const vapidKey = 'BEyLjUm82KxRNv4fCZOWxBln45CjHSleYDOgBCDffXVPP45SsFmZHxJxP0A0hJ0c8uZWdWU8u_YLIacXXYWtCV4';
            if (!this.messaging || !this.swReg) return null;

            this.token = await this.messaging.getToken({
                vapidKey,
                serviceWorkerRegistration: this.swReg
            });
            console.log('🔑 Token obtido');
            return this.token;
        } catch (err) {
            console.error('Erro token:', err);
            return null;
        }
    },

    // ==================== COLLECTIONS ====================
    getCollection(userType) {
        if (userType === 'store') return 'stores';
        if (userType === 'driver') return 'drivers';
        return 'users';
    },

    async saveTokenToFirestore(userId, userType = 'customer') {
        if (!this.token || !userId) return;
        const col = this.getCollection(userType);
        try {
            await db.collection(col).doc(userId).set({
                fcmTokens: firebase.firestore.FieldValue.arrayUnion(this.token),
                lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (err) {
            console.error('Erro salvar token:', err);
        }
    },

    async removeToken(userId, userType = 'customer') {
        if (!this.token || !userId) return;
        const col = this.getCollection(userType);
        try {
            await db.collection(col).doc(userId).set({
                fcmTokens: firebase.firestore.FieldValue.arrayRemove(this.token)
            }, { merge: true });
        } catch (err) {}
    },

    // ==================== FOREGROUND NOTIFICATIONS ====================
    handleForegroundNotification(payload) {
        const data = payload.data || {};
        const notif = payload.notification || {};
        const type = data.type || 'order_status';

        // Monta mensagem baseada no tipo
        const messages = {
            new_order: {
                title: 'Pedido recebido',
                body: data.message || 'Seu pedido foi registrado.',
                urgent: true
            },
            order_ready: {
                title: 'Pedido pronto',
                body: `#${(data.orderId || '').slice(-6).toUpperCase()} está pronto.`,
                urgent: true
            },
            order_status: {
                title: 'Atualização do pedido',
                body: data.message || notif.body || 'Pedido atualizado',
                urgent: false
            },
            transfer_offer: {
                title: 'Atualização de entrega',
                body: data.message || 'Sua entrega foi atualizada.',
                urgent: false
            },
            rating: {
                title: 'Avaliação',
                body: data.message || 'Obrigado por avaliar seu pedido.',
                urgent: false
            },
            marketing: {
                title: notif.title || data.title || 'Pedrad',
                body: notif.body || data.body || 'Confira!',
                urgent: false
            }
        };

        const msg = messages[type] || messages.order_status;
        const title = notif.title || msg.title;
        const body = notif.body || msg.body;

        // Toast no app
        if (typeof showToast === 'function') {
            showToast(body);
        }

        // Som (custom ou padrão)
        this.playNotificationSound(msg.urgent);

        // Vibração
        if (navigator.vibrate) {
            navigator.vibrate(msg.urgent ? [300, 100, 300, 100, 300] : [200, 100, 200]);
        }

        // Notificação do sistema (foreground)
        if (Notification.permission === 'granted') {
            new Notification(title, {
                body,
                icon: `${this.getAppBasePath()}icon-192.png`,
                tag: data.orderId || `pedrad-${type}`,
                data
            });
        }
    },

    handleNotificationClick(data) {
        if (data.storeId) {
            window.location.href = `${this.getAppBasePath()}store.html?id=${encodeURIComponent(data.storeId)}`;
            return;
        }

        if (['new_order', 'order_status', 'order_update', 'order_ready', 'order_delivered'].includes(data.type)) {
            window.location.href = `${this.getAppBasePath()}orders.html`;
        }
    },

    // ==================== CUSTOM SOUND ====================
    playNotificationSound(urgent = false) {
        try {
            // Tenta som custom primeiro
            if (this.customSoundUrl) {
                const audio = new Audio(this.customSoundUrl);
                audio.volume = 1.0;
                audio.play().catch(() => this.playDefaultSound(urgent));
                return;
            }
            this.playDefaultSound(urgent);
        } catch (e) {
            this.playDefaultSound(urgent);
        }
    },

    playDefaultSound(urgent = false) {
        // Tenta arquivo local notify.mp3
        try {
            const audio = new Audio('notify.mp3');
            audio.volume = 1.0;
            audio.play().catch(() => this.playGeneratedSound(urgent));
        } catch (e) {
            this.playGeneratedSound(urgent);
        }
    },

    playGeneratedSound(urgent = false) {
        // Fallback: gera som via Web Audio API
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const freqs = urgent ? [880, 1100, 1320] : [660, 880];
            const dur = urgent ? 0.15 : 0.12;

            freqs.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.3, ctx.currentTime + i * (dur + 0.08));
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * (dur + 0.08) + dur);
                osc.start(ctx.currentTime + i * (dur + 0.08));
                osc.stop(ctx.currentTime + i * (dur + 0.08) + dur);
            });
        } catch (e) {}
    },

    // Salva som custom escolhido pelo usuário
    loadCustomSound() {
        try {
            this.customSoundUrl = localStorage.getItem('pedrad_custom_sound') || null;
        } catch (e) {}
    },

    saveCustomSound(base64DataUrl) {
        try {
            localStorage.setItem('pedrad_custom_sound', base64DataUrl);
            this.customSoundUrl = base64DataUrl;
        } catch (e) {
            console.error('Erro ao salvar som:', e);
        }
    },

    removeCustomSound() {
        localStorage.removeItem('pedrad_custom_sound');
        this.customSoundUrl = null;
    },

    // Preview do som custom
    previewSound() {
        this.playNotificationSound(true);
    }
};

// ==================== SETUP FUNCTIONS ====================

async function setupDriverPushNotifications() {
    return setupClientPushNotifications();
}

async function setupClientPushNotifications(userId) {
    const initialized = await FCMModule.init();
    if (!initialized) return null;
    const token = await FCMModule.requestPermissionAndGetToken();
    if (!token) return null;

    const resolvedUserId = userId || firebase.auth?.().currentUser?.uid;
    if (resolvedUserId) {
        await FCMModule.saveTokenToFirestore(resolvedUserId, 'customer');
    }

    return token;
}

async function cleanupPushNotifications(userId, userType) {
    await FCMModule.removeToken(userId, userType);
}

// ==================== SOUND PICKER (para profile.html) ====================
// Chame openSoundPicker() de um botão no perfil.

function openSoundPicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Max 500KB para não estourar localStorage
        if (file.size > 512000) {
            if (typeof showToast === 'function') showToast('Arquivo muito grande (máx 500KB)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            FCMModule.saveCustomSound(ev.target.result);
            if (typeof showToast === 'function') showToast('🔔 Som personalizado salvo!');
            // Preview
            setTimeout(() => FCMModule.previewSound(), 300);
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function resetSoundToDefault() {
    FCMModule.removeCustomSound();
    if (typeof showToast === 'function') showToast('Som padrão restaurado');
}
