// ==================== NOTIFICATIONS & RATINGS MODULE ====================
// Gerencia notificações de entrega e sistema de avaliação

const NotificationsModule = {
    pendingReviews: [],
    hasUnseen: false,

    init() {
        this.loadPendingReviews();
    },

    loadPendingReviews() {
        try {
            const saved = localStorage.getItem(`pendingReviews_${currentUser?.uid}`);
            this.pendingReviews = saved ? JSON.parse(saved) : [];
            this.hasUnseen = this.pendingReviews.some(r => !r.seen);
        } catch (e) {
            this.pendingReviews = [];
            this.hasUnseen = false;
        }
    },

    savePendingReviews() {
        localStorage.setItem(`pendingReviews_${currentUser?.uid}`, JSON.stringify(this.pendingReviews));
        this.hasUnseen = this.pendingReviews.some(r => !r.seen);
        this.updateNotificationBadge();
    },

    // Chamado quando um pedido é marcado como entregue
    addDeliveredOrder(order) {
        // Verifica se já existe pendente
        if (this.pendingReviews.some(r => r.orderId === order.id)) return;

        this.pendingReviews.push({
            orderId: order.id,
            storeId: order.storeId,
            storeName: order.storeName,
            items: order.items.map(i => i.name).join(', '),
            deliveredAt: new Date().toISOString(),
            seen: false,
            reviewed: false
        });

        this.savePendingReviews();
        this.showDeliveryNotification(order);
    },

    showDeliveryNotification(order) {
        showToast(`🎉 Pedido entregue! Avalie ${order.storeName}`);
        
        // Vibrar se suportado
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }
    },

    markAsSeen(orderId) {
        const review = this.pendingReviews.find(r => r.orderId === orderId);
        if (review) {
            review.seen = true;
            this.savePendingReviews();
        }
    },

    markAllAsSeen() {
        this.pendingReviews.forEach(r => r.seen = true);
        this.savePendingReviews();
    },

    removeReview(orderId) {
        this.pendingReviews = this.pendingReviews.filter(r => r.orderId !== orderId);
        this.savePendingReviews();
    },

    getUnseenCount() {
        return this.pendingReviews.filter(r => !r.seen && !r.reviewed).length;
    },

    getPendingCount() {
        return this.pendingReviews.filter(r => !r.reviewed).length;
    },

    updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        const count = this.getUnseenCount();
        if (badge) {
            badge.textContent = count > 0 ? count : '';
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    },

    // Verifica se há avaliações pendentes para mostrar na home
    checkAndShowReviewPrompt() {
        const pending = this.pendingReviews.filter(r => !r.reviewed);
        if (pending.length > 0) {
            this.renderReviewPrompt(pending[0]);
        } else {
            const prompt = document.getElementById('reviewPromptContainer');
            if (prompt) prompt.innerHTML = '';
        }
    },

    renderReviewPrompt(review) {
        const container = document.getElementById('reviewPromptContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="review-prompt-card">
                <div class="review-prompt-header">
                    <span class="review-prompt-icon">⭐</span>
                    <div>
                        <div class="review-prompt-title">Como foi seu pedido?</div>
                        <div class="review-prompt-subtitle">${review.storeName}</div>
                    </div>
                    <button class="review-prompt-close" onclick="NotificationsModule.dismissPrompt('${review.orderId}')">×</button>
                </div>
                <div class="review-prompt-items">${review.items}</div>
                <button class="btn btn-primary btn-sm" onclick="NotificationsModule.openReviewModal('${review.orderId}')" style="margin-top: 12px;">
                    Avaliar agora
                </button>
            </div>
        `;

        // Marca como visto
        this.markAsSeen(review.orderId);
    },

    dismissPrompt(orderId) {
        const container = document.getElementById('reviewPromptContainer');
        if (container) container.innerHTML = '';
        
        // Mostra próxima avaliação pendente se houver
        const pending = this.pendingReviews.filter(r => !r.reviewed && r.orderId !== orderId);
        if (pending.length > 0) {
            setTimeout(() => this.renderReviewPrompt(pending[0]), 300);
        }
    },

    openReviewModal(orderId) {
        const review = this.pendingReviews.find(r => r.orderId === orderId);
        if (!review) return;

        const modal = document.getElementById('reviewModal');
        const content = document.getElementById('reviewModalContent');

        content.innerHTML = `
            <div class="review-store-name">${review.storeName}</div>
            <div class="review-items">${review.items}</div>
            
            <div class="review-section">
                <h4>🚚 Entrega</h4>
                <p class="review-section-desc">Como foi a entrega e o entregador?</p>
                <div class="emoji-rating" id="deliveryRating" data-value="0">
                    ${this.renderEmojiOptions('delivery')}
                </div>
            </div>
            
            <div class="review-section">
                <h4>🍽️ Produto e Atendimento</h4>
                <p class="review-section-desc">Como foi a comida e o atendimento da loja?</p>
                <div class="emoji-rating" id="productRating" data-value="0">
                    ${this.renderEmojiOptions('product')}
                </div>
            </div>
            
            <div class="review-section">
                <h4>💬 Comentário (opcional)</h4>
                <textarea class="input review-comment" id="reviewComment" 
                          placeholder="Conte mais sobre sua experiência..." rows="3"></textarea>
            </div>
            
            <button class="btn btn-primary" onclick="NotificationsModule.submitReview('${orderId}')">
                Enviar Avaliação
            </button>
        `;

        openModal('reviewModal');
    },

    renderEmojiOptions(type) {
        const emojis = [
            { value: 1, emoji: '😠', label: 'Péssimo' },
            { value: 2, emoji: '😕', label: 'Ruim' },
            { value: 3, emoji: '😐', label: 'Regular' },
            { value: 4, emoji: '😊', label: 'Bom' },
            { value: 5, emoji: '🤩', label: 'Excelente' }
        ];

        return emojis.map(e => `
            <button type="button" class="emoji-option" 
                    data-value="${e.value}"
                    onclick="NotificationsModule.selectRating('${type}', ${e.value}, this)">
                <span class="emoji">${e.emoji}</span>
                <span class="emoji-label">${e.label}</span>
            </button>
        `).join('');
    },

    selectRating(type, value, btn) {
        const container = btn.parentElement;
        container.dataset.value = value;
        
        // Remove seleção anterior
        container.querySelectorAll('.emoji-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        
        // Adiciona seleção atual
        btn.classList.add('selected');
    },

    async submitReview(orderId) {
        const deliveryRating = parseInt(document.getElementById('deliveryRating').dataset.value);
        const productRating = parseInt(document.getElementById('productRating').dataset.value);
        const comment = document.getElementById('reviewComment').value.trim();

        if (deliveryRating === 0 || productRating === 0) {
            showToast('Por favor, avalie entrega e produto');
            return;
        }

        const review = this.pendingReviews.find(r => r.orderId === orderId);
        if (!review) return;

        try {
            // Salva avaliação no Firestore
            await db.collection('reviews').add({
                orderId: orderId,
                storeId: review.storeId,
                storeName: review.storeName,
                userId: currentUser.uid,
                userName: currentUser.displayName || 'Cliente',
                deliveryRating,
                productRating,
                averageRating: (deliveryRating + productRating) / 2,
                comment,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Atualiza pedido como avaliado
            await db.collection('orders').doc(orderId).update({
                reviewed: true,
                reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Remove da lista de pendentes
            this.removeReview(orderId);

            closeModal('reviewModal');
            showToast('Obrigado pela avaliação! ⭐');

            // Verifica se há mais avaliações pendentes
            this.checkAndShowReviewPrompt();

        } catch (err) {
            console.error('Erro ao enviar avaliação:', err);
            showToast('Erro ao enviar avaliação');
        }
    },

    // Listener para mudanças de status do pedido
    setupOrderStatusListener() {
        if (!currentUser) return;

        db.collection('orders')
            .where('userId', '==', currentUser.uid)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'modified') {
                        const order = { id: change.doc.id, ...change.doc.data() };
                        
                        // Verifica se foi entregue
                        if (order.status === 'delivered' && !order.reviewed) {
                            // Verifica se já não está na lista de pendentes
                            if (!this.pendingReviews.some(r => r.orderId === order.id)) {
                                this.addDeliveredOrder(order);
                            }
                        }
                    }
                });
            });
    }
};

// Exportar para uso global
window.NotificationsModule = NotificationsModule;