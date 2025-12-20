// ==================== STORES MODULE ====================
// Gerencia filtros, favoritos e renderização de lojas

const StoresModule = {
    filters: {
        status: 'online', // 'online', 'all'
        category: 'all',
        favorites: false
    },
    favorites: [],
    categories: [],

    init() {
        this.loadFavorites();
        this.extractCategories();
    },

    loadFavorites() {
        try {
            const saved = localStorage.getItem(`favorites_${currentUser?.uid}`);
            this.favorites = saved ? JSON.parse(saved) : [];
        } catch (e) {
            this.favorites = [];
        }
    },

    saveFavorites() {
        localStorage.setItem(`favorites_${currentUser?.uid}`, JSON.stringify(this.favorites));
    },

    toggleFavorite(storeId, e) {
        if (e) e.stopPropagation();
        
        const idx = this.favorites.indexOf(storeId);
        if (idx === -1) {
            this.favorites.push(storeId);
            showToast('Adicionado aos favoritos ❤️');
        } else {
            this.favorites.splice(idx, 1);
            showToast('Removido dos favoritos');
        }
        this.saveFavorites();
        this.render();
    },

    isFavorite(storeId) {
        return this.favorites.includes(storeId);
    },

    extractCategories() {
        const cats = new Set(stores.map(s => s.category).filter(Boolean));
        this.categories = ['all', ...cats];
    },

    setFilter(type, value) {
        this.filters[type] = value;
        this.render();
    },

    getFilteredStores() {
        let filtered = [...stores];

        // Filtro de status
        if (this.filters.status === 'online') {
            filtered = filtered.filter(s => s.open !== false);
        }

        // Filtro de categoria
        if (this.filters.category !== 'all') {
            filtered = filtered.filter(s => s.category === this.filters.category);
        }

        // Filtro de favoritos
        if (this.filters.favorites) {
            filtered = filtered.filter(s => this.isFavorite(s.id));
        }

        return filtered;
    },

    renderFilters() {
        const container = document.getElementById('storeFilters');
        if (!container) return;

        this.extractCategories();

        container.innerHTML = `
            <div class="filter-bar">
                <div class="filter-group">
                    <div class="filter-chips">
                        <button class="filter-chip ${this.filters.status === 'online' ? 'active' : ''}" 
                                onclick="StoresModule.setFilter('status', 'online')">
                            🟢 Abertos
                        </button>
                        <button class="filter-chip ${this.filters.status === 'all' ? 'active' : ''}" 
                                onclick="StoresModule.setFilter('status', 'all')">
                            📋 Todos
                        </button>
                        <button class="filter-chip ${this.filters.favorites ? 'active favorite-chip' : ''}" 
                                onclick="StoresModule.setFilter('favorites', ${!this.filters.favorites})">
                            ${this.filters.favorites ? '❤️' : '🤍'} Favoritos
                        </button>
                    </div>
                </div>
                <div class="filter-group">
                    <select class="filter-select" onchange="StoresModule.setFilter('category', this.value)">
                        ${this.categories.map(cat => `
                            <option value="${cat}" ${this.filters.category === cat ? 'selected' : ''}>
                                ${cat === 'all' ? '🍽️ Todas categorias' : cat}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>
        `;
    },

    render() {
        this.renderFilters();
        
        const grid = document.getElementById('storesGrid');
        const filtered = this.getFilteredStores();

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <div class="empty-state-icon">${this.filters.favorites ? '💔' : '🏪'}</div>
                    <div class="empty-state-title">
                        ${this.filters.favorites ? 'Nenhum favorito ainda' : 'Nenhuma loja encontrada'}
                    </div>
                    <div class="empty-state-text">
                        ${this.filters.favorites ? 'Favorite lojas para vê-las aqui' : 'Tente alterar os filtros'}
                    </div>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map(store => {
            const isOpen = store.open !== false;
            const isFav = this.isFavorite(store.id);
            const bannerStyle = store.imageUrl 
                ? `background: url('${store.imageUrl}') center/cover no-repeat;`
                : (store.bannerColor ? `background: ${store.bannerColor};` : '');
            const bannerContent = store.imageUrl ? '' : (store.emoji || '🏪');
            
            return `
                <div class="store-card ${isOpen ? '' : 'closed'}" onclick="${isOpen ? `selectStore('${store.id}')` : 'showToast(\'Loja fechada no momento\')'}">
                    <div class="store-banner" style="${bannerStyle}">
                        ${bannerContent}
                        <button class="favorite-btn ${isFav ? 'active' : ''}" 
                                onclick="StoresModule.toggleFavorite('${store.id}', event)">
                            ${isFav ? '❤️' : '🤍'}
                        </button>
                    </div>
                    <div class="store-info">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div class="store-name">${store.name}</div>
                            <span class="store-status ${isOpen ? 'open' : 'closed'}">${isOpen ? 'Aberto' : 'Fechado'}</span>
                        </div>
                        <div class="store-category">${store.category || 'Restaurante'}</div>
                        <div class="store-meta">
                            <span>⭐ ${store.rating || '4.5'}</span>
                            <span>🕐 ${store.deliveryTime || '30-45 min'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
};

// Exportar para uso global
window.StoresModule = StoresModule;