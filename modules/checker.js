// ==================== CHECKER MODULE ====================
// Runs on app init: cleans old notifications, delivers queued marketing,
// updates badge count, and other periodic health checks.

const Checker = {
    NOTIFICATION_MAX_AGE_DAYS: 30,
    STORAGE_KEY: 'notifications',

    // ==================== INIT ====================
    async init() {
        this.cleanOldNotifications();
        this.updateBadge();
        await this.checkPendingMarketing();
    },

    // ==================== CLEAN OLD NOTIFICATIONS ====================
    // Remove notifications older than 30 days
    cleanOldNotifications() {
        const notifications = this.getAll();
        const cutoff = Date.now() - (this.NOTIFICATION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
        const cleaned = notifications.filter(n => {
            const ts = n.receivedAt || n.createdAt;
            if (!ts) return false;
            return new Date(ts).getTime() > cutoff;
        });

        if (cleaned.length !== notifications.length) {
            console.log(`🧹 Checker: removed ${notifications.length - cleaned.length} old notifications`);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cleaned));
        }
    },

    // ==================== BADGE UPDATE ====================
    // Count unread notifications and update the badge in header
    updateBadge() {
        const notifications = this.getAll();
        const unreadCount = notifications.filter(n => n.status === 'unread').length;

        const badge = document.getElementById('notificationBadgeCount');
        if (badge) {
            badge.textContent = unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : '';
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }

        return unreadCount;
    },

    // ==================== PENDING MARKETING CHECK ====================
    // Fetches queued marketing messages from Firestore for this user.
    // Delivers valid ones locally, expires old ones.
    async checkPendingMarketing() {
        const uid = localStorage.getItem('auth_uid');
        if (!uid || typeof db === 'undefined') return;

        try {
            const snapshot = await db.collection('marketingQueue')
                .where('userId', '==', uid)
                .where('status', '==', 'queued')
                .get();

            if (snapshot.empty) return;

            const now = new Date();
            const batch = db.batch();
            let delivered = 0;

            for (const doc of snapshot.docs) {
                const data = doc.data();
                const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);

                if (expiresAt <= now) {
                    // Promotion expired — don't deliver
                    batch.update(doc.ref, { status: 'expired', expiredAt: firebase.firestore.FieldValue.serverTimestamp() });
                } else {
                    // Valid — deliver locally
                    batch.update(doc.ref, {
                        status: 'delivered',
                        deliveredAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    NotificationSync.addNotification({
                        id: data.campaignId ? `${data.campaignId}_${doc.id}` : doc.id,
                        campaignId: data.campaignId || null,
                        title: data.title || '📢 Promoção',
                        message: data.message || '',
                        imageUrl: data.imageUrl || null,
                        actionUrl: data.actionUrl || null,
                        type: 'marketing',
                        status: 'unread',
                        receivedAt: new Date().toISOString()
                    });

                    delivered++;
                }
            }

            await batch.commit();

            if (delivered > 0) {
                this.updateBadge();
                // Show popup for the first delivered notification
                const first = this.getAll().find(n => n.status === 'unread' && n.type === 'marketing');
                if (first) NotificationSync.showPopup(first);
            }

            console.log(`📬 Checker: ${delivered} marketing delivered, ${snapshot.size - delivered} expired`);
        } catch (e) {
            console.error('Checker marketing error:', e);
        }
    },

    // ==================== HELPERS ====================
    getAll() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    }
};
