// ==================== PROFILE MODULE ====================
// Perfil obrigatório + Sistema de reputação

const ProfileModule = {
    userData: null,
    
    // Campos obrigatórios para fazer pedido
    requiredFields: ['name', 'phone'],
    requiredAddressFields: ['street', 'number', 'neighborhood'],
    
    // Pontuação por campo
    scoreConfig: {
        name: 10,
        phone: 10,
        cpf: 15,
        email: 5,
        address: 20,       // Endereço completo
        photo: 10,
        ordersCompleted: 2 // Por pedido (max 30)
    },
    
    init() {
        this.loadUserData();
    },
    
    // ==================== DATA ====================
    
    async loadUserData() {
        if (!currentUser) return;
        
        try {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            this.userData = doc.exists ? doc.data() : {};
            
            // Garante campos básicos
            if (!this.userData.reputation) {
                this.userData.reputation = { score: 0, level: 'bronze' };
            }
            
            this.calculateReputation();
        } catch (err) {
            console.error('Error loading user data:', err);
            this.userData = {};
        }
    },
    
    // ==================== VALIDAÇÃO ====================
    
    isProfileComplete() {
        if (!this.userData) return false;
        
        // Verifica campos obrigatórios
        for (const field of this.requiredFields) {
            if (!this.userData[field] || this.userData[field].trim() === '') {
                return false;
            }
        }
        
        // Verifica se tem pelo menos 1 endereço
        return addresses.length > 0;
    },
    
    getMissingFields() {
        const missing = [];
        
        if (!this.userData?.name) missing.push('Nome');
        if (!this.userData?.phone) missing.push('Telefone');
        if (addresses.length === 0) missing.push('Endereço');
        
        return missing;
    },
    
    // Chamado antes de finalizar pedido
    canCheckout() {
        if (this.isProfileComplete()) {
            return { ok: true };
        }
        
        const missing = this.getMissingFields();
        return {
            ok: false,
            message: `Complete seu perfil primeiro: ${missing.join(', ')}`,
            missing
        };
    },
    
    // ==================== REPUTAÇÃO ====================
    
    calculateReputation() {
        if (!this.userData) return 0;
        
        let score = 0;
        
        // Pontos por campos preenchidos
        if (this.userData.name) score += this.scoreConfig.name;
        if (this.userData.phone) score += this.scoreConfig.phone;
        if (this.userData.cpf) score += this.scoreConfig.cpf;
        if (this.userData.email || currentUser?.email) score += this.scoreConfig.email;
        if (this.userData.photoURL) score += this.scoreConfig.photo;
        
        // Pontos por endereço completo
        if (addresses.length > 0) {
            const addr = addresses[0];
            if (addr.street && addr.number && addr.neighborhood) {
                score += this.scoreConfig.address;
            }
        }
        
        // Pontos por pedidos completados (max 30 pts)
        const completedOrders = orders.filter(o => o.status === 'delivered').length;
        score += Math.min(completedOrders * this.scoreConfig.ordersCompleted, 30);
        
        // Determina nível
        let level = 'bronze';
        if (score >= 80) level = 'platinum';
        else if (score >= 60) level = 'gold';
        else if (score >= 40) level = 'silver';
        
        this.userData.reputation = { score, level };
        
        return score;
    },
    
    getLevelInfo(level) {
        const levels = {
            bronze: { icon: '🥉', name: 'Bronze', color: '#CD7F32', next: 40 },
            silver: { icon: '🥈', name: 'Prata', color: '#C0C0C0', next: 60 },
            gold: { icon: '🥇', name: 'Ouro', color: '#FFD700', next: 80 },
            platinum: { icon: '💎', name: 'Platina', color: '#E5E4E2', next: 100 }
        };
        return levels[level] || levels.bronze;
    },
    
    // ==================== SAVE ====================
    
    async saveProfile(data) {
        if (!currentUser) return false;
        
        try {
            await db.collection('users').doc(currentUser.uid).set(data, { merge: true });
            this.userData = { ...this.userData, ...data };
            this.calculateReputation();
            
            // Salva reputação atualizada
            await db.collection('users').doc(currentUser.uid).update({
                reputation: this.userData.reputation
            });
            
            return true;
        } catch (err) {
            console.error('Error saving profile:', err);
            return false;
        }
    },
    
    // ==================== RENDER ====================
    
    render() {
        const container = document.getElementById('profilePage');
        if (!container) return;
        
        const name = this.userData?.name || currentUser?.displayName || 'Usuário';
        const email = this.userData?.email || currentUser?.email || '';
        const phone = this.userData?.phone || '';
        const cpf = this.userData?.cpf || '';
        const reputation = this.userData?.reputation || { score: 0, level: 'bronze' };
        const levelInfo = this.getLevelInfo(reputation.level);
        const isComplete = this.isProfileComplete();
        const completedOrders = orders.filter(o => o.status === 'delivered').length;
        
        container.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar" id="profileAvatarContainer">
                    ${this.userData?.photoURL 
                        ? `<img src="${this.userData.photoURL}" alt="Avatar">`
                        : `<span>${name.charAt(0).toUpperCase()}</span>`
                    }
                </div>
                <div class="profile-name">${name}</div>
                <div class="profile-email">${email}</div>
                
                <!-- Reputação -->
                <div class="reputation-card">
                    <div class="reputation-level" style="color: ${levelInfo.color}">
                        ${levelInfo.icon} ${levelInfo.name}
                    </div>
                    <div class="reputation-score">${reputation.score} pontos</div>
                    <div class="reputation-bar">
                        <div class="reputation-fill" style="width: ${Math.min(reputation.score, 100)}%; background: ${levelInfo.color}"></div>
                    </div>
                    <div class="reputation-next">
                        ${reputation.score < 100 
                            ? `${levelInfo.next - reputation.score} pts para o próximo nível`
                            : 'Nível máximo!'
                        }
                    </div>
                </div>
                
                ${!isComplete ? `
                    <div class="profile-incomplete-alert">
                        ⚠️ Complete seu perfil para fazer pedidos
                    </div>
                ` : ''}
            </div>
            
            <!-- Formulário de Perfil -->
            <div class="profile-form card">
                <div class="card-title">📝 Dados pessoais</div>
                
                <div class="input-group">
                    <label>Nome completo <span class="required">*</span></label>
                    <input type="text" class="input" id="profileNameInput" 
                           value="${name}" placeholder="Seu nome completo">
                </div>
                
                <div class="input-group">
                    <label>Telefone <span class="required">*</span></label>
                    <input type="tel" class="input" id="profilePhoneInput" 
                           value="${phone}" placeholder="(00) 00000-0000"
                           oninput="ProfileModule.formatPhone(this)">
                </div>
                
                <div class="input-group">
                    <label>CPF <span class="optional">(+15 pts)</span></label>
                    <input type="text" class="input" id="profileCpfInput" 
                           value="${cpf}" placeholder="000.000.000-00"
                           oninput="ProfileModule.formatCpf(this)">
                </div>
                
                <button class="btn btn-primary" onclick="ProfileModule.handleSave()">
                    Salvar alterações
                </button>
            </div>
            
            <!-- Menu -->
            <div class="profile-menu">
                <div class="profile-menu-item" onclick="showPage('addresses')">
                    <div class="profile-menu-icon">📍</div>
                    <div class="profile-menu-text">
                        Meus endereços
                        ${addresses.length === 0 ? '<span class="menu-badge required">Obrigatório</span>' : `<span class="menu-count">${addresses.length}</span>`}
                    </div>
                    <div class="profile-menu-arrow">›</div>
                </div>
                
                <div class="profile-menu-item" onclick="showPage('orders')">
                    <div class="profile-menu-icon">📦</div>
                    <div class="profile-menu-text">
                        Histórico de pedidos
                        <span class="menu-count">${completedOrders} entregues</span>
                    </div>
                    <div class="profile-menu-arrow">›</div>
                </div>
                
                <div class="profile-menu-item" onclick="handleLogout()">
                    <div class="profile-menu-icon">🚪</div>
                    <div class="profile-menu-text" style="color: var(--text-muted);">Sair da conta</div>
                    <div class="profile-menu-arrow">›</div>
                </div>
            </div>
            
            <!-- Stats -->
            <div class="profile-stats">
                <div class="stat-item">
                    <div class="stat-value">${orders.length}</div>
                    <div class="stat-label">Pedidos</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${completedOrders}</div>
                    <div class="stat-label">Entregues</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${addresses.length}</div>
                    <div class="stat-label">Endereços</div>
                </div>
            </div>
        `;
    },
    
    // ==================== HANDLERS ====================
    
    async handleSave() {
        const name = document.getElementById('profileNameInput')?.value?.trim();
        const phone = document.getElementById('profilePhoneInput')?.value?.trim();
        const cpf = document.getElementById('profileCpfInput')?.value?.trim();
        
        if (!name) {
            showToast('Digite seu nome');
            return;
        }
        
        if (!phone || phone.length < 14) {
            showToast('Digite um telefone válido');
            return;
        }
        
        // Valida CPF se preenchido
        if (cpf && !this.validateCpf(cpf)) {
            showToast('CPF inválido');
            return;
        }
        
        const data = { name, phone };
        if (cpf) data.cpf = cpf;
        
        const success = await this.saveProfile(data);
        
        if (success) {
            // Atualiza displayName no Firebase Auth
            await currentUser.updateProfile({ displayName: name });
            showToast('Perfil salvo!');
            this.render();
        } else {
            showToast('Erro ao salvar');
        }
    },
    
    // ==================== FORMATTERS ====================
    
    formatPhone(input) {
        let value = input.value.replace(/\D/g, '');
        if (value.length > 11) value = value.slice(0, 11);
        
        if (value.length > 6) {
            value = `(${value.slice(0,2)}) ${value.slice(2,7)}-${value.slice(7)}`;
        } else if (value.length > 2) {
            value = `(${value.slice(0,2)}) ${value.slice(2)}`;
        } else if (value.length > 0) {
            value = `(${value}`;
        }
        
        input.value = value;
    },
    
    formatCpf(input) {
        let value = input.value.replace(/\D/g, '');
        if (value.length > 11) value = value.slice(0, 11);
        
        if (value.length > 9) {
            value = `${value.slice(0,3)}.${value.slice(3,6)}.${value.slice(6,9)}-${value.slice(9)}`;
        } else if (value.length > 6) {
            value = `${value.slice(0,3)}.${value.slice(3,6)}.${value.slice(6)}`;
        } else if (value.length > 3) {
            value = `${value.slice(0,3)}.${value.slice(3)}`;
        }
        
        input.value = value;
    },
    
    validateCpf(cpf) {
        cpf = cpf.replace(/\D/g, '');
        if (cpf.length !== 11) return false;
        if (/^(\d)\1+$/.test(cpf)) return false;
        
        let sum = 0;
        for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
        let digit = (sum * 10) % 11;
        if (digit === 10) digit = 0;
        if (digit !== parseInt(cpf[9])) return false;
        
        sum = 0;
        for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
        digit = (sum * 10) % 11;
        if (digit === 10) digit = 0;
        if (digit !== parseInt(cpf[10])) return false;
        
        return true;
    }
};

// Hook para validar antes do checkout
const originalShowCheckout = typeof showCheckout === 'function' ? showCheckout : null;

function showCheckout() {
    // Valida perfil antes de mostrar checkout
    const validation = ProfileModule.canCheckout();
    
    if (!validation.ok) {
        showToast(validation.message);
        
        // Redireciona para perfil se falta dados pessoais
        if (validation.missing.includes('Nome') || validation.missing.includes('Telefone')) {
            showPage('profile');
            return;
        }
        
        // Redireciona para endereços se falta endereço
        if (validation.missing.includes('Endereço')) {
            showPage('addresses');
            return;
        }
        
        return;
    }
    
    // Chama função original se existir, senão executa lógica padrão
    if (originalShowCheckout) {
        originalShowCheckout();
    } else {
        // Lógica padrão de checkout
        if (cart.length === 0) {
            showToast('Carrinho vazio!');
            return;
        }
        
        const store = stores.find(s => s.id === cart[0].storeId);
        if (store && store.open === false) {
            showToast('Esta loja fechou. Tente novamente mais tarde.');
            return;
        }
        
        appliedCoupon = null;
        deliveryMode = 'delivery';
        selectedPayment = 'pix';
        
        document.getElementById('couponInput').value = '';
        document.getElementById('couponStatus').textContent = '';
        document.getElementById('modeDelivery').classList.add('selected');
        document.getElementById('modePickup').classList.remove('selected');
        document.getElementById('addressSection').style.display = 'block';
        document.getElementById('checkoutDeliveryRow').style.display = 'flex';
        
        document.querySelectorAll('.payment-option').forEach(p => p.classList.remove('selected'));
        document.querySelector('.payment-option input[value="pix"]').checked = true;
        document.querySelector('.payment-option input[value="pix"]').closest('.payment-option').classList.add('selected');
        
        renderCheckoutAddresses();
        updateCheckoutSummary();
        openModal('checkoutModal');
    }
}
