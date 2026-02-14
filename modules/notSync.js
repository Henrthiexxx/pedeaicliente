// ==================== NOTIFICATION SYNC (v2) ====================
// Lifecycle: receive → save as 'unread' → popup 30s → if viewed → 'delivered'
// Statuses: 'unread' | 'delivered'
// Cleanup: checker.js removes >30 day old notifications

const NotificationSync = {
    STORAGE_KEY: 'notifications',
    MAX_ITEMS: 100,
    POPUP_DURATION: 30000, // 30 seconds
    _popupTimer: null,
    _popupElement: null,

    // ==================== SYNC FROM FIRESTORE ====================
    async syncNotifications() {
        if (!currentUser) return;
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const pending = userDoc.data()?.pendingNotifications || [];
            if (!pending.length) return;

            const local = this.getHistory();
            const ids = new Set(local.map(n => n.id));
            const newOnes = pending.filter(n => !ids.has(n.id));

            if (newOnes.length) {
                // Add each with proper status
                newOnes.forEach(n => {
                    this.addNotification({
                        ...n,
                        status: 'unread',
                        receivedAt: n.receivedAt || new Date().toISOString()
                    });
                });

                // Show popup for latest
                this.showPopup(newOnes[0]);

                // Clear pending in Firestore
                await db.collection('users').doc(currentUser.uid).update({
                    pendingNotifications: []
                });

                if (typeof Checker !== 'undefined') Checker.updateBadge();
            }
        } catch (e) {
            console.error('Sync error:', e);
        }
    },

    // ==================== ADD NOTIFICATION ====================
    addNotification(notification) {
        const all = this.getHistory();
        // Prevent duplicates
        if (all.some(n => n.id === notification.id)) return;

        const entry = {
            id: notification.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            campaignId: notification.campaignId || null,
            title: notification.title || 'Notificação',
            message: notification.message || '',
            imageUrl: notification.imageUrl || null,
            actionUrl: notification.actionUrl || null,
            type: notification.type || 'general',
            status: notification.status || 'unread',
            receivedAt: notification.receivedAt || new Date().toISOString(),
            createdAt: notification.createdAt || new Date().toISOString()
        };

        all.unshift(entry);

        // Cap at MAX_ITEMS
        if (all.length > this.MAX_ITEMS) all.length = this.MAX_ITEMS;

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));
        return entry;
    },

    // ==================== POPUP (30 seconds) ====================
    showPopup(n) {
        // Remove previous popup if any
        this.dismissPopup(false);

        const el = document.createElement('div');
        el.className = 'notification-popup';
        el.id = 'activeNotifPopup';
        el.dataset.notifId = n.id || '';
        el.innerHTML = `
            <div class="notification-popup-content">
                <div class="notification-popup-icon">${this._getIcon(n.type)}</div>
                <div class="notification-popup-text">
                    <div class="notification-popup-title">${n.title || ''}</div>
                    <div class="notification-popup-message">${n.message || ''}</div>
                </div>
                <button class="notification-popup-close" onclick="NotificationSync.dismissPopup(true)">×</button>
            </div>
            <div class="notification-popup-timer"><div class="notification-popup-timer-fill"></div></div>
        `;

        // Click on popup body → mark as delivered, open notifications
        el.querySelector('.notification-popup-content').addEventListener('click', (e) => {
            if (e.target.closest('.notification-popup-close')) return;
            this.markAsDelivered(n.id);
            this.dismissPopup(false);

            // Navigate based on action
            if (n.actionUrl) {
                window.location.href = n.actionUrl;
            } else if (typeof openNotifications === 'function') {
                openNotifications();
            }
        });

        document.body.appendChild(el);
        this._popupElement = el;

        // Animate in
        requestAnimationFrame(() => el.classList.add('show'));

        // Vibrate
        navigator.vibrate?.([200, 100, 200]);

        // Auto-dismiss after 30s → stays as unread
        this._popupTimer = setTimeout(() => {
            this.dismissPopup(false);
        }, this.POPUP_DURATION);
    },

    dismissPopup(wasManual) {
        if (this._popupTimer) {
            clearTimeout(this._popupTimer);
            this._popupTimer = null;
        }
        if (this._popupElement) {
            this._popupElement.classList.remove('show');
            setTimeout(() => {
                this._popupElement?.remove();
                this._popupElement = null;
            }, 300);
        }
    },

    _getIcon(type) {
        const icons = {
            marketing: '📢', order_status: '📦', new_order: '🛵',
            rating: '⭐', promo: '🎉', general: '🔔'
        };
        return icons[type] || '🔔';
    },

    // ==================== STATUS MANAGEMENT ====================
    markAsDelivered(id) {
        const all = this.getHistory();
        const n = all.find(x => x.id === id);
        if (n && n.status === 'unread') {
            n.status = 'delivered';
            n.deliveredAt = new Date().toISOString();
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));

            // Report to Firestore for campaign analytics
            if (n.campaignId && typeof db !== 'undefined') {
                this._reportDelivery(n.campaignId);
            }
        }
        if (typeof Checker !== 'undefined') Checker.updateBadge();
    },

    markAllAsDelivered() {
        const all = this.getHistory();
        let changed = false;
        all.forEach(n => {
            if (n.status === 'unread') {
                n.status = 'delivered';
                n.deliveredAt = new Date().toISOString();
                changed = true;
                if (n.campaignId && typeof db !== 'undefined') {
                    this._reportDelivery(n.campaignId);
                }
            }
        });
        if (changed) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));
            if (typeof Checker !== 'undefined') Checker.updateBadge();
        }
    },

    // Report delivery to Firestore campaign stats
    async _reportDelivery(campaignId) {
        try {
            const ref = db.collection('campaigns').doc(campaignId);
            await ref.update({
                deliveredCount: firebase.firestore.FieldValue.increment(1)
            });
        } catch (e) { /* silent */ }
    },

    // ==================== READ / DELETE ====================
    deleteNotification(id) {
        const all = this.getHistory().filter(x => x.id !== id);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));
        if (typeof Checker !== 'undefined') Checker.updateBadge();
    },

    clearAll() {
        localStorage.setItem(this.STORAGE_KEY, '[]');
        if (typeof Checker !== 'undefined') Checker.updateBadge();
    },

    getHistory() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    },

    // ==================== RENDER NOTIFICATIONS PAGE ====================
    renderHistory(containerId) {
        const c = document.getElementById(containerId);
        if (!c) return;

        // Mark all as delivered when viewing
        this.markAllAsDelivered();

        const notifications = this.getHistory();

        if (!notifications.length) {
            c.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔔</div>
                    <div class="empty-state-title">Nenhuma notificação</div>
                    <div class="empty-state-text">Suas notificações aparecerão aqui</div>
                </div>`;
            return;
        }

        c.innerHTML = notifications.map(n => {
            const time = this._timeAgo(n.receivedAt || n.createdAt);
            const isUnread = n.status === 'unread';

            return `
            <div class="notification-item ${isUnread ? 'unread' : ''}" onclick="NotificationSync.markAsDelivered('${n.id}')">
                <div class="notification-icon">${this._getIcon(n.type)}</div>
                <div class="notification-content">
                    <div class="notification-title">${n.title || ''}</div>
                    <div class="notification-message">${n.message || ''}</div>
                    <div class="notification-time">${time}</div>
                </div>
                <button class="notification-delete" onclick="event.stopPropagation();NotificationSync.deleteNotification('${n.id}');NotificationSync.renderHistory('${containerId}')">×</button>
            </div>`;
        }).join('');
    },

    _timeAgo(ts) {
        if (!ts) return '';
        const diff = Date.now() - new Date(ts).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'agora';
        if (mins < 60) return `${mins}min atrás`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h atrás`;
        const days = Math.floor(hrs / 24);
        if (days < 7) return `${days}d atrás`;
        return new Date(ts).toLocaleDateString('pt-BR');
    }
};
