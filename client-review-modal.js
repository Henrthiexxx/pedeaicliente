const ClientReview = {
    currentOrder: null,
    ratings: {
        store: 0,
        driver: 0,
        products: {}
    },
    submitting: false,
    
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
                            <div class="review-prompt-subtitle">${this.escape(pending.storeName || 'Loja')}</div>
                        </div>
                        <button class="review-prompt-close" onclick="this.parentElement.parentElement.remove()">×</button>
                    </div>
                    <div class="review-prompt-items">${this.escape(this.getOrderItems(pending))}</div>
                    <button class="btn btn-primary btn-block btn-sm" onclick="ClientReview.open('${this.escapeAttr(pending.id)}')" style="margin-top:12px;">
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

    escape(value) {
        if (typeof esc === 'function') return esc(value);
        const div = document.createElement('div');
        div.textContent = String(value || '');
        return div.innerHTML;
    },

    escapeAttr(value) {
        return this.escape(value).replace(/'/g, '&#39;');
    },

    getProductKey(item, index) {
        return String(item?.productId || item?.id || `item-${index}`);
    },

    getCommentValue() {
        return document.getElementById('reviewComment')?.value || '';
    },

    rerender() {
        const comment = this.getCommentValue();
        this.render();
        const input = document.getElementById('reviewComment');
        if (input) input.value = comment;
    },

    getCurrentUser() {
        if (typeof currentUser !== 'undefined' && currentUser?.uid) return currentUser;
        return firebase.auth?.().currentUser || null;
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
        this.submitting = false;
        
        this.render();
        
        const modal = document.getElementById('reviewModal');
        if (modal) modal.classList.add('active');
    },
    
    render() {
        const order = this.currentOrder;
        const container = document.getElementById('reviewModalContent');
        if (!container) return;
        const items = Array.isArray(order.items) ? order.items : [];
        
        container.innerHTML = `
            <div class="review-store-name">${this.escape(order.storeName || 'Loja')}</div>
            <div class="review-items">Pedido #${this.escape(String(order.id || '').slice(-6).toUpperCase())}</div>
            
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
            ${items.length > 0 ? `
                <div class="review-section">
                    <h4>Como foram os produtos?</h4>
                    <div class="review-section-desc">Qualidade, sabor, apresentação</div>
                    <div id="productsRatingContainer">
                        ${items.slice(0, 5).map((item, index) => {
                            const productKey = this.getProductKey(item, index);
                            return `
                            <div class="emoji-rating" style="margin-bottom:8px;">
                                <div style="flex:1;min-width:100px;font-size:0.85rem;">${this.escape(item.name || 'Produto')}</div>
                                ${[1, 2, 3, 4, 5].map(rating => `
                                    <div class="emoji-option ${this.ratings.products[productKey] === rating ? 'selected' : ''}" 
                                         onclick="ClientReview.setProductRating('${this.escapeAttr(productKey)}', ${rating})"
                                         style="padding:8px;">
                                        <div class="emoji" style="font-size:1.2rem;">${this.getEmoji(rating)}</div>
                                    </div>
                                `).join('')}
                            </div>
                        `}).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Comentário -->
            <div class="review-section">
                <h4>Comentário (opcional)</h4>
                <textarea class="input review-comment" id="reviewComment" rows="3" 
                          placeholder="Conte como foi sua experiência..."></textarea>
            </div>
            
            <button class="btn btn-primary btn-block" id="reviewSubmitBtn" onclick="ClientReview.submit()" ${this.submitting ? 'disabled' : ''}>
                ${this.submitting ? 'Enviando...' : 'Enviar Avaliação'}
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
        this.rerender();
    },
    
    setDriverRating(rating) {
        this.ratings.driver = rating;
        this.rerender();
    },
    
    setProductRating(productId, rating) {
        this.ratings.products[productId] = rating;
        this.rerender();
    },

    getProductRatings() {
        const items = Array.isArray(this.currentOrder?.items) ? this.currentOrder.items : [];
        return items.slice(0, 5).map((item, index) => {
            const productId = this.getProductKey(item, index);
            return {
                productId,
                productName: item?.name || '',
                rating: this.ratings.products[productId] || 0
            };
        }).filter(product => product.rating > 0);
    },

    getLegacyCriteria(productRatings) {
        const productAverage = productRatings.length
            ? productRatings.reduce((sum, product) => sum + product.rating, 0) / productRatings.length
            : this.ratings.store;
        const driverOrStore = this.currentOrder.driverId ? (this.ratings.driver || this.ratings.store) : this.ratings.store;
        return {
            service: this.ratings.store,
            quality: Math.round(productAverage),
            time: driverOrStore,
            value: this.ratings.store
        };
    },
    
    async submit() {
        if (this.submitting) return;
        const authUser = this.getCurrentUser();
        if (!authUser) {
            if (typeof showToast === 'function') showToast('Faça login para avaliar.');
            return;
        }

        if (this.ratings.store === 0) {
            if (typeof showToast === 'function') showToast('Avalie a loja!');
            return;
        }
        
        if (this.currentOrder.driverId && this.ratings.driver === 0) {
            if (typeof showToast === 'function') showToast('Avalie o entregador!');
            return;
        }
        
        const comment = this.getCommentValue().trim();
        const productRatings = this.getProductRatings();
        const criteria = this.getLegacyCriteria(productRatings);
        
        const review = {
            orderId: this.currentOrder.id,
            storeId: this.currentOrder.storeId,
            storeName: this.currentOrder.storeName || '',
            driverId: this.currentOrder.driverId || null,
            driverName: this.currentOrder.driverName || this.currentOrder.driver?.name || '',
            userId: authUser.uid,
            userName: authUser.displayName || this.currentOrder.userName || 'Cliente',
            storeRating: this.ratings.store,
            driverRating: this.ratings.driver || null,
            productRatings,
            service: criteria.service,
            quality: criteria.quality,
            time: criteria.time,
            value: criteria.value,
            comment,
            type: 'store',
            targetName: this.currentOrder.storeName || 'Loja',
            status: 'visible',
            purchasedAction: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        try {
            this.submitting = true;
            this.render();

            await db.collection('reviews').add(review);
            
            await db.collection('orders').doc(this.currentOrder.id).update({
                reviewed: true
            });
            
            if (typeof orders !== 'undefined') {
                const idx = orders.findIndex(o => o.id === this.currentOrder.id);
                if (idx !== -1) orders[idx].reviewed = true;
            }
            
            await this.updateStoreAverage(this.currentOrder.storeId);
            
            this.close();
            this.checkPendingReviews();
            if (typeof render === 'function') render();
            
            if (typeof showToast === 'function') {
                showToast('Avaliação enviada! Obrigado!');
            }
            
        } catch (err) {
            console.error('Erro ao enviar avaliação:', err);
            this.submitting = false;
            this.render();
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
            
            const ratings = snapshot.docs
                .map(d => d.data())
                .filter(review => review.status !== 'hidden')
                .map(review => review.storeRating || 0)
                .filter(rating => rating > 0);
            
            if (ratings.length === 0) return;
            
            const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
            
            await db.collection('stores').doc(storeId).update({
                rating: parseFloat(avg.toFixed(1)),
                reviewCount: ratings.length,
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
        this.submitting = false;
    }
};

window.ClientReview = ClientReview;

// Auto-check ao carregar pedidos
if (typeof orders !== 'undefined') {
    setTimeout(() => ClientReview.checkPendingReviews(), 1000);
}
