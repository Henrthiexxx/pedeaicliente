// ==================== USER-ORDER MODULE ====================
// Garante que telefone e dados do usuário são incluídos nos pedidos
// e busca telefone da collection users se necessário

const UserOrder = {

    // Busca dados do usuário da collection users
    async getUserData(userId) {
        if (!userId || typeof db === 'undefined') return null;
        try {
            const doc = await db.collection('users').doc(userId).get();
            return doc.exists ? doc.data() : null;
        } catch (err) {
            console.error('UserOrder: erro ao buscar usuário', err);
            return null;
        }
    },

    // Verifica se usuário tem telefone cadastrado
    async hasPhone(userId) {
        const data = await this.getUserData(userId);
        const phone = String(data?.phone || '').replace(/\D/g, '');
        return phone.length >= 10;
    },

    // Retorna telefone formatado
    async getPhone(userId) {
        const data = await this.getUserData(userId);
        return data?.phone || '';
    },

    // Bloqueia pedido se não tiver telefone
    async checkBeforeOrder(userId) {
        const has = await this.hasPhone(userId);
        if (!has) {
            if (typeof showToast === 'function') {
                showToast('⚠️ Cadastre seu telefone antes de pedir');
            }
            setTimeout(() => { window.location.href = 'profile.html'; }, 1200);
            return false;
        }
        return true;
    },

    // Prepara dados do usuário para incluir no pedido
    async prepareOrderData(userId) {
        const data = await this.getUserData(userId);
        const user = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
        
        return {
            userName: data?.name || user?.displayName || 'Cliente',
            userPhone: data?.phone || '',
            userCpf: data?.cpf || '',
            userEmail: user?.email || ''
        };
    },

    // Formata telefone para exibição
    formatPhone(phone) {
        const v = String(phone || '').replace(/\D/g, '');
        if (v.length === 11) return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
        if (v.length === 10) return `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
        return phone || '';
    }
};

// Cache de telefones para evitar múltiplas buscas no painel da loja
const _phoneCache = {};

// Função global para buscar telefone (usada pelo fixes.js)
window.fetchUserPhone = async function(userId) {
    if (!userId) return null;
    
    // Verifica cache primeiro
    if (_phoneCache[userId]) return _phoneCache[userId];
    
    const phone = await UserOrder.getPhone(userId);
    if (phone) {
        _phoneCache[userId] = phone;
    }
    return phone;
};

// Intercepta criação de pedido para incluir dados do usuário
(function() {
    if (typeof firebase === 'undefined') return;
    
    const checkAndPatch = () => {
        if (typeof firebase.firestore !== 'function') {
            setTimeout(checkAndPatch, 100);
            return;
        }

        const originalAdd = firebase.firestore.CollectionReference.prototype.add;
        firebase.firestore.CollectionReference.prototype.add = async function(data) {
            // Se é criação de pedido
            if (this.path === 'orders' && data && data.userId) {
                try {
                    const userData = await UserOrder.prepareOrderData(data.userId);
                    data = { ...data, ...userData };
                    console.log('✓ Dados do usuário adicionados ao pedido');
                } catch (e) {
                    console.error('Erro ao adicionar dados:', e);
                }
            }
            return originalAdd.call(this, data);
        };
    };
    
    checkAndPatch();
})();

window.UserOrder = UserOrder;
console.log('✓ UserOrder module loaded');