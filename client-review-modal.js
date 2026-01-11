const ClientReview = {
    currentOrder: null,
    ratings: {
        store: 0,
        driver: 0,
        products: {}
    },
    
    // Mostra prompt para avaliar
    checkPendingReviews() {
        if (typeof orders === 'undefined') return;
        
        const pending = orders.find(o => 
            o.status === 'delivered' && 
            !o.reviewed &&
            o.userId === currentUser?.uid
        );
        
        const container = document.getElementById('reviewPromptContainer');
        if (!container) return;
        
        if (pending) {
            container.innerHTML = `
                <div class="review-prompt-card">
                    <div class="review-prompt-header">
                        <div class="review-prompt-icon">⭐</div>
                        <div>
                            <div class="review-prompt-title">Avalie seu pedido!</div>
                            <div class="review-prompt-subtitle">${pending.storeName}</div>
                        </div>
                        <button class="review-prompt-close" onclick="this.parentElement.parentElement.remove()">×</button>
                    </div>
                    <div class="review-prompt-items">${this.getOrderItems(pending)}</div>
                    <button class="btn btn-primary btn-block btn-sm" onclick="ClientReview.open('${pending.id}')" style="margin-top:12px;">
                        Avaliar Agora
                    </button>
                </div>
            `;
        } else {
            container.innerHTML = '';
        }
    },
    
    getOrderItems(order) {
        if (!order.items || order.items.length === 0) return '';
        const items = order.items.slice(0, 3).map(i => i.name).join(', ');
        return order.items.length > 3 ? items + '...' : items;
    },
    
    // Abre modal de avaliação
    async open(orderId) {
        if (typeof orders === 'undefined') return;
        
        this.currentOrder = orders.find(o => o.id === orderId);
        if (!this.currentOrder) return;
        
        this.ratings = {
            store: 0,
            driver: 0,
            products: {}
        };
        
        this.render();
        
        const modal = document.getElementById('reviewModal');
        if (modal) modal.classList.add('active');
    },
    
    render() {
        const order = this.currentOrder;
        const container = document.getElementById('reviewModalContent');
        if (!container) return;
        
        container.innerHTML = `
            <div class="review-store-name">${order.storeName}</div>
            <div class="review-items">Pedido #${order.id.slice(-6).toUpperCase()}</div>
            
            <!-- Avaliação da Loja -->
            <div class="review-section">
                <h4>Como foi a loja?</h4>
                <div class="review-section-desc">Qualidade, atendimento, tempo</div>
                <div class="emoji-rating">
                    ${[1, 2, 3, 4, 5].map(rating => `
                        <div class="emoji-option ${this.ratings.store === rating ? 'selected' : ''}" 
                             onclick="ClientReview.setStoreRating(${rating})">
                            <div class="emoji">${this.getEmoji(rating)}</div>
                            <div class="emoji-label">${this.getLabel(rating)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Avaliação do Entregador -->
            ${order.driverId ? `
                <div class="review-section">
                    <h4>Como foi a entrega?</h4>
                    <div class="review-section-desc">Pontualidade, cuidado, atendimento</div>
                    <div class="emoji-rating">
                        ${[1, 2, 3, 4, 5].map(rating => `
                            <div class="emoji-option ${this.ratings.driver === rating ? 'selected' : ''}" 
                                 onclick="ClientReview.setDriverRating(${rating})">
                                <div class="emoji">${this.getEmoji(rating)}</div>
                                <div class="emoji-label">${this.getLabel(rating)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Avaliação dos Produtos (opcional) -->
            ${order.items?.length > 0 ? `
                <div class="review-section">
                    <h4>Como foram os produtos?</h4>
                    <div class="review-section-desc">Qualidade, sabor, apresentação</div>
                    <div id="productsRatingContainer">
                        ${order.items.slice(0, 5).map(item => `
                            <div class="emoji-rating" style="margin-bottom:8px;">
                                <div style="flex:1;min-width:100px;font-size:0.85rem;">${item.name}</div>
                                ${[1, 2, 3, 4, 5].map(rating => `
                                    <div class="emoji-option ${this.ratings.products[item.productId] === rating ? 'selected' : ''}" 
                                         onclick="ClientReview.setProductRating('${item.productId}', ${rating})"
                                         style="padding:8px;">
                                        <div class="emoji" style="font-size:1.2rem;">${this.getEmoji(rating)}</div>
                                    </div>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Comentário -->
            <div class="review-section">
                <h4>Comentário (opcional)</h4>
                <textarea class="input review-comment" id="reviewComment" rows="3" 
                          placeholder="Conte como foi sua experiência..."></textarea>
            </div>
            
            <button class="btn btn-primary btn-block" onclick="ClientReview.submit()">
                Enviar Avaliação
            </button>
        `;
    },
    
    getEmoji(rating) {
        const emojis = ['😞', '😕', '😐', '😊', '😍'];
        return emojis[rating - 1] || '😐';
    },
    
    getLabel(rating) {
        const labels = ['Ruim', 'Regular', 'Bom', 'Ótimo', 'Excelente'];
        return labels[rating - 1] || '';
    },
    
    setStoreRating(rating) {
        this.ratings.store = rating;
        this.render();
    },
    
    setDriverRating(rating) {
        this.ratings.driver = rating;
        this.render();
    },
    
    setProductRating(productId, rating) {
        this.ratings.products[productId] = rating;
        this.render();
    },
    
    async submit() {
        if (this.ratings.store === 0) {
            if (typeof showToast === 'function') showToast('Avalie a loja!');
            return;
        }
        
        if (this.currentOrder.driverId && this.ratings.driver === 0) {
            if (typeof showToast === 'function') showToast('Avalie o entregador!');
            return;
        }
        
        const comment = document.getElementById('reviewComment')?.value?.trim() || '';
        
        // Monta ratings dos produtos
        const productRatings = Object.keys(this.ratings.products).map(productId => ({
            productId,
            rating: this.ratings.products[productId]
        })).filter(p => p.rating > 0);
        
        const review = {
            orderId: this.currentOrder.id,
            storeId: this.currentOrder.storeId,
            driverId: this.currentOrder.driverId || null,
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Cliente',
            storeRating: this.ratings.store,
            driverRating: this.ratings.driver || null,
            productRatings,
            comment,
            type: 'order',
            purchasedAction: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        try {
            // Salva review
            await db.collection('reviews').add(review);
            
            // Marca pedido como avaliado
            await db.collection('orders').doc(this.currentOrder.id).update({
                reviewed: true
            });
            
            // Atualiza local
            if (typeof orders !== 'undefined') {
                const idx = orders.findIndex(o => o.id === this.currentOrder.id);
                if (idx !== -1) orders[idx].reviewed = true;
            }
            
            // Atualiza média da loja (opcional - pode fazer via Cloud Function)
            this.updateStoreAverage(this.currentOrder.storeId);
            
            this.close();
            this.checkPendingReviews();
            
            if (typeof showToast === 'function') {
                showToast('Avaliação enviada! Obrigado! 🎉');
            }
            
        } catch (err) {
            console.error('Erro ao enviar avaliação:', err);
            if (typeof showToast === 'function') {
                showToast('Erro ao enviar avaliação');
            }
        }
    },
    
    async updateStoreAverage(storeId) {
        try {
            const snapshot = await db.collection('reviews')
                .where('storeId', '==', storeId)
                .get();
            
            const ratings = snapshot.docs.map(d => d.data().storeRating || 0).filter(r => r > 0);
            
            if (ratings.length === 0) return;
            
            const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
            
            await db.collection('stores').doc(storeId).update({
                rating: parseFloat(avg.toFixed(1)),
                reviewsCount: ratings.length
            });
            
        } catch (err) {
            console.error('Erro ao atualizar média:', err);
        }
    },
    
    close() {
        const modal = document.getElementById('reviewModal');
        if (modal) modal.classList.remove('active');
        
        this.currentOrder = null;
        this.ratings = {store: 0, driver: 0, products: {}};
    }
};

// Auto-check ao carregar pedidos
if (typeof orders !== 'undefined') {
    setTimeout(() => ClientReview.checkPendingReviews(), 1000);
}