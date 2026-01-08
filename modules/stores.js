// ==================== STORES MODULE ====================
// Cache inteligente + layout lista compacto

const StoresModule = {
    cache: {
        stores: [],
        products: {},  // { storeId: { data: [], timestamp } }
        lastFetch: 0,
        TTL: 5 * 60 * 1000  // 5 minutos
    },
    
    activeFilter: 'all',
    
    init() {
        this.loadFromLocalStorage();
        this.renderFilters();
    },
    
    // ==================== CACHE ====================
    
    loadFromLocalStorage() {
        try {
            const cached = localStorage.getItem('stores_cache');
            if (cached) {
                const data = JSON.parse(cached);
                if (Date.now() - data.timestamp < this.cache.TTL) {
                    this.cache.stores = data.stores;
                    this.cache.lastFetch = data.timestamp;
                    stores = data.stores; // Atualiza global
                }
            }
            
            const productsCache = localStorage.getItem('products_cache');
            if (productsCache) {
                this.cache.products = JSON.parse(productsCache);
            }
        } catch (e) {
            console.log('Cache load error:', e);
        }
    },
    
    saveToLocalStorage() {
        try {
            localStorage.setItem('stores_cache', JSON.stringify({
                stores: this.cache.stores,
                timestamp: Date.now()
            }));
            localStorage.setItem('products_cache', JSON.stringify(this.cache.products));
        } catch (e) {
            console.log('Cache save error:', e);
        }
    },
    
    // ==================== LOJAS ====================
    
    async loadStores(forceRefresh = false) {
        const now = Date.now();
        const cacheValid = (now - this.cache.lastFetch) < this.cache.TTL;
        
        // Usa cache se válido e não forçou refresh
        if (cacheValid && this.cache.stores.length > 0 && !forceRefresh) {
            stores = this.cache.stores;
            return stores;
        }
        
        try {
            // Tenta cache do Firestore primeiro (offline)
            const options = navigator.onLine ? {} : { source: 'cache' };
            
            const snapshot = await db.collection('stores')
                .where('active', '!=', false)
                .get(options);
            
            stores = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => {
                    // Abertas primeiro
                    if (a.open !== false && b.open === false) return -1;
                    if (a.open === false && b.open !== false) return 1;
                    return (a.name || '').localeCompare(b.name || '');
                });
            
            this.cache.stores = stores;
            this.cache.lastFetch = now;
            this.saveToLocalStorage();
            
            return stores;
        } catch (err) {
            console.error('Error loading stores:', err);
            return this.cache.stores; // Retorna cache em caso de erro
        }
    },
    
    // ==================== PRODUTOS COM CACHE ====================
    
    async loadProducts(storeId, forceRefresh = false) {
        const cached = this.cache.products[storeId];
        const now = Date.now();
        
        // Usa cache se válido
        if (cached && (now - cached.timestamp) < this.cache.TTL && !forceRefresh) {
            products = cached.data;
            this.updateCategories();
            return products;
        }
        
        try {
            const snapshot = await db.collection('products')
                .where('storeId', '==', storeId)
                .where('active', '!=', false)
                .get();
            
            products = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            
            // Salva no cache
            this.cache.products[storeId] = {
                data: products,
                timestamp: now
            };
            this.saveToLocalStorage();
            
            this.updateCategories();
            return products;
        } catch (err) {
            console.error('Error loading products:', err);
            return cached?.data || [];
        }
    },
    
    updateCategories() {
        const cats = new Set(products.map(p => p.category).filter(Boolean));
        categories = ['all', ...cats];
    },
    
    // ==================== LISTENER OTIMIZADO ====================
    
    setupStoreStatusListener() {
        // Listener APENAS para mudanças de status (open/closed)
        // Não recarrega tudo, só atualiza o status
        return db.collection('stores').onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'modified') {
                    const data = change.doc.data();
                    const idx = stores.findIndex(s => s.id === change.doc.id);
                    
                    if (idx !== -1) {
                        // Atualiza apenas campos que mudam frequentemente
                        stores[idx].open = data.open;
                        stores[idx].deliveryTime = data.deliveryTime;
                        
                        // Atualiza UI se loja selecionada
                        if (selectedStore?.id === change.doc.id) {
                            selectedStore.open = data.open;
                            const statusEl = document.getElementById('selectedStoreStatus');
                            if (statusEl) {
                                statusEl.textContent = data.open !== false ? '🟢 Aberto' : '🔴 Fechado';
                            }
                        }
                    }
                    
                    this.render(); // Re-render lista
                }
            });
        });
    },
    
    // ==================== FILTROS ====================
    
    renderFilters() {
        const container = document.getElementById('storeFilters');
        if (!container) return;
        
        // Coleta categorias únicas das lojas
        const storeCategories = [...new Set(stores.map(s => s.category).filter(Boolean))];
        
        container.innerHTML = `
            <div class="store-filters">
                <div class="filter-chip ${this.activeFilter === 'all' ? 'active' : ''}" 
                     onclick="StoresModule.filter('all')">Todas</div>
                <div class="filter-chip ${this.activeFilter === 'open' ? 'active' : ''}" 
                     onclick="StoresModule.filter('open')">🟢 Abertas</div>
                ${storeCategories.slice(0, 5).map(cat => `
                    <div class="filter-chip ${this.activeFilter === cat ? 'active' : ''}" 
                         onclick="StoresModule.filter('${cat}')">${cat}</div>
                `).join('')}
            </div>
        `;
    },
    
    filter(filter) {
        this.activeFilter = filter;
        this.renderFilters();
        this.render();
    },
    
    // ==================== RENDER LISTA COMPACTA ====================
    
    render() {
        const container = document.getElementById('storesGrid');
        if (!container) return;
        
        let filtered = stores;
        
        if (this.activeFilter === 'open') {
            filtered = stores.filter(s => s.open !== false);
        } else if (this.activeFilter !== 'all') {
            filtered = stores.filter(s => s.category === this.activeFilter);
        }
        
        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🏪</div>
                    <div class="empty-state-title">Nenhuma loja encontrada</div>
                </div>
            `;
            return;
        }
        
        // Layout LISTA compacto (estilo iFood)
        container.innerHTML = filtered.map(store => {
            const isOpen = store.open !== false;
            const hasImage = store.imageUrl && store.imageUrl.startsWith('data:');
            const rating = store.rating?.toFixed(1) || '4.5';
            const deliveryTime = store.deliveryTime || '30-45 min';
            const deliveryFee = store.deliveryFee ? formatCurrency(store.deliveryFee) : 'Grátis';
            
            return `
                <div class="store-item ${!isOpen ? 'closed' : ''}" onclick="selectStore('${store.id}')">
                    <div class="store-item-img ${hasImage ? 'has-image' : ''}" 
                         ${hasImage ? `style="background-image: url('${store.imageUrl}')"` : ''}>
                        ${hasImage ? '' : (store.emoji || '🏪')}
                        ${!isOpen ? '<div class="store-closed-badge">Fechado</div>' : ''}
                    </div>
                    <div class="store-item-info">
                        <div class="store-item-name">${store.name || 'Loja'}</div>
                        <div class="store-item-category">${store.category || 'Restaurante'}</div>
                        <div class="store-item-meta">
                            <span class="store-item-rating">⭐ ${rating}</span>
                            <span class="store-item-time">🕐 ${deliveryTime}</span>
                            <span class="store-item-fee">🛵 ${deliveryFee}</span>
                        </div>
                    </div>
                    <div class="store-item-arrow">›</div>
                </div>
            `;
        }).join('');
    },
    
    // ==================== PRODUTOS LISTA ====================
    
    renderProducts() {
        const grid = document.getElementById('productsGrid');
        const search = document.getElementById('searchInput')?.value?.toLowerCase() || '';
        
        let filtered = products;
        
        if (activeCategory !== 'all') {
            filtered = filtered.filter(p => p.category === activeCategory);
        }
        
        if (search) {
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(search) ||
                (p.description && p.description.toLowerCase().includes(search))
            );
        }
        
        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-title">Nenhum produto</div>
                </div>
            `;
            return;
        }
        
        // Layout LISTA compacto (igual lojas)
        grid.innerHTML = filtered.map(p => {
            const hasImage = p.imageUrl && p.imageUrl.startsWith('data:');
            const hasAddons = p.addons?.length > 0;
            
            return `
                <div class="product-item" onclick="openProductModal('${p.id}')">
                    <div class="product-item-img ${hasImage ? 'has-image' : ''}" 
                         ${hasImage ? `style="background-image: url('${p.imageUrl}')"` : ''}>
                        ${hasImage ? '' : (p.emoji || '🍽️')}
                    </div>
                    <div class="product-item-info">
                        <div class="product-item-name">${p.name}</div>
                        <div class="product-item-desc">${p.description || ''}</div>
                        <div class="product-item-footer">
                            <span class="product-item-price">${formatCurrency(p.price)}</span>
                            ${hasAddons ? '<span class="product-item-addons">+ adicionais</span>' : ''}
                        </div>
                    </div>
                    <button class="product-item-add">+</button>
                </div>
            `;
        }).join('');
    },
    
    // ==================== REFRESH ====================
    
    async refresh() {
        await this.loadStores(true);
        this.render();
        showToast('Lojas atualizadas');
    }
};

// Substitui funções globais
async function loadStores() {
    return StoresModule.loadStores();
}

async function loadProducts(storeId) {
    await StoresModule.loadProducts(storeId);
    StoresModule.renderProducts();
}

function renderProducts() {
    StoresModule.renderProducts();
}
