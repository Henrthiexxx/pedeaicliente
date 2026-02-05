// ==================== STORES MODULE ====================
// Renderiza lojas com suporte a URL e base64

const StoresModule = {
    filters: [],
    activeFilter: 'all',
    storeRatings: {},

    init() {
        this.loadFilters();
        this.loadRatings(); // Não bloqueia, roda em background
    },

    async loadRatings() {
        try {
            if (typeof db === 'undefined') return;
            const snapshot = await db.collection('reviews').get();
            const byStore = {};
            
            snapshot.docs.forEach(doc => {
                const r = doc.data();
                if (!r.storeId || typeof r.storeRating !== 'number') return;
                if (!byStore[r.storeId]) byStore[r.storeId] = [];
                byStore[r.storeId].push(r.storeRating);
            });
            
            for (const storeId in byStore) {
                const ratings = byStore[storeId];
                this.storeRatings[storeId] = ratings.reduce((a, b) => a + b, 0) / ratings.length;
            }
            
            this.render();
        } catch (e) {
            console.error('loadRatings error:', e);
        }
    },

    loadFilters() {
        const cats = new Set();
        (stores || []).forEach(s => {
            if (s.category) cats.add(s.category);
        });
        this.filters = ['all', ...cats];
    },

    render() {
        this.renderFilters();
        this.renderStores();
    },

    renderFilters() {
        const container = document.getElementById('storeFilters');
        if (!container) return;

        container.innerHTML = `
            <div class="store-filters">
                ${this.filters.map(f => `
                    <div class="filter-chip ${this.activeFilter === f ? 'active' : ''}" 
                         onclick="StoresModule.setFilter('${f}')">
                        ${f === 'all' ? '🏪 Todos' : f}
                    </div>
                `).join('')}
            </div>
        `;
    },

    setFilter(filter) {
        this.activeFilter = filter;
        this.render();
    },

    renderStores() {
        const container = document.getElementById('storesGrid');
        if (!container) return;

        let filtered = stores || [];
        
        if (this.activeFilter !== 'all') {
            filtered = filtered.filter(s => s.category === this.activeFilter);
        }

        filtered = filtered.sort((a, b) => {
            if (a.open === false && b.open !== false) return 1;
            if (a.open !== false && b.open === false) return -1;
            return (a.name || '').localeCompare(b.name || '');
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🏪</div>
                    <div class="empty-state-title">Nenhuma loja encontrada</div>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(store => this.renderStoreCard(store)).join('');
    },

    renderStoreCard(store) {
        const isOpen = store.open !== false;
        const isClosed = !isOpen;
        
        const imgSrc = typeof ImageHelper !== 'undefined' 
            ? ImageHelper.getSrc(store)
            : (store.imageData || store.imageUrl || '').trim();
        
        const hasImage = !!imgSrc && (imgSrc.startsWith('data:image/') || /^https?:\/\//.test(imgSrc));
        const fallback = store.emoji || '🏪';

        const rating = this.storeRatings[store.id];

        return `
            <div class="store-item ${isClosed ? 'closed' : ''}" onclick="selectStore('${store.id}')">
                <div class="store-item-img ${hasImage ? 'has-image' : ''}" 
                     ${hasImage ? `style="background-image:url('${imgSrc}')"` : ''}>
                    ${!hasImage ? fallback : ''}
                    ${isClosed ? '<div class="store-closed-badge">FECHADO</div>' : ''}
                </div>
                <div class="store-item-info">
                    <div class="store-item-name">${store.name || 'Loja'}</div>
                    <div class="store-item-category">${store.category || ''}</div>
                    <div class="store-item-meta">
                        ${rating ? `<span class="store-item-rating">⭐ ${rating.toFixed(1)}</span>` : ''}
                        ${store.deliveryTime ? `<span class="store-item-time">🕐 ${store.deliveryTime}</span>` : ''}
                        ${store.minOrder ? `<span class="store-item-fee">Min R$ ${store.minOrder}</span>` : ''}
                    </div>
                </div>
                <div class="store-item-arrow">›</div>
            </div>
        `;
    },

    updateStore(storeId, data) {
        const idx = (stores || []).findIndex(s => s.id === storeId);
        if (idx !== -1) {
            stores[idx] = { ...stores[idx], ...data };
            this.render();
        }
    }
};

window.StoresModule = StoresModule;
