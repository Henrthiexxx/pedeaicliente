// ==================== NOTIFICATIONS MODULE ====================

const NotificationsModule = {
    hasPermission: false,
    
    init() {
        this.requestPermission();
    },
    
    async requestPermission() {
        if (!('Notification' in window)) {
            console.log('Browser não suporta notificações');
            return;
        }
        
        if (Notification.permission === 'granted') {
            this.hasPermission = true;
        } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            this.hasPermission = permission === 'granted';
        }
    },
    
    send(title, body, icon = '🛵') {
        if (!this.hasPermission) return;
        
        try {
            const notification = new Notification(title, {
                body,
                icon: '/icon.png',
                badge: '/icon.png',
                tag: 'pedrad-' + Date.now(),
                vibrate: [200, 100, 200]
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            
            // Auto close após 5s
            setTimeout(() => notification.close(), 5000);
        } catch (err) {
            console.log('Erro ao enviar notificação:', err);
        }
    },
    
    // Notifica mudança de status do pedido
    notifyOrderStatus(order, newStatus) {
        const messages = {
            confirmed: 'Seu pedido foi confirmado! 🎉',
            preparing: 'Seu pedido está sendo preparado 👨‍🍳',
            ready: 'Seu pedido está pronto! 📦',
            delivering: 'Seu pedido saiu para entrega! 🛵',
            delivered: 'Pedido entregue! Bom apetite! 🍽️',
            cancelled: 'Seu pedido foi cancelado 😔'
        };
        
        const msg = messages[newStatus];
        if (msg) {
            this.send(`Pedido #${order.id.slice(-6).toUpperCase()}`, msg);
        }
    },
    
    // Verifica pedidos para avaliar
    checkAndShowReviewPrompt() {
        const pending = orders.find(o => o.status === 'delivered' && !o.reviewed);
        const container = document.getElementById('reviewPromptContainer');
        
        if (pending && container) {
            container.innerHTML = `
                <div class="review-prompt" onclick="NotificationsModule.openReviewModal('${pending.id}')">
                    <div class="review-prompt-icon">⭐</div>
                    <div class="review-prompt-text">
                        <strong>Avalie seu pedido!</strong>
                        <span>Conte como foi sua experiência</span>
                    </div>
                    <div class="review-prompt-arrow">›</div>
                </div>
            `;
        } else if (container) {
            container.innerHTML = '';
        }
    },
    
    openReviewModal(orderId) {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        
        document.getElementById('reviewModalContent').innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 3rem; margin-bottom: 8px;">⭐</div>
                <h3 style="margin-bottom: 4px;">${esc(order.storeName)}</h3>
                <p style="color: var(--text-muted); font-size: 0.85rem;">Pedido #${orderId.slice(-6).toUpperCase()}</p>
            </div>
            
            <div class="rating-stars" id="ratingStars">
                ${[1,2,3,4,5].map(n => `
                    <span class="star" data-rating="${n}" onclick="NotificationsModule.setRating(${n})">☆</span>
                `).join('')}
            </div>
            
            <div class="input-group" style="margin-top: 20px;">
                <label>Comentário (opcional)</label>
                <textarea class="input" id="reviewComment" rows="3" placeholder="Conte sua experiência..."></textarea>
            </div>
            
            <button class="btn btn-primary" onclick="NotificationsModule.submitReview('${orderId}')" style="margin-top: 16px;">
                Enviar avaliação
            </button>
        `;
        
        this.currentRating = 0;
        openModal('reviewModal');
    },
    
    currentRating: 0,
    
    setRating(rating) {
        this.currentRating = rating;
        document.querySelectorAll('#ratingStars .star').forEach((star, idx) => {
            star.textContent = idx < rating ? '★' : '☆';
            star.classList.toggle('active', idx < rating);
        });
    },
    
    async submitReview(orderId) {
        if (this.currentRating === 0) {
            showToast('Selecione uma nota!');
            return;
        }
        
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        
        const review = {
            orderId,
            storeId: order.storeId,
            storeName: order.storeName,
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Cliente',
            rating: this.currentRating,
            comment: document.getElementById('reviewComment').value.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        try {
            await db.collection('reviews').add(review);
            await db.collection('orders').doc(orderId).update({ reviewed: true });
            
            // Atualiza local
            const idx = orders.findIndex(o => o.id === orderId);
            if (idx !== -1) orders[idx].reviewed = true;
            
            closeModal('reviewModal');
            this.checkAndShowReviewPrompt();
            showToast('Avaliação enviada! Obrigado! 🎉');
        } catch (err) {
            console.error('Erro ao enviar avaliação:', err);
            showToast('Erro ao enviar avaliação');
        }
    },
    
    updateNotificationBadge() {
        // Placeholder para badge de notificações
    },
    
    setupOrderStatusListener() {
        // Listener já está no setupRealtimeListeners principal
    }
};
