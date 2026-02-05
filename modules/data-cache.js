// ==================== DATA CACHE MODULE ====================
// Reduz leituras do Firestore usando localStorage com TTL

const DataCache = {
    TTL: {
        stores: 5 * 60 * 1000,      // 5 min
        products: 3 * 60 * 1000,    // 3 min
        fees: 30 * 60 * 1000,       // 30 min
        coupons: 10 * 60 * 1000     // 10 min
    },

    // Gera chave única
    key(type, id = '') {
        return `cache_${type}${id ? '_' + id : ''}`;
    },

    // Salva com timestamp
    set(type, data, id = '') {
        const payload = {
            data,
            cachedAt: Date.now(),
            ttl: this.TTL[type] || 60000
        };
        try {
            localStorage.setItem(this.key(type, id), JSON.stringify(payload));
        } catch (e) {
            // Storage cheio, limpa caches antigos
            this.cleanup();
        }
    },

    // Busca se não expirou
    get(type, id = '') {
        try {
            const raw = localStorage.getItem(this.key(type, id));
            if (!raw) return null;

            const { data, cachedAt, ttl } = JSON.parse(raw);
            if (Date.now() - cachedAt > ttl) {
                localStorage.removeItem(this.key(type, id));
                return null;
            }
            return data;
        } catch {
            return null;
        }
    },

    // Invalida cache
    invalidate(type, id = '') {
        if (id) {
            localStorage.removeItem(this.key(type, id));
        } else {
            // Remove todos do tipo
            Object.keys(localStorage)
                .filter(k => k.startsWith(`cache_${type}`))
                .forEach(k => localStorage.removeItem(k));
        }
    },

    // Limpa caches expirados
    cleanup() {
        const now = Date.now();
        Object.keys(localStorage)
            .filter(k => k.startsWith('cache_'))
            .forEach(k => {
                try {
                    const { cachedAt, ttl } = JSON.parse(localStorage.getItem(k));
                    if (now - cachedAt > ttl) localStorage.removeItem(k);
                } catch {
                    localStorage.removeItem(k);
                }
            });
    },

    // === STORES ===
    async getStores(forceRefresh = false) {
        if (!forceRefresh) {
            const cached = this.get('stores');
            if (cached) {
                console.log('📦 Stores from cache');
                return cached;
            }
        }

        const snapshot = await db.collection('stores').get();
        const stores = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(s => s.active !== false)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        this.set('stores', stores);
        console.log('🔥 Stores from Firestore');
        return stores;
    },

    // === PRODUCTS ===
    async getProducts(storeId, forceRefresh = false) {
        if (!storeId) return [];

        if (!forceRefresh) {
            const cached = this.get('products', storeId);
            if (cached) {
                console.log('📦 Products from cache');
                return cached;
            }
        }

        const snapshot = await db.collection('products')
            .where('storeId', '==', storeId)
            .get();

        const products = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(p => p.active !== false)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        this.set('products', products, storeId);
        console.log('🔥 Products from Firestore');
        return products;
    },

    // === DELIVERY FEES ===
    async getFees(forceRefresh = false) {
        if (!forceRefresh) {
            const cached = this.get('fees');
            if (cached) return cached;
        }

        const snapshot = await db.collection('deliveryFees')
            .where('active', '==', true)
            .get();

        const fees = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        this.set('fees', fees);
        return fees;
    },

    // === COUPONS ===
    async getCoupons(forceRefresh = false) {
        if (!forceRefresh) {
            const cached = this.get('coupons');
            if (cached) return cached;
        }

        const snapshot = await db.collection('coupons')
            .where('active', '==', true)
            .get();

        const coupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        this.set('coupons', coupons);
        return coupons;
    }
};

// Limpa caches expirados ao carregar
DataCache.cleanup();

window.DataCache = DataCache;
