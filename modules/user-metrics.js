// ==================== USER METRICS MODULE ====================
// Salva métricas em localStorage, envia ao servidor após 7 dias

const UserMetrics = {
    KEY: 'user_metrics',
    CYCLE_DAYS: 7,

    // Estrutura inicial
    getDefault() {
        return {
            createdAt: Date.now(),
            lastOrderAt: null,
            ordersCount: 0,
            totalSpent: 0,
            sessionTime: 0,
            lastSessionStart: null,
            productsBought: {},  // {productId: {name, count, lastAt}}
            storesOrdered: {},   // {storeId: {name, count, lastAt}}
            favoriteProducts: [] // IDs dos mais comprados
        };
    },

    // Carrega ou cria
    load() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (!raw) return this.init();
            
            const data = JSON.parse(raw);
            
            // Verifica ciclo de 7 dias
            const daysPassed = (Date.now() - data.createdAt) / (1000 * 60 * 60 * 24);
            if (daysPassed >= this.CYCLE_DAYS) {
                this.sendToServer(data);
                return this.init();
            }
            
            return data;
        } catch {
            return this.init();
        }
    },

    init() {
        const data = this.getDefault();
        this.save(data);
        return data;
    },

    save(data) {
        localStorage.setItem(this.KEY, JSON.stringify(data));
    },

    // Chamado quando pedido é finalizado
    onOrderComplete(order) {
        const data = this.load();
        
        data.ordersCount++;
        data.totalSpent += order.total || 0;
        data.lastOrderAt = Date.now();

        // Produtos comprados
        (order.items || []).forEach(item => {
            const id = item.id || item.productId;
            if (!data.productsBought[id]) {
                data.productsBought[id] = { name: item.name, count: 0, lastAt: null };
            }
            data.productsBought[id].count += item.qty || 1;
            data.productsBought[id].lastAt = Date.now();
        });

        // Loja
        if (order.storeId) {
            if (!data.storesOrdered[order.storeId]) {
                data.storesOrdered[order.storeId] = { name: order.storeName, count: 0, lastAt: null };
            }
            data.storesOrdered[order.storeId].count++;
            data.storesOrdered[order.storeId].lastAt = Date.now();
        }

        // Atualiza favoritos (top 5)
        data.favoriteProducts = Object.entries(data.productsBought)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5)
            .map(([id]) => id);

        this.save(data);
        return data;
    },

    // Tracking de sessão
    startSession() {
        const data = this.load();
        data.lastSessionStart = Date.now();
        this.save(data);
    },

    endSession() {
        const data = this.load();
        if (data.lastSessionStart) {
            data.sessionTime += Date.now() - data.lastSessionStart;
            data.lastSessionStart = null;
            this.save(data);
        }
    },

    // Getters úteis
    getTicketMedio() {
        const data = this.load();
        return data.ordersCount > 0 ? data.totalSpent / data.ordersCount : 0;
    },

    getFrequency() {
        const data = this.load();
        if (!data.lastOrderAt) return 0;
        const days = (data.lastOrderAt - data.createdAt) / (1000 * 60 * 60 * 24);
        return days > 0 ? data.ordersCount / days : data.ordersCount;
    },

    getFavoriteProducts() {
        return this.load().favoriteProducts;
    },

    // Envia ao servidor e reseta
    async sendToServer(data) {
        const uid = localStorage.getItem('auth_uid');
        if (!uid || typeof db === 'undefined') return;

        try {
            await db.collection('userMetrics').add({
                userId: uid,
                periodStart: new Date(data.createdAt),
                periodEnd: new Date(),
                ordersCount: data.ordersCount,
                totalSpent: data.totalSpent,
                ticketMedio: data.ordersCount > 0 ? data.totalSpent / data.ordersCount : 0,
                sessionTimeMinutes: Math.round(data.sessionTime / 60000),
                topProducts: data.favoriteProducts,
                productsBought: data.productsBought,
                storesOrdered: data.storesOrdered,
                sentAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('📊 Métricas enviadas ao servidor');
        } catch (e) {
            console.error('Erro ao enviar métricas:', e);
        }
    }
};

// Auto-tracking de sessão
window.addEventListener('load', () => UserMetrics.startSession());
window.addEventListener('beforeunload', () => UserMetrics.endSession());
document.addEventListener('visibilitychange', () => {
    if (document.hidden) UserMetrics.endSession();
    else UserMetrics.startSession();
});

window.UserMetrics = UserMetrics;
