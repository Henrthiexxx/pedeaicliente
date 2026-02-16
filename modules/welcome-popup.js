// ==================== WELCOME POPUP MODULE (v2) ====================
// Image modes: 'full' (image fills popup, text overlaid) | 'semi' (image top, text below)
// Button styles: bgColor, textColor, hoverColor, borderRadius from Firestore
// Forced resolution: 360x640 equivalent via CSS

const WelcomePopup = {
    SEEN_KEY: 'wp_seen',
    _popup: null,

    async check() {
        try {
            const snap = await db.collection('welcomePopups')
                .where('active', '==', true).limit(1).get();
            if (snap.empty) return;

            const doc = snap.docs[0];
            const data = doc.data();
            const now = new Date();
            const startsAt = data.startsAt?.toDate?.() || new Date(data.startsAt);
            const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);
            if (now < startsAt || now > expiresAt) return;

            const seenId = localStorage.getItem(this.SEEN_KEY);
            if (seenId === doc.id) return;

            this.show(doc.id, data);
        } catch (e) {
            console.error('WelcomePopup error:', e);
        }
    },

    show(id, data) {
        localStorage.setItem(this.SEEN_KEY, id);
        this._track(id, 'views');

        const mode = data.imageMode || 'semi';
        const hasImage = data.imageUrl && data.imageUrl.trim();
        const hasAction = data.action && (data.action.url || data.action.storeId);
        const actionLabel = data.action?.label || 'Abrir';
        const bs = data.buttonStyle || {};
        const btnBg = bs.bgColor || '#ffffff';
        const btnText = bs.textColor || '#000000';
        const btnHover = bs.hoverColor || '#e0e0e0';
        const btnRadius = (bs.borderRadius ?? 10) + 'px';

        const overlay = document.createElement('div');
        overlay.className = 'wp-overlay';
        overlay.id = 'welcomePopupOverlay';

        // Build popup HTML based on mode
        let cardContent = '';

        if (mode === 'full' && hasImage) {
            cardContent = `
                <div class="wp-popup-card wp-mode-full">
                    <img class="wp-full-bg" src="${data.imageUrl}" alt="" onerror="this.style.display='none'">
                    <div class="wp-full-gradient">
                        <div class="wp-popup-title">${data.title || ''}</div>
                        <div class="wp-popup-message">${data.message || ''}</div>
                        ${hasAction ? `<button class="wp-popup-cta" id="wpCta_${id}"
                            style="background:${btnBg};color:${btnText};border-radius:${btnRadius}"
                            data-hover="${btnHover}" data-bg="${btnBg}"
                            onmouseenter="this.style.background=this.dataset.hover"
                            onmouseleave="this.style.background=this.dataset.bg"
                            onclick="WelcomePopup.onAction('${id}')">${actionLabel}</button>` : ''}
                    </div>
                </div>`;
        } else {
            cardContent = `
                <div class="wp-popup-card wp-mode-semi">
                    ${hasImage ? `<div class="wp-semi-img"><img src="${data.imageUrl}" alt="" onerror="this.parentElement.style.display='none'"></div>` : ''}
                    <div class="wp-popup-body">
                        <div class="wp-popup-title">${data.title || ''}</div>
                        <div class="wp-popup-message">${data.message || ''}</div>
                        ${hasAction ? `<button class="wp-popup-cta" id="wpCta_${id}"
                            style="background:${btnBg};color:${btnText};border-radius:${btnRadius}"
                            data-hover="${btnHover}" data-bg="${btnBg}"
                            onmouseenter="this.style.background=this.dataset.hover"
                            onmouseleave="this.style.background=this.dataset.bg"
                            onclick="WelcomePopup.onAction('${id}')">${actionLabel}</button>` : ''}
                    </div>
                </div>`;
        }

        overlay.innerHTML = `
            <div class="wp-popup-container">
                <button class="wp-popup-close" onclick="WelcomePopup.dismiss('${id}')">×</button>
                ${cardContent}
            </div>`;

        // Store action data
        overlay.dataset.action = JSON.stringify(data.action || null);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.classList.contains('wp-popup-container')) {
                this.dismiss(id);
            }
        });

        document.body.appendChild(overlay);
        this._popup = overlay;
        requestAnimationFrame(() => overlay.classList.add('show'));
    },

    onAction(id) {
        this._track(id, 'clicks');
        const overlay = document.getElementById('welcomePopupOverlay');
        const action = overlay ? JSON.parse(overlay.dataset.action || 'null') : null;
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
                        if (typeof openProductModal === 'function') openProductModal(action.productId);
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
            setTimeout(() => { this._popup?.remove(); this._popup = null; }, 300);
        }
    },

    async _track(id, field) {
        try {
            await db.collection('welcomePopups').doc(id).update({
                [`stats.${field}`]: firebase.firestore.FieldValue.increment(1)
            });
        } catch (e) { /* silent */ }
    }
};
