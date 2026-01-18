
// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyAnIJRcUxN-0swpVnonPbJjTSK87o4CQ_g",
    authDomain: "pedrad-814d0.firebaseapp.com",
    projectId: "pedrad-814d0",
    storageBucket: "pedrad-814d0.firebasestorage.app",
    messagingSenderId: "293587190550",
    appId: "1:293587190550:web:80c9399f82847c80e20637"
};

firebase.initializeApp(firebaseConfig);


const auth = firebase.auth();
const db = firebase.firestore();

db.enablePersistence({ synchronizeTabs: true }).catch(err => console.log('Persistence:', err.code));

// State
let currentUser = null;
window.currentUser = null;
let cart = [];
let products = [];
let categories = [];
let addresses = [];
let orders = [];
let stores = [];
let deliveryFees = [];
let coupons = [];
let selectedStore = null;
let selectedProduct = null;
let selectedAddress = null;
let appliedCoupon = null;
let modalQty = 1;
let activeCategory = 'all';
let capturedLocation = null;
let selectedAddon = null;
let deliveryMode = 'delivery';
let selectedPayment = 'pix';

// ==================== AUTH ====================

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        await loadOrders(); 
        window.currentUser = user;
        await loadUserData();
        showMainApp();
        
 

        if (typeof StoresModule !== 'undefined') StoresModule.init();
        if (typeof ProfileModule !== 'undefined') ProfileModule.init();
        if (typeof NotificationsModule !== 'undefined') {
            NotificationsModule.init();
            NotificationsModule.checkAndShowReviewPrompt();
            NotificationsModule.updateNotificationBadge();
            NotificationsModule.setupOrderStatusListener();
        }
        if (typeof TrackingModule !== 'undefined') TrackingModule.init();
        
        if (typeof StoresModule !== 'undefined') StoresModule.render();
        if (typeof ProfileModule !== 'undefined') ProfileModule.render();
    } else {
        currentUser = null;
        window.currentUser = null;
        showAuthPage();
    }
});

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
        // Abre a tela/página de notificações e renderiza o histórico
window.openNotifications = function () {
  // se você tiver uma página "notifications"
  showPage('notifications');

  // renderiza dentro do container da página (ajuste o ID!)
  NotificationSync.renderHistory('notificationsList'); 
};

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

function showAuthPage() {
    const authPage = document.getElementById('authPage');
    const mainApp = document.getElementById('mainApp');
    if (authPage) authPage.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
}

function showMainApp() {
    const authPage = document.getElementById('authPage');
    const mainApp = document.getElementById('mainApp');
    if (authPage) authPage.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    
    if (tab === 'login') {
        document.querySelector('.auth-tab:first-child')?.classList.add('active');
        document.getElementById('loginForm')?.classList.add('active');
    } else {
        document.querySelector('.auth-tab:last-child')?.classList.add('active');
        document.getElementById('registerForm')?.classList.add('active');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;
    
    if (!email || !password) {
        showToast('Preencha email e senha');
        return;
    }
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showToast('Login realizado!');
    } catch (err) {
        showToast(getAuthError(err.code));
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName')?.value;
    const email = document.getElementById('registerEmail')?.value;
    const phone = document.getElementById('registerPhone')?.value;
    const password = document.getElementById('registerPassword')?.value;
    
    if (!name || !email || !password) {
        showToast('Preencha todos os campos');
        return;
    }
    
    try {
        const { user } = await auth.createUserWithEmailAndPassword(email, password);
        await user.updateProfile({ displayName: name });
        
        await db.collection('users').doc(user.uid).set({
            name,
            email,
            phone,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast('Conta criada!');
    } catch (err) {
        showToast(getAuthError(err.code));
    }
}

async function handleLogout() {
    if (confirm('Deseja sair?')) {
        await auth.signOut();
        cart = [];
    }
}

function getAuthError(code) {
    const msgs = {
        'auth/email-already-in-use': 'E-mail já cadastrado',
        'auth/invalid-email': 'E-mail inválido',
        'auth/weak-password': 'Senha muito fraca',
        'auth/user-not-found': 'Usuário não encontrado',
        'auth/wrong-password': 'Senha incorreta'
    };
    return msgs[code] || 'Erro ao autenticar';
}

// ==================== DATA LOADING ====================

async function loadUserData() {
    await Promise.all([
        loadDeliveryFees(),
        loadCoupons(),
        loadStores(),
        loadAddresses(),
        loadOrders(),
        loadCart()
    ]);
    
    populateNeighborhoodSelect();
    setupRealtimeListeners();
}

async function loadDeliveryFees() {
    try {
        const snapshot = await db.collection('deliveryFees').where('active', '==', true).get();
        deliveryFees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        deliveryFees.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (err) {
        console.error('Error loading fees:', err);
    }
}

function sanitizeAddons(addons) {
    if (!Array.isArray(addons)) return [];
    
    return addons
        .filter(a => a && typeof a === 'object')
        .map((a, index) => ({
            name: String(a.name || '').trim() || `Item ${index + 1}`,
            price: parseFloat(a.price) || 0,
            order: typeof a.order === 'number' ? a.order : index
        }))
        .filter(a => a.name && a.name !== `Item ${a.order + 1}`); // Remove items sem nome real
}


async function loadCoupons() {
    try {
        const snapshot = await db.collection('coupons').where('active', '==', true).get();
        coupons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
        console.error('Error loading coupons:', err);
    }
}

async function loadStores() {
    try {
        const snapshot = await db.collection('stores').get();
        stores = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(s => s.active !== false)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (err) {
        console.error('Error loading stores:', err);
    }
}

async function loadAddresses() {
    if (!currentUser) return;
    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('addresses').get();
        addresses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (addresses.length > 0 && !selectedAddress) {
            selectedAddress = addresses[0].id;
        }
    } catch (err) {
        console.error('Error loading addresses:', err);
    }
}


async function loadProducts(storeId) {
    try {
        const snapshot = await db.collection('products')
            .where('storeId', '==', storeId)
            .get();
        
        products = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(p => p.active !== false)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        const cats = new Set(products.map(p => p.category).filter(Boolean));
        categories = ['all', ...cats];
    } catch (err) {
        console.error('Error loading products:', err);
    }
}

function loadCart() {
    if (!currentUser) return;
    try {
        const saved = localStorage.getItem(`cart_${currentUser.uid}`);
        if (saved) {
            cart = JSON.parse(saved);
            updateCartBadge();
        }
    } catch (err) {
        cart = [];
    }
}

function saveCart() {
    if (!currentUser) return;
    localStorage.setItem(`cart_${currentUser.uid}`, JSON.stringify(cart));
    updateCartBadge();
}

// ==================== REALTIME ====================

function setupRealtimeListeners() {
    if (!currentUser) return;
    
    db.collection('orders')
        .where('userId', '==', currentUser.uid)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'modified') {
                    const order = { id: change.doc.id, ...change.doc.data() };
                    const idx = orders.findIndex(o => o.id === order.id);
                    if (idx !== -1) {
                        orders[idx] = order;
                        renderOrders();
                        showToast(`Pedido: ${getStatusLabel(order.status)}`);
                    }
                }
            });
        });
    
    db.collection('stores').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'modified') {
                const store = { id: change.doc.id, ...change.doc.data() };
                const idx = stores.findIndex(s => s.id === store.id);
                if (idx !== -1) {
                    stores[idx] = store;
                    if (typeof StoresModule !== 'undefined') StoresModule.render();
                    
                    if (selectedStore?.id === store.id) {
                        selectedStore = store;
                        const statusEl = document.getElementById('selectedStoreStatus');
                        if (statusEl) statusEl.textContent = store.open !== false ? '🟢 Aberto' : '🔴 Fechado';
                    }
                }
            }
        });
    });
}

// ==================== RENDER ====================

async function selectStore(storeId) {
    localStorage.setItem("currentStoreId", storeId); 
    selectedStore = stores.find(s => s.id === storeId);
    if (!selectedStore) return;
    
    if (selectedStore.open === false) {
        showToast('Esta loja está fechada');
        return;
    }
    
    const nameEl = document.getElementById('selectedStoreName');
    const statusEl = document.getElementById('selectedStoreStatus');
    if (nameEl) nameEl.textContent = selectedStore.name;
    if (statusEl) statusEl.textContent = '🟢 Aberto';
    
    await loadProducts(storeId);
    
    const storeSelection = document.getElementById('storeSelection');
    const storeMenu = document.getElementById('storeMenu');
    if (storeSelection) storeSelection.style.display = 'none';
    if (storeMenu) storeMenu.style.display = 'block';
    
    renderCategories();
    renderProducts();
}

function backToStores() {
    selectedStore = null;
    products = [];
    categories = ['all'];
    activeCategory = 'all';
    
    const storeSelection = document.getElementById('storeSelection');
    const storeMenu = document.getElementById('storeMenu');
    if (storeSelection) storeSelection.style.display = 'block';
    if (storeMenu) storeMenu.style.display = 'none';
}

function renderCategories() {
    const container = document.getElementById('categoriesContainer');
    if (!container) return;
    
    container.innerHTML = categories.map(cat => `
        <div class="category-chip ${activeCategory === cat ? 'active' : ''}" 
             onclick="filterByCategory('${cat}')">
            ${cat === 'all' ? '🍽️ Todos' : cat}
        </div>
    `).join('');
}







function filterByCategory(cat) {
    activeCategory = cat;
    renderCategories();
    renderProducts();
}

function filterProducts() {
    renderProducts();
}

function renderCart() {
    const container = document.getElementById('cartItems');
    const summary = document.getElementById('cartSummary');
    if (!container) return;
    
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🛒</div>
                <div class="empty-state-title">Carrinho vazio</div>
                <div class="empty-state-text">Adicione produtos para começar</div>
                <button class="btn btn-primary" onclick="showPage('home')">Ver lojas</button>
            </div>
        `;
        if (summary) summary.style.display = 'none';
        return;
    }
    
    container.innerHTML = `<div class="card">${cart.map((item, idx) => {
        const imgUrl = (item.imageUrl || '').trim();
        const hasImg = hasImageUrl(imgUrl);
        const addonTotal = (item.addons || []).reduce((s, a) => s + (a.price || 0), 0);
        const itemTotal = (item.price + addonTotal) * item.qty;
        
        return `
        <div class="cart-item">
            <div class="cart-item-img ${hasImg ? 'has-image' : ''}">
                ${hasImg 
                    ? `<img src="${imgUrl}" alt="${item.name}" onerror="this.remove();this.parentElement.classList.remove('has-image');this.parentElement.textContent='${item.emoji || '🍽️'}';">`
                    : (item.emoji || '🍽️')
                }
            </div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                ${item.addons?.length ? `<div class="cart-item-addons">${item.addons.map(a => `+ ${a.name}`).join(', ')}</div>` : ''}
                <div class="cart-item-price">${formatCurrency(itemTotal)}</div>
            </div>
            <div class="cart-item-controls">
                <button class="qty-btn" onclick="updateCartQty(${idx}, -1)">−</button>
                <span class="qty-value">${item.qty}</span>
                <button class="qty-btn" onclick="updateCartQty(${idx}, 1)">+</button>
            </div>
        </div>
        `;
    }).join('')}</div>`;
    
    updateCartSummary();
    if (summary) summary.style.display = 'block';
}

function renderAddons() {
    const container = document.getElementById('addonsList');
    if (productAddons.length === 0) {
        container.innerHTML = '<div class="addon-empty">Nenhum adicional cadastrado</div>';
        return;
    }
    
    // Sanitiza adicionais antes de renderizar
    productAddons = productAddons
        .filter(a => a && typeof a === 'object')
        .map((a, i) => ({
            name: String(a.name || '').trim(),
            price: parseFloat(a.price) || 0,
            order: typeof a.order === 'number' ? a.order : i
        }))
        .filter(a => a.name); // Remove vazios
    
    container.innerHTML = productAddons.map((addon, idx) => `
        <div class="addon-item" draggable="true" ondragstart="dragAddon(event, ${idx})" ondragover="event.preventDefault()" ondrop="dropAddon(event, ${idx})">
            <span class="addon-drag">⋮⋮</span>
            <input type="text" class="form-input addon-name" value="${addon.name}" onchange="updateAddon(${idx}, 'name', this.value)">
            <input type="number" class="form-input addon-price" value="${addon.price}" step="0.50" onchange="updateAddon(${idx}, 'price', parseFloat(this.value) || 0)">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeAddon(${idx})">×</button>
        </div>
    `).join('');
}

// Adicione esta função após o bloco de STATE (antes de AUTH)
function hasImageUrl(url) {
    if (typeof url !== "string") return false;
    const u = url.trim();
    if (u.startsWith('data:image/')) return true;
    if (!/^https?:\/\//i.test(u)) return false;
    if (u.length < 10) return false;
    if (u.includes(" ")) return false;
    return true;
}
function updateCartSummary() {
    const subtotal = getCartSubtotal();
    const delivery = getSelectedDeliveryFee();
    const discount = calculateDiscount(subtotal);
    const total = subtotal - discount + delivery;
    
    const subtotalEl = document.getElementById('cartSubtotal');
    const deliveryEl = document.getElementById('cartDelivery');
    const totalEl = document.getElementById('cartTotal');
    const discountEl = document.getElementById('cartDiscount');
    const discountRow = document.getElementById('cartDiscountRow');
    
    if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
    if (deliveryEl) deliveryEl.textContent = formatCurrency(delivery);
    if (totalEl) totalEl.textContent = formatCurrency(total);
    
    if (discountRow) {
        if (discount > 0) {
            if (discountEl) discountEl.textContent = `- ${formatCurrency(discount)}`;
            discountRow.style.display = 'flex';
        } else {
            discountRow.style.display = 'none';
        }
    }
}



function renderCheckoutAddresses() {
    const container = document.getElementById('checkoutAddresses');
    if (!container) return;
    
    if (addresses.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); margin-bottom: 12px;">Nenhum endereço cadastrado</p>';
        return;
    }
    
    container.innerHTML = addresses.map(addr => {
        const fee = getDeliveryFeeByNeighborhood(addr.neighborhood);
        return `
            <div class="address-card ${selectedAddress === addr.id ? 'selected' : ''}" 
                 onclick="selectAddress('${addr.id}')">
                <div class="address-icon">📍</div>
                <div class="address-info">
                    <div class="address-label">${addr.label}</div>
                    <div class="address-text">${addr.street}, ${addr.number} - ${addr.neighborhood}</div>
                    <div class="address-fee">Taxa: ${formatCurrency(fee)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function populateNeighborhoodSelect() {
    const select = document.getElementById('addressNeighborhood');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione o bairro</option>' +
        deliveryFees.map(f => `<option value="${f.name}">${f.name} - ${formatCurrency(f.fee)}</option>`).join('');
}

// ==================== CART ====================

function addToCart(product, qty = 1, addons = []) {
  if (!selectedStore) return;

  // trava por loja
  if (cart.length > 0 && cart[0].storeId !== selectedStore.id) {
    showToast(`Finalize o pedido de ${cart[0].storeName} primeiro!`);
    return;
  }

  // addons normalizados
  const safeAddons = Array.isArray(addons) ? addons.map(a => ({
    name: String(a.name || "").trim(),
    price: Number(a.price || 0)
  })).filter(a => a.name) : [];

  // chave única = produto + addons (ordem não importa)
  const addonKey = safeAddons.length
    ? safeAddons.map(a => a.name).sort().join("|")
    : "none";

  const itemKey = `${product.id}__${addonKey}`;

  const existing = cart.find(i => i.itemKey === itemKey);

  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      itemKey,
      id: product.id,
      name: product.name,
      price: Number(product.price || 0),
      emoji: product.emoji,
      imageUrl: product.imageUrl || null,
      storeId: selectedStore.id,
      storeName: selectedStore.name,
      qty: Number(qty || 1),
      addons: safeAddons
    });
  }

  saveCart();
  renderCart();
  showToast(`✅ ${product.name} adicionado!`);
}

function updateCartQty(index, delta) {
    cart[index].qty += delta;
    
    if (cart[index].qty <= 0) {
        cart.splice(index, 1);
    }
    
    saveCart();
    renderCart();
}

function updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    const total = cart.reduce((sum, item) => sum + item.qty, 0);
    badge.textContent = total > 0 ? total : '';
}

function getCartSubtotal() {
    return cart.reduce((sum, item) => {
        const addons = sanitizeAddons(item.addons || []);
        const addonTotal = addons.reduce((s, a) => s + (a.price || 0), 0);
        return sum + ((item.price + addonTotal) * item.qty);
    }, 0);
}
// ==================== DELIVERY FEE ====================

function getDeliveryFeeByNeighborhood(neighborhood) {
    if (!neighborhood) return 0;
    const fee = deliveryFees.find(f => (f.name || '').toLowerCase() === neighborhood.toLowerCase());
    return fee?.fee || 0;
}

function getSelectedDeliveryFee() {
    if (deliveryMode === 'pickup') return 0;
    const addr = addresses.find(a => a.id === selectedAddress);
    return addr ? getDeliveryFeeByNeighborhood(addr.neighborhood) : 0;
}

// ==================== DELIVERY MODE & PAYMENT ====================

function setDeliveryMode(mode) {
    deliveryMode = mode;
    const modeDelivery = document.getElementById('modeDelivery');
    const modePickup = document.getElementById('modePickup');
    const addressSection = document.getElementById('addressSection');
    const deliveryRow = document.getElementById('checkoutDeliveryRow');
    
    if (modeDelivery) modeDelivery.classList.toggle('selected', mode === 'delivery');
    if (modePickup) modePickup.classList.toggle('selected', mode === 'pickup');
    if (addressSection) addressSection.style.display = mode === 'delivery' ? 'block' : 'none';
    if (deliveryRow) deliveryRow.style.display = mode === 'delivery' ? 'flex' : 'none';
    updateCheckoutSummary();
}

function selectPayment(el) {
    selectedPayment = el.value;
    document.querySelectorAll('.payment-option').forEach(p => p.classList.remove('selected'));
    el.closest('.payment-option')?.classList.add('selected');
}

// ==================== COUPON ====================

function applyCoupon() {
    const input = document.getElementById('couponInput');
    const status = document.getElementById('couponStatus');
    const code = input?.value?.trim().toUpperCase() || '';
    
    if (!code) {
        if (status) {
            status.textContent = '';
            status.className = 'coupon-status';
        }
        appliedCoupon = null;
        updateCheckoutSummary();
        return;
    }
    
    const coupon = coupons.find(c => (c.code || '').toUpperCase() === code);
    
    if (!coupon) {
        if (status) {
            status.textContent = '❌ Cupom inválido';
            status.className = 'coupon-status error';
        }
        appliedCoupon = null;
    } else if (coupon.minValue && getCartSubtotal() < coupon.minValue) {
        if (status) {
            status.textContent = `❌ Mínimo ${formatCurrency(coupon.minValue)}`;
            status.className = 'coupon-status error';
        }
        appliedCoupon = null;
    } else {
        appliedCoupon = coupon;
        const discountText = coupon.type === 'percent' 
            ? `${coupon.value}% de desconto`
            : `${formatCurrency(coupon.value)} de desconto`;
        if (status) {
            status.textContent = `✅ ${discountText} aplicado!`;
            status.className = 'coupon-status success';
        }
    }
    
    updateCheckoutSummary();
}

function calculateDiscount(subtotal) {
    if (!appliedCoupon) return 0;
    
    if (appliedCoupon.type === 'percent') {
        return Math.min(subtotal * (appliedCoupon.value / 100), subtotal);
    } else {
        return Math.min(appliedCoupon.value, subtotal);
    }
}

// ==================== CHECKOUT ====================

function showCheckout() {
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
    
    const couponInput = document.getElementById('couponInput');
    const couponStatus = document.getElementById('couponStatus');
    const modeDelivery = document.getElementById('modeDelivery');
    const modePickup = document.getElementById('modePickup');
    const addressSection = document.getElementById('addressSection');
    const deliveryRow = document.getElementById('checkoutDeliveryRow');
    
    if (couponInput) couponInput.value = '';
    if (couponStatus) couponStatus.textContent = '';
    if (modeDelivery) modeDelivery.classList.add('selected');
    if (modePickup) modePickup.classList.remove('selected');
    if (addressSection) addressSection.style.display = 'block';
    if (deliveryRow) deliveryRow.style.display = 'flex';
    
    document.querySelectorAll('.payment-option').forEach(p => p.classList.remove('selected'));
    const pixOption = document.querySelector('.payment-option input[value="pix"]');
    if (pixOption) {
        pixOption.checked = true;
        pixOption.closest('.payment-option')?.classList.add('selected');
    }
    
    renderCheckoutAddresses();
    updateCheckoutSummary();
    openModal('checkoutModal');
}

function selectAddress(id) {
    selectedAddress = id;
    renderCheckoutAddresses();
    updateCheckoutSummary();
}

function updateCheckoutSummary() {
    const subtotal = getCartSubtotal();
    const delivery = getSelectedDeliveryFee();
    const discount = calculateDiscount(subtotal);
    const total = subtotal - discount + delivery;
    
    const addr = addresses.find(a => a.id === selectedAddress);
    
    const subtotalEl = document.getElementById('checkoutSubtotal');
    const deliveryEl = document.getElementById('checkoutDelivery');
    const neighborhoodEl = document.getElementById('checkoutNeighborhood');
    const totalEl = document.getElementById('checkoutTotal');
    const discountEl = document.getElementById('checkoutDiscount');
    const discountRow = document.getElementById('checkoutDiscountRow');
    
    if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
    if (deliveryEl) deliveryEl.textContent = formatCurrency(delivery);
    if (neighborhoodEl) neighborhoodEl.textContent = deliveryMode === 'pickup' ? 'Retirada' : (addr?.neighborhood || '-');
    if (totalEl) totalEl.textContent = formatCurrency(total);
    
    if (discountRow) {
        if (discount > 0) {
            if (discountEl) discountEl.textContent = `- ${formatCurrency(discount)}`;
            discountRow.style.display = 'flex';
        } else {
            discountRow.style.display = 'none';
        }
    }
}

async function submitOrder() {
    if (deliveryMode === 'delivery' && !selectedAddress) {
        showToast('Selecione um endereço!');
        return;
    }
    
    const storeId = cart[0]?.storeId;
    if (!storeId) {
        showToast('Carrinho vazio!');
        return;
    }
    
    const store = stores.find(s => s.id === storeId);
    if (!store) {
        showToast('Loja não encontrada! Limpe o carrinho.');
        cart = [];
        saveCart();
        closeModal('checkoutModal');
        return;
    }
    
    if (store.open === false) {
        showToast('Esta loja está fechada!');
        return;
    }
    
    const address = deliveryMode === 'delivery' ? addresses.find(a => a.id === selectedAddress) : null;
    const subtotal = getCartSubtotal();
    const delivery = deliveryMode === 'delivery' ? getDeliveryFeeByNeighborhood(address?.neighborhood) : 0;
    const discount = calculateDiscount(subtotal);
    const total = subtotal - discount + delivery;
    
    const order = {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Cliente',
        userEmail: currentUser.email,
        storeId: store.id,
        storeName: store.name,
        items: cart.map(item => {
            // VALIDAÇÃO CRÍTICA: Sanitiza adicionais antes de salvar no pedido
            const addons = sanitizeAddons(item.addons || []);
            return {
                id: item.id,
                name: item.name,
                price: item.price,
                qty: item.qty,
                addons: addons
            };
        }),
        subtotal,
        delivery,
        discount,
        total,
        couponCode: appliedCoupon?.code || null,
        deliveryMode,
        address: deliveryMode === 'delivery' ? {
            label: address.label,
            street: address.street,
            number: address.number,
            complement: address.complement || '',
            neighborhood: address.neighborhood,
            reference: address.reference || '',
            location: address.location || null
        } : null,
        status: 'pending',
        paymentMethod: selectedPayment,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        timeline: [{ status: 'pending', timestamp: new Date().toISOString(), message: 'Pedido recebido' }]
    };
    
    try {
await db.collection('orders').add(order);

cart = [];
appliedCoupon = null;
saveCart();        // ✅ salva cart_${uid}
renderCart();      // ✅ atualiza tela
updateCartBadge(); // ✅ zera badge

closeModal('checkoutModal');
showPage('orders');
showToast('Pedido realizado!');

        

    } catch (err) {
        console.error('Order error:', err);
        showToast('Erro ao fazer pedido');
    }
}
function cartKey(storeId){
  return `LS_CART_${storeId || localStorage.getItem("currentStoreId") || "global"}`;
}

function loadCartFromStorage(){
  const storeId = localStorage.getItem("currentStoreId") || "global";
  try{
    window.cart = JSON.parse(localStorage.getItem(cartKey(storeId)) || "[]");
  }catch{
    window.cart = [];
  }
}

function saveCartToStorage(){
  const storeId = localStorage.getItem("currentStoreId") || "global";
  localStorage.setItem(cartKey(storeId), JSON.stringify(window.cart || []));
}

// ==================== ADDRESS ====================

function renderAddressesList() {
    const container = document.getElementById('addressesList');
    if (!container) return;
    
    if (addresses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📍</div>
                <div class="empty-state-title">Nenhum endereço cadastrado</div>
                <div class="empty-state-text">Adicione um endereço para fazer pedidos</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = addresses.map(addr => {
        const fee = getDeliveryFeeByNeighborhood(addr.neighborhood);
        return `
            <div class="address-card" style="cursor: default;">
                <div class="address-icon">📍</div>
                <div class="address-info" style="flex: 1;">
                    <div class="address-label">${addr.label}</div>
                    <div class="address-text">${addr.street}, ${addr.number}</div>
                    <div class="address-text">${addr.neighborhood}</div>
                    ${addr.reference ? `<div class="address-text" style="font-size: 0.8rem;">Ref: ${addr.reference}</div>` : ''}
                    <div class="address-fee">Taxa: ${formatCurrency(fee)}</div>
                    ${addr.location ? '<div style="font-size: 0.75rem; color: var(--success); margin-top: 4px;">📍 Localização salva</div>' : ''}
                </div>
                <button class="btn btn-secondary btn-sm" onclick="deleteAddress('${addr.id}')" style="padding: 8px; min-width: auto;">🗑️</button>
            </div>
        `;
    }).join('');
}

async function deleteAddress(addressId) {
    if (!confirm('Excluir este endereço?')) return;
    if (!currentUser) return;
    
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('addresses').doc(addressId).delete();
        
        addresses = addresses.filter(a => a.id !== addressId);
        
        if (selectedAddress === addressId) {
            selectedAddress = addresses.length > 0 ? addresses[0].id : null;
        }
        
        renderAddressesList();
        showToast('Endereço excluído');
    } catch (err) {
        showToast('Erro ao excluir');
    }
}

function addAddon() {
    const nameInput = document.getElementById('newAddonName');
    const priceInput = document.getElementById('newAddonPrice');
    const name = (nameInput?.value || '').trim();
    const price = parseFloat(priceInput?.value) || 0;
    
    if (!name) { 
        showToast('Digite o nome do adicional'); 
        return; 
    }
    
    if (!nameInput || !priceInput) {
        console.error('Inputs de adicional não encontrados');
        return;
    }
    
    productAddons.push({ 
        name, 
        price, 
        order: productAddons.length 
    });
    
    nameInput.value = '';
    priceInput.value = '';
    renderAddons();
}

function updateAddon(idx, field, value) {
    if (!productAddons[idx]) return;
    
    if (field === 'name') {
        productAddons[idx][field] = String(value).trim();
    } else if (field === 'price') {
        productAddons[idx][field] = parseFloat(value) || 0;
    }
}

function removeAddon(idx) {
    productAddons.splice(idx, 1);
    productAddons.forEach((a, i) => a.order = i);
    renderAddons();
}

let draggedAddonIdx = null;
function dragAddon(e, idx) { draggedAddonIdx = idx; }
function dropAddon(e, targetIdx) {
    e.preventDefault();
    if (draggedAddonIdx === null || draggedAddonIdx === targetIdx) return;
    const [item] = productAddons.splice(draggedAddonIdx, 1);
    productAddons.splice(targetIdx, 0, item);
    productAddons.forEach((a, i) => a.order = i);
    renderAddons();
    draggedAddonIdx = null;
}

function showAddAddressModal() {
    const fields = ['addressLabel', 'addressStreet', 'addressNumber', 'addressComplement', 'addressNeighborhood', 'addressReference'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    capturedLocation = null;
    const status = document.getElementById('addressLocationStatus');
    if (status) {
        status.innerHTML = `<span class="location-icon">📍</span><span>Localização não capturada</span>`;
        status.className = 'location-status';
    }
    
    openModal('addressModal');
}

function captureAddressLocation() {
    const status = document.getElementById('addressLocationStatus');
    
    if (!navigator.geolocation) {
        if (status) {
            status.innerHTML = '<span class="location-icon">❌</span><span>GPS não disponível</span>';
            status.className = 'location-status error';
        }
        return;
    }
    
    if (status) status.innerHTML = '<span class="location-icon">⏳</span><span>Obtendo localização...</span>';
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            capturedLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            if (status) {
                status.innerHTML = `<span class="location-icon">✅</span><span>Localização capturada!</span>`;
                status.className = 'location-status success';
            }
        },
        (error) => {
            let msg = 'Erro ao obter localização';
            if (error.code === error.PERMISSION_DENIED) msg = 'Permissão negada';
            if (status) {
                status.innerHTML = `<span class="location-icon">❌</span><span>${msg}</span>`;
                status.className = 'location-status error';
            }
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

async function saveAddress(e) {
    e.preventDefault();
    if (!currentUser) return;
    
    const neighborhood = document.getElementById('addressNeighborhood')?.value;
    
    if (!neighborhood) {
        showToast('Selecione um bairro!');
        return;
    }
    
    const address = {
        label: document.getElementById('addressLabel')?.value || '',
        street: document.getElementById('addressStreet')?.value || '',
        number: document.getElementById('addressNumber')?.value || '',
        complement: document.getElementById('addressComplement')?.value || '',
        neighborhood: neighborhood,
        reference: document.getElementById('addressReference')?.value || '',
        location: capturedLocation
    };
    
    try {
        const docRef = await db.collection('users').doc(currentUser.uid)
            .collection('addresses').add(address);
        
        address.id = docRef.id;
        addresses.push(address);
        selectedAddress = address.id;
        
        closeModal('addressModal');
        renderCheckoutAddresses();
        renderAddressesList();
        updateCheckoutSummary();
        showToast('Endereço salvo!');
        
    } catch (err) {
        showToast('Erro ao salvar endereço');
    }
}

// ==================== MODAL ====================

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

function selectAddon(addon) {
    selectedAddon = addon;
    document.querySelectorAll('.addon-option').forEach(el => {
        el.classList.toggle('selected', el.querySelector('input')?.checked);
    });
    updateModalPrice();
}

function updateModalPrice() {
    if (!selectedProduct) return;
    const addonPrice = selectedAddon?.price || 0;
    const unitPrice = selectedProduct.price + addonPrice;
    const priceEl = document.getElementById('modalProductPrice');
    if (priceEl) priceEl.textContent = formatCurrency(unitPrice * modalQty);
}


function renderProductAddons(product) {
    const addons = product.addons || [];
    if (addons.length === 0) return '';
    
    const sorted = [...addons].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    return `
        <div class="addons-section">
            <div class="addons-header" onclick="toggleAddons()">
                <span class="addons-title">➕ Adicionais (${addons.length})</span>
                <span class="addons-toggle" id="addonsToggle">▼</span>
            </div>
            <div class="addons-options" id="addonsOptions" style="display:none;">
                <label class="addon-option selected">
                    <input type="radio" name="addon" value="" checked onchange="selectAddon(null)">
                    <span class="addon-label">
                        <span class="addon-name">Nenhum</span>
                        <span class="addon-price">-</span>
                    </span>
                </label>
                ${sorted.map(addon => `
                    <label class="addon-option">
                        <input type="radio" name="addon" value="${addon.name}" onchange="selectAddon({name:'${addon.name}',price:${addon.price}})">
                        <span class="addon-label">
                            <span class="addon-name">${addon.name}</span>
                            <span class="addon-price">+ ${formatCurrency(addon.price)}</span>
                        </span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

function toggleAddons() {
    const options = document.getElementById('addonsOptions');
    const toggle = document.getElementById('addonsToggle');
    if (options && toggle) {
        if (options.style.display === 'none') {
            options.style.display = 'block';
            toggle.textContent = '▲';
        } else {
            options.style.display = 'none';
            toggle.textContent = '▼';
        }
    }
}

function changeModalQty(delta) {
    modalQty = Math.max(1, modalQty + delta);
    const qtyEl = document.getElementById('modalQty');
    if (qtyEl) qtyEl.textContent = modalQty;
    updateModalPrice();
}

function addToCartFromModal() {
  if (!selectedProduct) return;

  const addons = selectedAddon ? [selectedAddon] : [];
  addToCart(selectedProduct, modalQty, addons);

  selectedAddon = null;
  modalQty = 1;
  closeModal('productModal');
}

function openOrderDetail(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const canTrack = typeof TrackingModule !== 'undefined' && TrackingModule.canTrack(order);
    const paymentLabels = {
        pix: 'PIX',
        credit: 'Cartão de Crédito',
        debit: 'Cartão de Débito',
        cash: 'Dinheiro',
        picpay: 'PicPay',
        alimentacao: 'Vale Alimentação'
    };
    
    const content = document.getElementById('orderDetailContent');
    if (!content) return;
    
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <div class="order-store" style="font-size: 1.2rem;">${order.storeName || 'Loja'}</div>
            <h3 style="margin-bottom: 4px;">Pedido #${order.id.slice(-6).toUpperCase()}</h3>
            <p style="color: var(--text-muted);">${formatDate(order.createdAt)}</p>
            <p style="color: var(--text-muted); font-size: 0.85rem;">
                ${order.deliveryMode === 'pickup' ? '🏪 Retirar na loja' : '🛵 Entrega'}
                • ${paymentLabels[order.paymentMethod] || order.paymentMethod || 'Dinheiro'}
            </p>
        </div>
        
        ${canTrack ? `
            <button class="order-track-btn" onclick="closeModal('orderModal'); TrackingModule.openTracking('${order.id}')" style="margin-bottom: 20px;">
                🗺️ Rastrear entrega em tempo real
            </button>
        ` : ''}
        
        <h4 style="margin-bottom: 12px;">📦 Itens</h4>
        <div class="card" style="margin-bottom: 20px;">
            ${(order.items || []).map(item => {
                // VALIDAÇÃO CRÍTICA: Sanitiza adicionais
                const addons = sanitizeAddons(item.addons || []);
                const addonTotal = addons.reduce((s, a) => s + (a.price || 0), 0);
                const itemTotal = (item.price + addonTotal) * item.qty;
                
                return `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
                    <div>
                        <span>${item.qty}x ${item.name}</span>
                        ${addons.length > 0 ? `<div style="font-size:0.8rem;color:var(--text-muted);">${addons.map(a => `+ ${a.name} (${formatCurrency(a.price)})`).join(', ')}</div>` : ''}
                    </div>
                    <span>${formatCurrency(itemTotal)}</span>
                </div>
            `;
            }).join('')}
        </div>
        
        ${order.deliveryMode !== 'pickup' && order.address ? `
            <h4 style="margin-bottom: 12px;">📍 Entrega</h4>
            <div class="card" style="margin-bottom: 20px;">
                <p><strong>${order.address.label}</strong></p>
                <p style="color: var(--text-muted);">${order.address.street}, ${order.address.number}</p>
                <p style="color: var(--text-muted);">${order.address.neighborhood}</p>
                ${order.address.reference ? `<p style="color: var(--text-muted);">Ref: ${order.address.reference}</p>` : ''}
            </div>
        ` : `
            <h4 style="margin-bottom: 12px;">🏪 Retirada na Loja</h4>
            <div class="card" style="margin-bottom: 20px;">
                <p style="color: var(--text-muted);">Retire seu pedido em ${order.storeName}</p>
            </div>
        `}
        
        <h4 style="margin-bottom: 12px;">📋 Status</h4>
        <div class="timeline">
            ${(order.timeline || []).map((t, idx, arr) => `
                <div class="timeline-item">
                    <div class="timeline-dot ${idx === arr.length - 1 ? 'active' : ''}">✓</div>
                    <div class="timeline-content">
                        <div class="timeline-title">${getStatusLabel(t.status)}</div>
                        <div class="timeline-time">${new Date(t.timestamp).toLocaleString('pt-BR')}</div>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="card" style="margin-top: 20px;">
            <div class="summary-row">
                <span>Subtotal</span>
                <span>${formatCurrency(order.subtotal)}</span>
            </div>
            ${order.discount > 0 ? `
                <div class="summary-row" style="color: var(--success);">
                    <span>Desconto</span>
                    <span>- ${formatCurrency(order.discount)}</span>
                </div>
            ` : ''}
            ${order.deliveryMode !== 'pickup' ? `
                <div class="summary-row">
                    <span>Entrega</span>
                    <span>${formatCurrency(order.delivery)}</span>
                </div>
            ` : ''}
            <div class="summary-row total">
                <span>Total</span>
                <span>${formatCurrency(order.total)}</span>
            </div>
        </div>
        
        ${order.status === 'delivered' && !order.reviewed ? `
            <button class="btn btn-primary" onclick="closeModal('orderModal'); NotificationsModule.openReviewModal('${order.id}')" style="margin-top: 16px;">
                ⭐ Avaliar pedido
            </button>
        ` : ''}
    `;
    
    openModal('orderModal');
}

// ==================== NAVIGATION ====================

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const pageEl = document.getElementById(`${page}Page`);
    if (pageEl) pageEl.classList.add('active');
    
    const navIndex = { home: 0, orders: 1, profile: 2, cart: 0, addresses: 2, tracking: 1 };
    document.querySelectorAll('.nav-item')[navIndex[page]]?.classList.add('active');
    
    if (page === 'cart') renderCart();
    if (page === 'orders') {
        renderOrders();
        loadOrders();
    }
    if (page === 'addresses') renderAddressesList();
    if (page === 'profile' && typeof ProfileModule !== 'undefined') ProfileModule.render();
    if (page === 'home' && typeof NotificationsModule !== 'undefined') NotificationsModule.checkAndShowReviewPrompt();
}
// ==================== UTILITIES ====================

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function getStatusLabel(status) {
    const labels = {
        pending: 'Pendente',
        confirmed: 'Confirmado',
        preparing: 'Preparando',
        ready: 'Pronto',
        delivering: 'Em entrega',
        delivered: 'Entregue',
        cancelled: 'Cancelado'
    };
    return labels[status] || status;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}


function renderProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    const searchInput = document.getElementById('searchInput');
    const search = (searchInput?.value || '').toLowerCase().trim();

    // Valida URL de imagem
    function isValidImageUrl(url) {
        if (typeof url !== "string") return false;
        const u = url.trim();
        if (!/^https?:\/\//i.test(u)) return false;
        if (u.length < 10) return false;
        if (u.includes(" ")) return false;
        return true;
    }

    let filtered = Array.isArray(products) ? products : [];

    // Filtro categoria
    if (activeCategory && activeCategory !== 'all') {
        filtered = filtered.filter(p => (p.category || '') === activeCategory);
    }

    // Filtro busca
    if (search) {
        filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(search) ||
            (p.description || '').toLowerCase().includes(search)
        );
    }

    // Vazio
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-state-icon">🔍</div>
                <div class="empty-state-title">Nenhum produto encontrado</div>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(p => {
        const imgUrl = (p.imageUrl || '').trim();
        const hasImg = isValidImageUrl(imgUrl);
        const fallbackEmoji = (p.emoji || '🍽️');

        return `
            <div class="product-card" onclick="openProductModal('${p.id}')">
                <div class="product-img ${hasImg ? 'has-image' : ''}">
                    ${hasImg 
                        ? `<img src="${imgUrl}" loading="lazy" alt="${p.name || 'Produto'}" onerror="this.remove();this.parentElement.classList.remove('has-image');this.parentElement.innerHTML='${fallbackEmoji}';">`
                        : fallbackEmoji
                    }
                </div>
                <div class="product-info">
                    <div class="product-name">${p.name || 'Produto'}</div>
                    <div class="product-desc">${p.description || ''}</div>
                    <div class="product-price">${formatCurrency(p.price || 0)}</div>
                </div>
            </div>
        `;
    }).join('');
}


// ==================== MAP PICKER ====================

function openMapPicker() {
    const modal = document.createElement('div');
    modal.id = 'mapPickerModal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="height:90vh;max-height:90vh;display:flex;flex-direction:column;">
            <div class="modal-header">
                <div class="modal-title">📍 Toque no mapa para marcar</div>
                <button class="modal-close" onclick="closeMapPicker()">×</button>
            </div>
            <div id="pickerMap" style="flex:1;min-height:300px;"></div>
            <div style="padding:16px;">
                <div id="pickerCoords" style="text-align:center;margin-bottom:12px;color:var(--text-muted);">Toque no mapa para selecionar</div>
                <button class="btn btn-primary" id="confirmLocationBtn" disabled onclick="confirmPickedLocation()">Confirmar localização</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    setTimeout(() => {
        const map = L.map('pickerMap').setView([-15.8267, -47.9218], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        
        let marker = null;
        window._pickedLocation = null;

        navigator.geolocation?.getCurrentPosition(pos => {
            map.setView([pos.coords.latitude, pos.coords.longitude], 16);
        });

        map.on('click', e => {
            if (marker) map.removeLayer(marker);
            marker = L.marker(e.latlng).addTo(map);
            window._pickedLocation = { lat: e.latlng.lat, lng: e.latlng.lng };
            const coordsEl = document.getElementById('pickerCoords');
            const confirmBtn = document.getElementById('confirmLocationBtn');
            if (coordsEl) coordsEl.textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
            if (confirmBtn) confirmBtn.disabled = false;
        });
    }, 100);
}

function closeMapPicker() {
    document.getElementById('mapPickerModal')?.remove();
}

function confirmPickedLocation() {
    if (!window._pickedLocation) return;
    capturedLocation = { ...window._pickedLocation, accuracy: 0, manual: true };
    const status = document.getElementById('addressLocationStatus');
    if (status) {
        status.innerHTML = `<span class="location-icon">✅</span><span>Localização selecionada no mapa</span>`;
        status.className = 'location-status success';
    }
    closeMapPicker();
    showToast('Localização definida!');
}

// ==================== INIT ====================

window.addEventListener('online', () => {
    const banner = document.getElementById('offlineBanner');
    if (banner) banner.classList.remove('show');
});

window.addEventListener('offline', () => {
    const banner = document.getElementById('offlineBanner');
    if (banner) banner.classList.add('show');
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});
window.openNotifications = function () {
  showPage('notifications');
  NotificationSync.renderHistory('notificationsList');
  if (typeof NotificationsModule !== 'undefined') NotificationsModule.updateNotificationBadge?.();
};
// === FIX PERMANENTE: BOTÃO DE AVALIAÇÕES ===
(function setupReviewButton() {
    console.log('🔧 Configurando botão de avaliações...');
    
    // Função para criar/injetar o botão
    function injectReviewButton() {
        const menu = document.querySelector('#profilePage .profile-menu');
        if (!menu) {
            console.log('⚠️ Menu não encontrado ainda');
            return false;
        }
        
        // Verifica se já existe
        const hasButton = Array.from(menu.children).some(el => 
            el.textContent.includes('Avaliações')
        );
        
        if (hasButton) {
            console.log('✅ Botão já existe');
            return true;
        }
        
        // Cria o botão
        const btn = document.createElement('div');
        btn.className = 'profile-menu-item review-button-injected';
        btn.style.cssText = 'display:flex !important;align-items:center;gap:12px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;cursor:pointer;margin-bottom:12px;opacity:1 !important;visibility:visible !important;';
        
        btn.innerHTML = `
            <div style="font-size:1.3rem;width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border-radius:10px;">⭐</div>
            <div style="flex:1;">
                <div style="font-weight:600;font-size:0.95rem;margin-bottom:2px;">Avaliações Pendentes</div>
                <div style="font-size:0.75rem;color:var(--text-muted);">Avalie seus pedidos entregues</div>
            </div>
            <div id="pendingReviewsBadge" style="min-width:24px;height:24px;background:var(--primary);color:#000;border-radius:12px;font-size:0.75rem;font-weight:600;display:none;align-items:center;justify-content:center;padding:0 8px;"></div>
            <div style="font-size:1.2rem;color:var(--text-muted);">›</div>
        `;
        
        btn.onclick = function() {
            window.location.href = 'pending-reviews.html';
        };
        
        // Insere no topo do menu
        menu.insertBefore(btn, menu.firstChild);
        console.log('✅ Botão de avaliações injetado!');
        
        // Atualiza badge se função existir
        if (typeof updatePendingReviewsBadge === 'function') {
            setTimeout(updatePendingReviewsBadge, 500);
        }
        
        return true;
    }
    
    // Intercepta showPage
    const _originalShowPage = window.showPage;
    
    window.showPage = function(page) {
        // Chama original primeiro
        if (_originalShowPage) {
            _originalShowPage(page);
        }
        
        // Se for perfil, injeta botão
        if (page === 'profile') {
            console.log('📱 Abrindo perfil, injetando botão...');
            
            // Tenta injetar imediatamente
            setTimeout(() => {
                const success = injectReviewButton();
                
                // Se falhou, tenta mais vezes
                if (!success) {
                    let attempts = 0;
                    const retry = setInterval(() => {
                        attempts++;
                        if (injectReviewButton() || attempts >= 5) {
                            clearInterval(retry);
                        }
                    }, 500);
                }
            }, 300);
        }
    };
    
    // Observer: detecta quando .profile-menu aparece no DOM
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    if (node.classList?.contains('profile-menu') || 
                        node.querySelector?.('.profile-menu')) {
                        console.log('🔍 Menu de perfil detectado pelo observer');
                        setTimeout(injectReviewButton, 200);
                    }
                }
            });
        });
    });
    
    // Observa mudanças no profilePage
    const profilePage = document.getElementById('profilePage');
    if (profilePage) {
        observer.observe(profilePage, {
            childList: true,
            subtree: true
        });
    }
    
    // Tenta injetar na carga inicial (caso já esteja no perfil)
    setTimeout(() => {
        const profilePage = document.getElementById('profilePage');
        if (profilePage?.classList.contains('active')) {
            injectReviewButton();
        }
    }, 1000);
    
    console.log('✅ Sistema de botão configurado');
})();

// Abre popup ao clicar "Finalizar"
function openCheckout() {
    localStorage.setItem('cart', JSON.stringify(cart));
    window.open('modules/checkout-modal.html');
}

// Renderiza adicionais no modal
function renderProductAddons(product) {
    // código em INTEGRACAO-PRONTA.js
}



// ==================== ADICIONE APÓS OUTRAS FUNÇÕES ====================

async function loadOrders() {
    if (!currentUser) return;
    
    try {
        const snapshot = await db.collection('orders')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
        // Sem índice - tenta sem orderBy
        const snapshot = await db.collection('orders')
            .where('userId', '==', currentUser.uid)
            .get();
        
        orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    renderOrders();
}

function renderOrders() {
    const container = document.getElementById('ordersList');
    if (!container) return;
    
    if (orders.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#888;">📭<br>Nenhum pedido ainda</div>';
        return;
    }
    
    container.innerHTML = orders.map(order => {
        const date = order.createdAt?.toDate?.() || new Date();
        const statuses = {
            pending: '🕐 Pendente', confirmed: '✅ Confirmado',
            preparing: '👨‍🍳 Preparando', ready: '📦 Pronto',
            delivering: '🛵 A caminho', delivered: '✅ Entregue',
            cancelled: '❌ Cancelado'
        };
        
        return `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;cursor:pointer;" onclick="openOrderDetail('${order.id}')">
                <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
                    <div>
                        <div style="font-weight:600;font-size:1.1rem;">#${order.id.slice(-6).toUpperCase()}</div>
                        <div style="color:var(--text-muted);font-size:0.85rem;">${date.toLocaleDateString('pt-BR')}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="padding:4px 12px;border-radius:20px;background:rgba(99,102,241,0.2);font-size:0.8rem;margin-bottom:8px;">${statuses[order.status]}</div>
                        <div style="font-weight:600;font-size:1.1rem;">${formatCurrency(order.total)}</div>
                    </div>
                </div>
                <div style="border-top:1px solid var(--border);padding-top:12px;">
                    ${(order.items || []).map(i => {
                        // VALIDAÇÃO CRÍTICA: Sanitiza adicionais
                        const addons = sanitizeAddons(i.addons || []);
                        const addonTotal = addons.reduce((s, a) => s + (a.price || 0), 0);
                        const itemTotal = (i.price + addonTotal) * i.qty;
                        
                        return `
                        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.9rem;">
                            <span>
                                ${i.qty}x ${i.name}
                                ${addons.length > 0 ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${addons.map(a => `+ ${a.name}`).join(', ')}</div>` : ''}
                            </span>
                            <span>${formatCurrency(itemTotal)}</span>
                        </div>
                    `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function openProductModal(productId){
  const storeId = localStorage.getItem("currentStoreId");
  if(!storeId) return showToast("Selecione uma loja!");

  document.getElementById("popupFrame").src =
    `popup.html?storeId=${encodeURIComponent(storeId)}&productId=${encodeURIComponent(productId)}`;

  document.getElementById("htmlPopup").style.display = "block";
}


function closeProductPopup(){
  document.getElementById("htmlPopup").style.display = "none";
  document.getElementById("popupFrame").src = "about:blank";
}

window.addEventListener("message", (e) => {
  if (!e.data) return;

  if (e.data.type === "closePopup") {
    closeProductPopup();
    return;
  }

  if (e.data.type === "ADD_TO_CART") {
    const payload = e.data.payload || {};
    const product = payload.product;

    if (!product || !product.id) {
      console.log("ADD_TO_CART inválido:", e.data);
      return showToast("Erro: produto inválido");
    }

    const qty = Number(payload.qty || 1);
    const addons = Array.isArray(payload.addons) ? payload.addons : [];

    cart.push({
      itemKey: `${product.id}-${Date.now()}`,
      id: product.id,
      name: product.name || "Produto",
      price: Number(product.price || 0),
      emoji: product.emoji || "🍽️",
      imageUrl: product.imageUrl || null,
      storeId: product.storeId || selectedStore?.id || localStorage.getItem("currentStoreId"),
      storeName: selectedStore?.name || "",
      qty,
      addons
    });

    saveCart();
    renderCart();
    updateCartBadge();
    closeProductPopup();
  }
});

