// ==================== STORES MODULE ====================
// Renderiza lojas com suporte a URL e base64

const StoresModule = {
    filters: [],
    activeFilter: 'all',

    init() {
        this.loadFilters();
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

        // Ordena: abertos primeiro
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
        
        // Usa ImageHelper se disponível
        const imgSrc = typeof ImageHelper !== 'undefined' 
            ? ImageHelper.getSrc(store)
            : (store.imageData || store.imageUrl || '').trim();
        
        const hasImage = !!imgSrc && (imgSrc.startsWith('data:image/') || /^https?:\/\//.test(imgSrc));
        const fallback = store.emoji || '🏪';

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
                        ${store.rating ? `<span class="store-item-rating">⭐ ${store.rating.toFixed(1)}</span>` : ''}
                        ${store.deliveryTime ? `<span class="store-item-time">🕐 ${store.deliveryTime}</span>` : ''}
                        ${store.minOrder ? `<span class="store-item-fee">Min R$ ${store.minOrder}</span>` : ''}
                    </div>
                </div>
                <div class="store-item-arrow">›</div>
            </div>
        `;
    },

    // Atualiza uma loja específica (chamado pelo realtime listener)
    updateStore(storeId, data) {
        const idx = (stores || []).findIndex(s => s.id === storeId);
        if (idx !== -1) {
            stores[idx] = { ...stores[idx], ...data };
            this.render();
        }
    }
};

window.StoresModule = StoresModule;
