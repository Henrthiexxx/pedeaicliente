// ==================== IMAGE CACHE SYSTEM ====================
const ImageCache = {
    PREFIX: 'img_',
    MAX_CACHE_SIZE: 10 * 1024 * 1024, // 10MB
    
    // Valida se é base64 ou URL válida
    isValidImage(url) {
        if (!url || typeof url !== 'string') return false;
        const u = url.trim();
        
        // Base64
        if (u.startsWith('data:image/')) return true;
        
        // URL HTTP/HTTPS
        if (/^https?:\/\//i.test(u) && u.length >= 10 && !u.includes(" ")) return true;
        
        return false;
    },
    
    // Gera chave de cache
    getCacheKey(id, type, updatedAt) {
        const timestamp = updatedAt ? new Date(updatedAt).getTime() : 'static';
        return `${this.PREFIX}${type}_${id}_${timestamp}`;
    },
    
    // Salva imagem no cache
    set(id, type, imageData, updatedAt = null) {
        try {
            if (!this.isValidImage(imageData)) return false;
            
            const key = this.getCacheKey(id, type, updatedAt);
            
            // Limpa versões antigas desta imagem
            this.clearOldVersions(id, type, updatedAt);
            
            // Verifica tamanho
            const size = new Blob([imageData]).size;
            if (size > 5 * 1024 * 1024) { // Max 5MB por imagem
                console.warn(`Imagem ${id} muito grande: ${(size/1024/1024).toFixed(2)}MB`);
                return false;
            }
            
            // Limpa cache se necessário
            this.cleanIfNeeded();
            
            localStorage.setItem(key, imageData);
            return true;
            
        } catch (err) {
            console.error('Erro ao salvar cache:', err);
            if (err.name === 'QuotaExceededError') {
                this.clearAll();
            }
            return false;
        }
    },
    
    // Busca imagem do cache
    get(id, type, updatedAt = null) {
        try {
            const key = this.getCacheKey(id, type, updatedAt);
            const cached = localStorage.getItem(key);
            
            if (cached && this.isValidImage(cached)) {
                return cached;
            }
            
            return null;
        } catch (err) {
            console.error('Erro ao buscar cache:', err);
            return null;
        }
    },
    
    // Remove versões antigas de uma imagem
    clearOldVersions(id, type, currentUpdatedAt) {
        try {
            const prefix = `${this.PREFIX}${type}_${id}_`;
            const currentTimestamp = currentUpdatedAt ? new Date(currentUpdatedAt).getTime() : null;
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    // Extrai timestamp da chave
                    const parts = key.split('_');
                    const keyTimestamp = parts[parts.length - 1];
                    
                    // Remove se for diferente da versão atual
                    if (!currentTimestamp || keyTimestamp !== currentTimestamp.toString()) {
                        localStorage.removeItem(key);
                    }
                }
            }
        } catch (err) {
            console.error('Erro ao limpar versões antigas:', err);
        }
    },
    
    // Limpa cache se ultrapassar limite
    cleanIfNeeded() {
        try {
            const cacheSize = this.getCacheSize();
            
            if (cacheSize > this.MAX_CACHE_SIZE) {
                console.log('Cache cheio, limpando itens antigos...');
                
                // Pega todas as chaves de imagem com timestamps
                const items = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(this.PREFIX)) {
                        const parts = key.split('_');
                        const timestamp = parseInt(parts[parts.length - 1]) || 0;
                        items.push({ key, timestamp });
                    }
                }
                
                // Ordena por timestamp (mais antigo primeiro)
                items.sort((a, b) => a.timestamp - b.timestamp);
                
                // Remove 30% dos mais antigos
                const toRemove = Math.ceil(items.length * 0.3);
                for (let i = 0; i < toRemove; i++) {
                    localStorage.removeItem(items[i].key);
                }
                
                console.log(`${toRemove} imagens antigas removidas do cache`);
            }
        } catch (err) {
            console.error('Erro ao limpar cache:', err);
        }
    },
    
    // Calcula tamanho total do cache
    getCacheSize() {
        let total = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.PREFIX)) {
                    const value = localStorage.getItem(key);
                    if (value) {
                        total += new Blob([value]).size;
                    }
                }
            }
        } catch (err) {
            console.error('Erro ao calcular tamanho do cache:', err);
        }
        return total;
    },
    
    // Limpa todo o cache de imagens
    clearAll() {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.PREFIX)) {
                    keys.push(key);
                }
            }
            
            keys.forEach(key => localStorage.removeItem(key));
            console.log(`${keys.length} imagens removidas do cache`);
            
        } catch (err) {
            console.error('Erro ao limpar cache:', err);
        }
    },
    
    // Estatísticas do cache
    getStats() {
        let count = 0;
        let size = 0;
        
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.PREFIX)) {
                    count++;
                    const value = localStorage.getItem(key);
                    if (value) size += new Blob([value]).size;
                }
            }
        } catch (err) {
            console.error('Erro ao calcular stats:', err);
        }
        
        return {
            count,
            size,
            sizeFormatted: `${(size / 1024 / 1024).toFixed(2)} MB`
        };
    }
};

// ==================== LAZY LOADING SYSTEM ====================
const LazyLoader = {
    observers: {},
    
    // Inicializa observer para um tipo de item
    init(containerSelector, itemSelector, onVisible) {
        if (this.observers[containerSelector]) {
            this.observers[containerSelector].disconnect();
        }
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const element = entry.target;
                    if (!element.dataset.loaded) {
                        element.dataset.loaded = 'true';
                        onVisible(element);
                        observer.unobserve(element);
                    }
                }
            });
        }, {
            root: null,
            rootMargin: '50px',
            threshold: 0.01
        });
        
        this.observers[containerSelector] = observer;
        
        // Observa elementos existentes
        this.observe(containerSelector, itemSelector);
        
        return observer;
    },
    
    // Observa elementos
    observe(containerSelector, itemSelector) {
        const observer = this.observers[containerSelector];
        if (!observer) return;
        
        const container = document.querySelector(containerSelector);
        if (!container) return;
        
        const items = container.querySelectorAll(itemSelector);
        items.forEach(item => {
            if (!item.dataset.loaded) {
                observer.observe(item);
            }
        });
    },
    
    // Desconecta observer
    disconnect(containerSelector) {
        if (this.observers[containerSelector]) {
            this.observers[containerSelector].disconnect();
            delete this.observers[containerSelector];
        }
    }
};

// ==================== RENDERIZAÇÃO COM CACHE + LAZY ====================

// Renderiza lojas com cache e lazy loading
window.renderStoresWithCache = function(storesData) {
    const grid = document.getElementById('storesGrid');
    if (!grid) return;
    
    if (!storesData || storesData.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🏪</div><div class="empty-state-title">Nenhuma loja disponível</div></div>';
        return;
    }
    
    // Renderiza cards vazios primeiro
    grid.innerHTML = storesData.map(store => `
        <div class="store-card lazy-store" 
             data-store-id="${store.id}"
             data-updated="${store.updatedAt?.seconds || 0}"
             onclick="selectStore('${store.id}')">
            <div class="store-img" data-img-placeholder="true">
                <div class="img-loading">⏳</div>
            </div>
            <div class="store-info">
                <div class="store-name">${store.name || 'Loja'}</div>
                <div class="store-category">${store.category || ''}</div>
                <div class="store-delivery">${store.deliveryTime || ''} • ${formatCurrency(store.deliveryFee || 0)}</div>
            </div>
        </div>
    `).join('');
    
    // Lazy load de imagens
    LazyLoader.init('#storesGrid', '.lazy-store', (element) => {
        const storeId = element.dataset.storeId;
        const updatedAt = element.dataset.updated;
        const store = storesData.find(s => s.id === storeId);
        if (!store) return;
        
        const imgContainer = element.querySelector('.store-img');
        if (!imgContainer) return;
        
        // Tenta buscar do cache
        let imageData = ImageCache.get(storeId, 'store', updatedAt);
        
        // Se não tem cache, usa do Firestore
        if (!imageData && store.imageUrl) {
            imageData = store.imageUrl;
            // Salva no cache
            ImageCache.set(storeId, 'store', imageData, updatedAt);
        }
        
        // Renderiza imagem
        if (imageData && ImageCache.isValidImage(imageData)) {
            imgContainer.innerHTML = `<img src="${imageData}" alt="${store.name}" 
                onerror="this.remove();this.parentElement.innerHTML='${store.emoji || '🏪'}';this.parentElement.removeAttribute('data-img-placeholder');">`;
            imgContainer.removeAttribute('data-img-placeholder');
        } else {
            imgContainer.innerHTML = store.emoji || '🏪';
            imgContainer.removeAttribute('data-img-placeholder');
        }
    });
};

// Renderiza produtos com cache e lazy loading
window.renderProductsWithCache = function(productsData, activeCategory = 'all', searchTerm = '') {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    
    // Filtros
    let filtered = productsData.filter(p => p.active !== false);
    
    if (activeCategory && activeCategory !== 'all') {
        filtered = filtered.filter(p => p.category === activeCategory);
    }
    
    if (searchTerm) {
        const search = searchTerm.toLowerCase().trim();
        filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(search) ||
            (p.description || '').toLowerCase().includes(search)
        );
    }
    
    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Nenhum produto encontrado</div></div>';
        return;
    }
    
    // Renderiza cards vazios
    grid.innerHTML = filtered.map(product => `
        <div class="product-card lazy-product"
             data-product-id="${product.id}"
             data-updated="${product.updatedAt?.seconds || 0}"
             onclick="openProductModal('${product.id}')">
            <div class="product-img" data-img-placeholder="true">
                <div class="img-loading">⏳</div>
            </div>
            <div class="product-info">
                <div class="product-name">${product.name || 'Produto'}</div>
                <div class="product-desc">${product.description || ''}</div>
                <div class="product-price">${formatCurrency(product.price || 0)}</div>
            </div>
        </div>
    `).join('');
    
    // Lazy load de imagens
    LazyLoader.init('#productsGrid', '.lazy-product', (element) => {
        const productId = element.dataset.productId;
        const updatedAt = element.dataset.updated;
        const product = productsData.find(p => p.id === productId);
        if (!product) return;
        
        const imgContainer = element.querySelector('.product-img');
        if (!imgContainer) return;
        
        // Busca do cache
        let imageData = ImageCache.get(productId, 'product', updatedAt);
        
        // Se não tem cache, usa do Firestore
        if (!imageData && product.imageUrl) {
            imageData = product.imageUrl;
            // Salva no cache
            ImageCache.set(productId, 'product', imageData, updatedAt);
        }
        
        // Renderiza
        if (imageData && ImageCache.isValidImage(imageData)) {
            imgContainer.innerHTML = `<img src="${imageData}" alt="${product.name}" loading="lazy"
                onerror="this.remove();this.parentElement.innerHTML='${product.emoji || '🍽️'}';this.parentElement.removeAttribute('data-img-placeholder');">`;
            imgContainer.removeAttribute('data-img-placeholder');
        } else {
            imgContainer.innerHTML = product.emoji || '🍽️';
            imgContainer.removeAttribute('data-img-placeholder');
        }
    });
};

// ==================== HELPERS ====================

// Limpa cache manualmente (pode ser chamado em settings)
window.clearImageCache = function() {
    if (confirm('Limpar cache de imagens? Isso fará com que as imagens sejam recarregadas.')) {
        ImageCache.clearAll();
        showToast('✓ Cache limpo');
        
        // Recarrega página atual
        const currentPage = document.querySelector('.page.active');
        if (currentPage?.id === 'homePage') {
            if (typeof renderStores === 'function') renderStores();
            if (selectedStore && typeof renderProducts === 'function') renderProducts();
        }
    }
};

// Mostra stats do cache (debug)
window.showCacheStats = function() {
    const stats = ImageCache.getStats();
    console.log('📊 Cache Stats:', stats);
    showToast(`Cache: ${stats.count} imagens (${stats.sizeFormatted})`);
};

console.log('✅ Sistema de cache de imagens carregado');