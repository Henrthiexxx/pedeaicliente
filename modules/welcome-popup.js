// ==================== WELCOME POPUP MODULE ====================
// Shows full-screen welcome popup on app open if active popup exists.
// Tracks views, clicks, dismisses. Respects "already seen" via localStorage.
// Action support: link (external URL), store, product (internal nav)

const WelcomePopup = {
    SEEN_KEY: 'wp_seen',
    _popup: null,

    // ==================== INIT (call on app load) ====================
    async check() {
        try {
            // Get active popup from Firestore
            const snap = await db.collection('welcomePopups')
                .where('active', '==', true)
                .limit(1)
                .get();

            if (snap.empty) return;

            const doc = snap.docs[0];
            const data = doc.data();
            const now = new Date();

            // Check time window
            const startsAt = data.startsAt?.toDate?.() || new Date(data.startsAt);
            const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);
            if (now < startsAt || now > expiresAt) return;

            // Check if user already saw this popup
            const seenId = localStorage.getItem(this.SEEN_KEY);
            if (seenId === doc.id) return;

            // Show it
            this.show(doc.id, data);
        } catch (e) {
            console.error('WelcomePopup check error:', e);
        }
    },

    // ==================== SHOW POPUP ====================
    show(id, data) {
        // Mark as seen immediately
        localStorage.setItem(this.SEEN_KEY, id);

        // Track view
        this._track(id, 'views');

        const hasImage = data.imageUrl && data.imageUrl.trim();
        const hasAction = data.action && (data.action.url || data.action.storeId);
        const actionLabel = data.action?.label || 'Abrir';

        const overlay = document.createElement('div');
        overlay.className = 'wp-overlay';
        overlay.id = 'welcomePopupOverlay';
        overlay.innerHTML = `
            <div class="wp-popup-container">
                <button class="wp-popup-close" onclick="WelcomePopup.dismiss('${id}')">×</button>
                <div class="wp-popup-card">
                    ${hasImage ? `
                        <div class="wp-popup-image">
                            <img src="${data.imageUrl}" alt="" onerror="this.parentElement.style.display='none'">
                        </div>
                    ` : ''}
                    <div class="wp-popup-body">
                        <div class="wp-popup-title">${data.title || ''}</div>
                        <div class="wp-popup-message">${data.message || ''}</div>
                        ${hasAction ? `
                            <button class="wp-popup-cta" onclick="WelcomePopup.onAction('${id}',${JSON.stringify(data.action).replace(/'/g, "\\'")})">${actionLabel}</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        // Click overlay backdrop to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.classList.contains('wp-popup-container')) {
                this.dismiss(id);
            }
        });

        document.body.appendChild(overlay);
        this._popup = overlay;

        // Animate in
        requestAnimationFrame(() => overlay.classList.add('show'));
    },

    // ==================== ACTIONS ====================
    onAction(id, action) {
        this._track(id, 'clicks');
        this.close();

        if (!action) return;

        if (action.type === 'link' && action.url) {
            window.open(action.url, '_blank');
            return;
        }

        if (action.type === 'store' && action.storeId) {
            if (typeof selectStore === 'function') {
                if (typeof showPage === 'function') showPage('home');
                setTimeout(() => selectStore(action.storeId), 200);
            }
            return;
        }

        if (action.type === 'product' && action.storeId && action.productId) {
            if (typeof selectStore === 'function') {
                if (typeof showPage === 'function') showPage('home');
                setTimeout(async () => {
                    await selectStore(action.storeId);
                    setTimeout(() => {
                        if (typeof openProductModal === 'function') {
                            openProductModal(action.productId);
                        }
                    }, 600);
                }, 200);
            }
            return;
        }
    },

    dismiss(id) {
        this._track(id, 'dismisses');
        this.close();
    },

    close() {
        if (this._popup) {
            this._popup.classList.remove('show');
            setTimeout(() => {
                this._popup?.remove();
                this._popup = null;
            }, 300);
        }
    },

    // ==================== TRACKING ====================
    async _track(id, field) {
        try {
            await db.collection('welcomePopups').doc(id).update({
                [`stats.${field}`]: firebase.firestore.FieldValue.increment(1)
            });
        } catch (e) { /* silent */ }
    }
};
