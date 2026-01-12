

class StoreCache {
    constructor(ttlMinutes = 60) {
        this.TTL = ttlMinutes * 60 * 1000; // Converte para ms
        this.VERSION = '1.0'; // Incrementa para forçar refresh
        this.PREFIX = 'pedrad_cache_';
    }
    
    // ==================== CACHE DE LOJA (PAINEL) ====================
    
    /**
     * Carrega dados da loja com cache
     * @param {string} userId - ID do usuário
     * @param {string} userEmail - Email do usuário
     * @returns {object|null} Dados da loja
     */
    async loadStore(userId, userEmail) {
        const cacheKey = `${this.PREFIX}store_${userId}`;
        
        // 1. Tenta ler do cache
        const cached = this.get(cacheKey);
        if (cached) {
            console.log('✅ Loja carregada do CACHE (0 reads)');
            return cached;
        }
        
        // 2. Se não tem cache ou expirou, busca do servidor
        console.log('🔍 Buscando loja do SERVIDOR (1 read)');
        let snapshot = await db.collection('stores')
            .where('ownerEmail', '==', userEmail)
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            snapshot = await db.collection('stores')
                .where('ownerId', '==', userId)
                .limit(1)
                .get();
        }
        
        if (snapshot.empty) {
            return null;
        }
        
        const storeData = {
            id: snapshot.docs[0].id,
            ...snapshot.docs[0].data()
        };
        
        // 3. Salva no cache
        this.set(cacheKey, storeData);
        
        return storeData;
    }
    
    /**
     * Invalida cache da loja (chamar ao salvar alterações)
     * @param {string} userId - ID do usuário
     */
    invalidateStore(userId) {
        const cacheKey = `${this.PREFIX}store_${userId}`;
        localStorage.removeItem(cacheKey);
        console.log('🗑️ Cache da loja invalidado');
    }
    
    // ==================== CACHE DE LOJAS (CLIENTE) ====================
    
    /**
     * Carrega lista de lojas com cache
     * @param {object} filters - Filtros opcionais (categoria, etc)
     * @returns {array} Lista de lojas
     */
    async loadStores(filters = {}) {
        const cacheKey = `${this.PREFIX}stores_list`;
        
        // 1. Tenta ler do cache
        const cached = this.get(cacheKey);
        if (cached) {
            console.log(`✅ ${cached.length} lojas carregadas do CACHE (0 reads)`);
            return this.filterStores(cached, filters);
        }
        
        // 2. Busca do servidor
        console.log('🔍 Buscando lojas do SERVIDOR');
        const snapshot = await db.collection('stores')
            .where('open', '==', true)
            .get();
        
        const stores = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log(`📥 ${stores.length} lojas carregadas (${stores.length} reads)`);
        
        // 3. Salva no cache
        this.set(cacheKey, stores);
        
        return this.filterStores(stores, filters);
    }
    
    /**
     * Carrega dados de UMA loja específica (para modal de produtos)
     * @param {string} storeId - ID da loja
     * @returns {object|null} Dados da loja
     */
    async loadSingleStore(storeId) {
        const cacheKey = `${this.PREFIX}store_single_${storeId}`;
        
        // 1. Tenta cache
        const cached = this.get(cacheKey);
        if (cached) {
            console.log('✅ Loja carregada do CACHE (0 reads)');
            return cached;
        }
        
        // 2. Busca do servidor
        console.log('🔍 Buscando loja do SERVIDOR (1 read)');
        const doc = await db.collection('stores').doc(storeId).get();
        
        if (!doc.exists) {
            return null;
        }
        
        const storeData = { id: doc.id, ...doc.data() };
        
        // 3. Salva no cache
        this.set(cacheKey, storeData);
        
        return storeData;
    }
    
    /**
     * Invalida cache de lojas (chamar ao criar/editar loja)
     */
    invalidateStores() {
        const cacheKey = `${this.PREFIX}stores_list`;
        localStorage.removeItem(cacheKey);
        console.log('🗑️ Cache de lojas invalidado');
    }
    
    // ==================== CACHE DE PRODUTOS ====================
    
    /**
     * Carrega produtos de uma loja com cache
     * @param {string} storeId - ID da loja
     * @returns {array} Lista de produtos
     */
    async loadProducts(storeId) {
        const cacheKey = `${this.PREFIX}products_${storeId}`;
        
        // 1. Tenta cache
        const cached = this.get(cacheKey);
        if (cached) {
            console.log(`✅ ${cached.length} produtos do CACHE (0 reads)`);
            return cached;
        }
        
        // 2. Busca do servidor
        console.log('🔍 Buscando produtos do SERVIDOR');
        const snapshot = await db.collection('products')
            .where('storeId', '==', storeId)
            .get();
        
        const products = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log(`📥 ${products.length} produtos (${products.length} reads)`);
        
        // 3. Salva no cache
        this.set(cacheKey, products);
        
        return products;
    }
    
    /**
     * Invalida cache de produtos (chamar ao criar/editar produto)
     * @param {string} storeId - ID da loja
     */
    invalidateProducts(storeId) {
        const cacheKey = `${this.PREFIX}products_${storeId}`;
        localStorage.removeItem(cacheKey);
        console.log('🗑️ Cache de produtos invalidado');
    }
    
    // ==================== MÉTODOS AUXILIARES ====================
    
    /**
     * Salva no cache com timestamp e versão
     */
    set(key, data) {
        const cacheData = {
            version: this.VERSION,
            timestamp: Date.now(),
            data
        };
        
        try {
            localStorage.setItem(key, JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Cache storage full, clearing old caches');
            this.clearOldCaches();
            try {
                localStorage.setItem(key, JSON.stringify(cacheData));
            } catch (e2) {
                console.error('Could not save to cache:', e2);
            }
        }
    }
    
    /**
     * Lê do cache (null se expirou ou não existe)
     */
    get(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            
            const cached = JSON.parse(raw);
            
            // Valida versão
            if (cached.version !== this.VERSION) {
                console.log('⚠️ Cache version mismatch, invalidating');
                localStorage.removeItem(key);
                return null;
            }
            
            // Valida TTL
            const age = Date.now() - cached.timestamp;
            if (age > this.TTL) {
                console.log('⏰ Cache expired');
                localStorage.removeItem(key);
                return null;
            }
            
            return cached.data;
            
        } catch (e) {
            console.error('Error reading cache:', e);
            return null;
        }
    }
    
    /**
     * Filtra lojas (usado internamente)
     */
    filterStores(stores, filters) {
        let filtered = stores;
        
        if (filters.category) {
            filtered = filtered.filter(s => s.category === filters.category);
        }
        
        if (filters.search) {
            const search = filters.search.toLowerCase();
            filtered = filtered.filter(s => 
                s.name?.toLowerCase().includes(search)
            );
        }
        
        return filtered;
    }
    
    /**
     * Limpa caches antigos (quando localStorage está cheio)
     */
    clearOldCaches() {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(k => k.startsWith(this.PREFIX));
        
        // Ordena por idade (mais antigos primeiro)
        const sortedKeys = cacheKeys
            .map(key => {
                try {
                    const cached = JSON.parse(localStorage.getItem(key));
                    return { key, timestamp: cached.timestamp || 0 };
                } catch {
                    return { key, timestamp: 0 };
                }
            })
            .sort((a, b) => a.timestamp - b.timestamp);
        
        // Remove metade dos caches mais antigos
        const toRemove = sortedKeys.slice(0, Math.ceil(sortedKeys.length / 2));
        toRemove.forEach(item => {
            localStorage.removeItem(item.key);
            console.log(`🗑️ Removed old cache: ${item.key}`);
        });
    }
    
    /**
     * Limpa TODOS os caches do Pedrad
     */
    clearAll() {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(k => k.startsWith(this.PREFIX));
        
        cacheKeys.forEach(key => {
            localStorage.removeItem(key);
        });
        
        console.log(`🗑️ Cleared ${cacheKeys.length} caches`);
    }
    
    /**
     * Mostra estatísticas do cache (debug)
     */
    stats() {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(k => k.startsWith(this.PREFIX));
        
        const stats = {
            total: cacheKeys.length,
            size: 0,
            caches: []
        };
        
        cacheKeys.forEach(key => {
            const raw = localStorage.getItem(key);
            const size = new Blob([raw]).size;
            const cached = JSON.parse(raw);
            
            stats.size += size;
            stats.caches.push({
                key: key.replace(this.PREFIX, ''),
                size: `${(size / 1024).toFixed(2)} KB`,
                age: `${Math.round((Date.now() - cached.timestamp) / 1000 / 60)} min`,
                version: cached.version
            });
        });
        
        stats.totalSize = `${(stats.size / 1024).toFixed(2)} KB`;
        
        console.table(stats.caches);
        console.log(`Total: ${stats.total} caches, ${stats.totalSize}`);
        
        return stats;
    }
}

// ==================== INSTÂNCIA GLOBAL ====================

// Cria instância global (TTL = 60 minutos)
window.storeCache = new StoreCache(60);

// Limpa cache ao fazer logout
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(user => {
        if (!user) {
            window.storeCache.clearAll();
        }
    });
}
