// ADICIONAR NO index.js DO CLIENTE
// Sistema de sincronização de notificações localStorage

const NotificationSync = {
    
    // Chame após login do usuário
    async syncNotifications() {
        if (!currentUser) return;
        
        try {
            // Busca notificações pendentes do Firestore
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const pendingNotifications = userDoc.data()?.pendingNotifications || [];
            
            if (pendingNotifications.length === 0) return;
            
            // Pega notificações já salvas no localStorage
            const localNotifs = JSON.parse(localStorage.getItem('notifications') || '[]');
            
            // Adiciona apenas novas (evita duplicatas)
            const existingIds = new Set(localNotifs.map(n => n.id));
            const newNotifs = pendingNotifications.filter(n => !existingIds.has(n.id));
            
            if (newNotifs.length > 0) {
                // Salva no localStorage
                const updated = [...newNotifs, ...localNotifs].slice(0, 50); // Max 50
                localStorage.setItem('notifications', JSON.stringify(updated));
                
                // Mostra popup da mais recente
                this.showPopup(newNotifs[0]);
                
                // Limpa do Firestore (já sincronizado)
                await db.collection('users').doc(currentUser.uid).update({
                    pendingNotifications: []
                });
            }
            
        } catch (err) {
            console.error('Erro ao sincronizar notificações:', err);
        }
    },
    
    // Mostra popup de notificação
    showPopup(notification) {
        // Cria elemento temporário
        const popup = document.createElement('div');
        popup.className = 'notification-popup';
        popup.innerHTML = `
            <div class="notification-popup-content">
                <div class="notification-popup-icon">📢</div>
                <div class="notification-popup-text">
                    <div class="notification-popup-title">${notification.title}</div>
                    <div class="notification-popup-message">${notification.message}</div>
                </div>
                <button class="notification-popup-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        document.body.appendChild(popup);
        
        // Anima entrada
        setTimeout(() => popup.classList.add('show'), 100);
        
        // Auto-remove após 5s
        setTimeout(() => {
            popup.classList.remove('show');
            setTimeout(() => popup.remove(), 300);
        }, 5000);
        
        // Vibra
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }
    },
    
    // Pega histórico de notificações
    getHistory() {
        return JSON.parse(localStorage.getItem('notifications') || '[]');
    },
    
    // Marca como lida
    markAsRead(notificationId) {
        const notifs = this.getHistory();
        const updated = notifs.map(n => 
            n.id === notificationId ? {...n, read: true} : n
        );
        localStorage.setItem('notifications', JSON.stringify(updated));
    },
    
    // Deleta notificação
    deleteNotification(notificationId) {
        const notifs = this.getHistory();
        const filtered = notifs.filter(n => n.id !== notificationId);
        localStorage.setItem('notifications', JSON.stringify(filtered));
    },
    
    // Limpa todas
    clearAll() {
        localStorage.setItem('notifications', '[]');
    },
    
    // Renderiza histórico (chamado em página de notificações)
    renderHistory(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const notifs = this.getHistory();
        
        if (notifs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔔</div>
                    <div class="empty-state-title">Nenhuma notificação</div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = notifs.map(n => {
            const date = new Date(n.createdAt);
            const isUnread = !n.read;
            
            return `
                <div class="notification-item ${isUnread ? 'unread' : ''}" 
                     onclick="NotificationSync.markAsRead('${n.id}')">
                    <div class="notification-item-icon">${isUnread ? '🔵' : '⚪'}</div>
                    <div class="notification-item-content">
                        <div class="notification-item-title">${n.title}</div>
                        <div class="notification-item-message">${n.message}</div>
                        <div class="notification-item-time">${date.toLocaleString('pt-BR')}</div>
                    </div>
                    <button class="notification-item-delete" 
                            onclick="event.stopPropagation(); NotificationSync.deleteNotification('${n.id}'); NotificationSync.renderHistory('${containerId}')">
                        🗑️
                    </button>
                </div>
            `;
        }).join('');
    }
};

// INTEGRAÇÃO: Chame após login
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        
        // ... seu código existente de login ...
        
        // ADICIONAR: Sincroniza notificações
        await NotificationSync.syncNotifications();
    }
});

// CSS para popup (adicionar no index.css do cliente)
/*
.notification-popup {
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%) translateY(-100px);
    z-index: 1000;
    opacity: 0;
    transition: all 0.3s ease;
    max-width: 90%;
    width: 400px;
}

.notification-popup.show {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
}

.notification-popup-content {
    background: var(--bg-card);
    border: 1px solid var(--primary);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.notification-popup-icon {
    font-size: 1.5rem;
}

.notification-popup-text {
    flex: 1;
}

.notification-popup-title {
    font-weight: 600;
    margin-bottom: 4px;
}

.notification-popup-message {
    font-size: 0.85rem;
    color: var(--text-muted);
}

.notification-popup-close {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-size: 1.2rem;
    cursor: pointer;
    transition: all 0.2s;
}

.notification-popup-close:hover {
    border-color: var(--primary);
}

.notification-item {
    display: flex;
    gap: 12px;
    padding: 14px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: all 0.2s;
}

.notification-item:hover {
    background: rgba(255,255,255,0.03);
}

.notification-item.unread {
    background: rgba(255,255,255,0.05);
}

.notification-item-icon {
    font-size: 0.8rem;
}

.notification-item-content {
    flex: 1;
}

.notification-item-title {
    font-weight: 600;
    margin-bottom: 4px;
}

.notification-item-message {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 6px;
}

.notification-item-time {
    font-size: 0.75rem;
    color: var(--text-muted);
}

.notification-item-delete {
    background: none;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.2s;
}

.notification-item-delete:hover {
    opacity: 1;
}
*/