// ==================== LAZY LOADING DE PEDIDOS ====================

(function() {
    console.log('📦 Módulo de lazy loading de pedidos carregado');
    
    let lastOrderDoc = null;
    let hasMoreOrders = true;
    let isLoadingOrders = false;
    
    // Substitui loadOrders original
    const _originalLoadOrders = window.loadOrders;
    
    window.loadOrders = async function() {
        if (!window.currentUser) return;
        
        try {
            const snapshot = await db.collection('orders')
                .where('userId', '==', window.currentUser.uid)
                .orderBy('createdAt', 'desc')
                .limit(10) // ← Carrega apenas 10 iniciais
                .get();
            
            window.orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Guarda último documento para pagination
            lastOrderDoc = snapshot.docs[snapshot.docs.length - 1];
            hasMoreOrders = snapshot.docs.length === 10;
            
            window.renderOrders();
            console.log(`✅ ${window.orders.length} pedidos carregados (lazy)`);
            
        } catch (err) {
            console.error('Error loading orders:', err);
        }
    };
    
    // Nova função para carregar mais pedidos
    window.loadMoreOrders = async function() {
        if (!window.currentUser || !lastOrderDoc || !hasMoreOrders || isLoadingOrders) {
            console.log('⚠️ Não há mais pedidos ou já está carregando');
            return;
        }
        
        isLoadingOrders = true;
        
        // Mostra loading no botão
        const btn = document.getElementById('loadMoreOrdersBtn');
        if (btn) {
            btn.textContent = 'Carregando...';
            btn.disabled = true;
        }
        
        try {
            const snapshot = await db.collection('orders')
                .where('userId', '==', window.currentUser.uid)
                .orderBy('createdAt', 'desc')
                .startAfter(lastOrderDoc)
                .limit(10)
                .get();
            
            const newOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.orders = [...window.orders, ...newOrders];
            
            lastOrderDoc = snapshot.docs[snapshot.docs.length - 1];
            hasMoreOrders = snapshot.docs.length === 10;
            
            window.renderOrders();
            console.log(`✅ +${newOrders.length} pedidos carregados (total: ${window.orders.length})`);
            
        } catch (err) {
            console.error('Error loading more orders:', err);
            if (btn) {
                btn.textContent = 'Erro ao carregar';
                setTimeout(() => {
                    btn.textContent = 'Carregar mais pedidos';
                }, 2000);
            }
        } finally {
            isLoadingOrders = false;
            if (btn) {
                btn.textContent = 'Carregar mais pedidos';
                btn.disabled = false;
            }
        }
    };
    
    // Intercepta renderOrders para adicionar botão "Carregar mais"
    const _originalRenderOrders = window.renderOrders;
    
    window.renderOrders = function() {
        // Garante que orders existe
        if (!window.orders) {
            window.orders = [];
        }
        
        // Chama render original
        _originalRenderOrders();
        
        // Adiciona botão "Carregar mais" se houver mais pedidos
        const container = document.getElementById('ordersList');
        if (!container) return;
        
        // Remove botão existente se houver
        const existingBtn = document.getElementById('loadMoreOrdersBtn');
        if (existingBtn) existingBtn.remove();
        
        // Adiciona botão se houver mais pedidos
        if (hasMoreOrders && window.orders.length > 0) {
            const btn = document.createElement('button');
            btn.id = 'loadMoreOrdersBtn';
            btn.className = 'btn btn-secondary';
            btn.textContent = 'Carregar mais pedidos';
            btn.style.cssText = 'width: 100%; margin-top: 16px;';
            btn.onclick = window.loadMoreOrders;
            
            container.appendChild(btn);
            console.log('✅ Botão "Carregar mais" adicionado');
        }
    };
    
    console.log('✅ Lazy loading de pedidos ativo');
    
})();