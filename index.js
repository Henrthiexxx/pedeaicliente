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

// ==================== AUTH ====================

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        await loadUserData();
        showMainApp();
        
        // Inicializa módulos
        StoresModule.init();
        ProfileModule.init();
        NotificationsModule.init();
        TrackingModule.init();
        
        // Renderiza com módulos
        StoresModule.render();
        ProfileModule.render();
        NotificationsModule.checkAndShowReviewPrompt();
        NotificationsModule.updateNotificationBadge();
        NotificationsModule.setupOrderStatusListener();
    } else {
        currentUser = null;
        showAuthPage();
    }
});

function showAuthPage() {
    document.getElementById('authPage').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    
    if (tab === 'login') {
        document.querySelector('.auth-tab:first-child').classList.add('active');
        document.getElementById('loginForm').classList.add('active');
    } else {
        document.querySelector('.auth-tab:last-child').classList.add('active');
        document.getElementById('registerForm').classList.add('active');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showToast('Login realizado!');
    } catch (err) {
        showToast(getAuthError(err.code));
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const phone = document.getElementById('registerPhone').value;
    const password = document.getElementById('registerPassword').value;
    
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
        deliveryFees.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
        console.error('Error loading fees:', err);
    }
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
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
        console.error('Error loading stores:', err);
    }
}

async function loadAddresses() {
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

async function loadOrders() {
    try {
        const snapshot = await db.collection('orders')
            .where('userId', '==', currentUser.uid)
            .get();
        
        orders = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt) || 0;
                const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt) || 0;
                return dateB - dateA;
            })
            .slice(0, 30);
        
        renderOrders();
    } catch (err) {
        console.error('Error loading orders:', err);
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
            .sort((a, b) => a.name.localeCompare(b.name));
        
        const cats = new Set(products.map(p => p.category).filter(Boolean));
        categories = ['all', ...cats];
    } catch (err) {
        console.error('Error loading products:', err);
    }
}

function loadCart() {
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
                    StoresModule.render();
                    
                    if (selectedStore?.id === store.id) {
                        selectedStore = store;
                        document.getElementById('selectedStoreStatus').textContent = 
                            store.open !== false ? '🟢 Aberto' : '🔴 Fechado';
                    }
                }
            }
        });
    });
}

// ==================== RENDER ====================

async function selectStore(storeId) {
    selectedStore = stores.find(s => s.id === storeId);
    if (!selectedStore) return;
    
    if (selectedStore.open === false) {
        showToast('Esta loja está fechada');
        return;
    }
    
    document.getElementById('selectedStoreName').textContent = selectedStore.name;
    document.getElementById('selectedStoreStatus').textContent = '🟢 Aberto';
    
    await loadProducts(storeId);
    
    document.getElementById('storeSelection').style.display = 'none';
    document.getElementById('storeMenu').style.display = 'block';
    
    renderCategories();
    renderProducts();
}

function backToStores() {
    selectedStore = null;
    products = [];
    categories = ['all'];
    activeCategory = 'all';
    
    document.getElementById('storeSelection').style.display = 'block';
    document.getElementById('storeMenu').style.display = 'none';
}

function renderCategories() {
    document.getElementById('categoriesContainer').innerHTML = categories.map(cat => `
        <div class="category-chip ${activeCategory === cat ? 'active' : ''}" 
             onclick="filterByCategory('${cat}')">
            ${cat === 'all' ? '🍽️ Todos' : cat}
        </div>
    `).join('');
}

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    const search = document.getElementById('searchInput').value.toLowerCase();
    
    let filtered = products;
    
    if (activeCategory !== 'all') {
        filtered = filtered.filter(p => p.category === activeCategory);
    }
    
    if (search) {
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(search) ||
            (p.description && p.description.toLowerCase().includes(search))
        );
    }
    
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
        const hasImage = p.imageUrl && p.imageUrl.startsWith('data:');
        return `
        <div class="product-card" onclick="openProductModal('${p.id}')">
            <div class="product-img ${hasImage ? 'has-image' : ''}" ${hasImage ? `style="background-image: url('${p.imageUrl}')"` : ''}>
                ${hasImage ? '' : (p.emoji || '🍽️')}
            </div>
            <div class="product-info">
                <div class="product-name">${p.name}</div>
                <div class="product-desc">${p.description || ''}</div>
                <div class="product-price">${formatCurrency(p.price)}</div>
            </div>
        </div>
    `;
    }).join('');
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
    
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🛒</div>
                <div class="empty-state-title">Carrinho vazio</div>
                <div class="empty-state-text">Adicione produtos para começar</div>
                <button class="btn btn-primary" onclick="showPage('home')">Ver lojas</button>
            </div>
        `;
        summary.style.display = 'none';
        return;
    }
    
    container.innerHTML = `<div class="card">${cart.map((item, idx) => {
        const hasImage = item.imageUrl && item.imageUrl.startsWith('data:');
        return `
        <div class="cart-item">
            <div class="cart-item-img ${hasImage ? 'has-image' : ''}" ${hasImage ? `style="background-image: url('${item.imageUrl}')"` : ''}>
                ${hasImage ? '' : (item.emoji || '🍽️')}
            </div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${formatCurrency(item.price * item.qty)}</div>
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
    summary.style.display = 'block';
}

function updateCartSummary() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const delivery = getSelectedDeliveryFee();
    const discount = calculateDiscount(subtotal);
    const total = subtotal - discount + delivery;
    
    document.getElementById('cartSubtotal').textContent = formatCurrency(subtotal);
    document.getElementById('cartDelivery').textContent = formatCurrency(delivery);
    document.getElementById('cartTotal').textContent = formatCurrency(total);
    
    const discountRow = document.getElementById('cartDiscountRow');
    if (discount > 0) {
        document.getElementById('cartDiscount').textContent = `- ${formatCurrency(discount)}`;
        discountRow.style.display = 'flex';
    } else {
        discountRow.style.display = 'none';
    }
}

function renderOrders() {
    const container = document.getElementById('ordersList');
    
    if (orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <div class="empty-state-title">Nenhum pedido ainda</div>
                <button class="btn btn-primary" onclick="showPage('home')">Fazer pedido</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => {
        const canTrack = TrackingModule.canTrack(order);
        return `
        <div class="order-card" onclick="openOrderDetail('${order.id}')">
            <div class="order-store">${order.storeName || 'Loja'}</div>
            <div class="order-header">
                <div>
                    <div class="order-id">Pedido #${order.id.slice(-6).toUpperCase()}</div>
                    <div class="order-date">${formatDate(order.createdAt)}</div>
                </div>
                <span class="order-status status-${order.status}">${getStatusLabel(order.status)}</span>
            </div>
            <div class="order-items">
                ${order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
            </div>
            <div class="order-total">
                <span>Total</span>
                <span>${formatCurrency(order.total)}</span>
            </div>
            ${canTrack ? `
                <button class="order-track-btn" onclick="event.stopPropagation(); TrackingModule.openTracking('${order.id}')">
                    🗺️ Rastrear entrega em tempo real
                </button>
            ` : ''}
        </div>
    `;
    }).join('');
}

function renderCheckoutAddresses() {
    const container = document.getElementById('checkoutAddresses');
    
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
    select.innerHTML = '<option value="">Selecione o bairro</option>' +
        deliveryFees.map(f => `<option value="${f.name}">${f.name} - ${formatCurrency(f.fee)}</option>`).join('');
}

// ==================== CART ====================

// Variável para guardar addon selecionado
let selectedAddon = null;
let deliveryMode = 'delivery'; // 'delivery' ou 'pickup'

function selectAddon(addon) {
    selectedAddon = addon;
    document.querySelectorAll('.addon-option').forEach(el => {
        el.classList.toggle('selected', el.querySelector('input').checked);
    });
    updateModalPrice();
}

function updateModalPrice() {
    if (!selectedProduct) return;
    const addonPrice = selectedAddon?.price || 0;
    const unitPrice = selectedProduct.price + addonPrice;
    document.getElementById('modalProductPrice').textContent = formatCurrency(unitPrice * modalQty);
}

function addToCart(product, qty = 1) {
    // Bloqueia mistura de lojas
    if (cart.length > 0 && cart[0].storeId !== selectedStore.id) {
        showToast(`Finalize o pedido de ${cart[0].storeName} primeiro!`);
        return;
    }
    
    // Cria identificador único incluindo addon
    const addonKey = selectedAddon ? `-${selectedAddon.name}` : '';
    const itemKey = `${product.id}${addonKey}`;
    
    const existing = cart.find(item => item.itemKey === itemKey);
    
    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({
            itemKey,
            id: product.id,
            name: product.name,
            price: product.price,
            emoji: product.emoji,
            imageUrl: product.imageUrl || null,
            storeId: selectedStore.id,
            storeName: selectedStore.name,
            qty,
            addons: selectedAddon ? [selectedAddon] : []
        });
    }
    
    selectedAddon = null;
    saveCart();
    showToast(`${product.name} adicionado!`);
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
    const total = cart.reduce((sum, item) => sum + item.qty, 0);
    badge.textContent = total > 0 ? total : '';
}

// ==================== DELIVERY FEE ====================

function getDeliveryFeeByNeighborhood(neighborhood) {
    if (!neighborhood) return 0;
    const fee = deliveryFees.find(f => f.name.toLowerCase() === neighborhood.toLowerCase());
    return fee?.fee || 0;
}

function getSelectedDeliveryFee() {
    const addr = addresses.find(a => a.id === selectedAddress);
    return addr ? getDeliveryFeeByNeighborhood(addr.neighborhood) : 0;
}

// ==================== COUPON ====================

function applyCoupon() {
    const code = document.getElementById('couponInput').value.trim().toUpperCase();
    const status = document.getElementById('couponStatus');
    
    if (!code) {
        status.textContent = '';
        status.className = 'coupon-status';
        appliedCoupon = null;
        updateCheckoutSummary();
        return;
    }
    
    const coupon = coupons.find(c => c.code.toUpperCase() === code);
    
    if (!coupon) {
        status.textContent = '❌ Cupom inválido';
        status.className = 'coupon-status error';
        appliedCoupon = null;
    } else if (coupon.minValue && getCartSubtotal() < coupon.minValue) {
        status.textContent = `❌ Mínimo ${formatCurrency(coupon.minValue)}`;
        status.className = 'coupon-status error';
        appliedCoupon = null;
    } else {
        appliedCoupon = coupon;
        const discountText = coupon.type === 'percent' 
            ? `${coupon.value}% de desconto`
            : `${formatCurrency(coupon.value)} de desconto`;
        status.textContent = `✅ ${discountText} aplicado!`;
        status.className = 'coupon-status success';
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

function getCartSubtotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
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
    document.getElementById('couponInput').value = '';
    document.getElementById('couponStatus').textContent = '';
    
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
    
    document.getElementById('checkoutSubtotal').textContent = formatCurrency(subtotal);
    document.getElementById('checkoutDelivery').textContent = formatCurrency(delivery);
    document.getElementById('checkoutNeighborhood').textContent = addr?.neighborhood || '-';
    document.getElementById('checkoutTotal').textContent = formatCurrency(total);
    
    const discountRow = document.getElementById('checkoutDiscountRow');
    if (discount > 0) {
        document.getElementById('checkoutDiscount').textContent = `- ${formatCurrency(discount)}`;
        discountRow.style.display = 'flex';
    } else {
        discountRow.style.display = 'none';
    }
}

async function submitOrder() {
    if (!selectedAddress) {
        showToast('Selecione um endereço!');
        return;
    }
    
    const store = stores.find(s => s.id === cart[0].storeId);
    if (!store) {
        showToast('Loja não encontrada!');
        return;
    }
    
    if (store.open === false) {
        showToast('Esta loja está fechada!');
        return;
    }
    
    const address = addresses.find(a => a.id === selectedAddress);
    const subtotal = getCartSubtotal();
    const delivery = getDeliveryFeeByNeighborhood(address.neighborhood);
    const discount = calculateDiscount(subtotal);
    const total = subtotal - discount + delivery;
    
    const order = {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Cliente',
        userEmail: currentUser.email,
        userPhone: address.phone || '',
        storeId: store.id,
        storeName: store.name,
        items: [...cart],
        subtotal,
        delivery,
        discount,
        total,
        couponCode: appliedCoupon?.code || null,
        address: {
            label: address.label,
            street: address.street,
            number: address.number,
            complement: address.complement || '',
            neighborhood: address.neighborhood,
            reference: address.reference || '',
            location: address.location || null
        },
        status: 'pending',
        paymentMethod: 'cash',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        timeline: [{
            status: 'pending',
            timestamp: new Date().toISOString(),
            message: 'Pedido recebido'
        }]
    };
    
    try {
        await db.collection('orders').add(order);
        
        cart = [];
        appliedCoupon = null;
        saveCart();
        closeModal('checkoutModal');
        showPage('orders');
        await loadOrders();
        showToast('Pedido realizado!');
        
    } catch (err) {
        console.error('Order error:', err);
        showToast('Erro ao fazer pedido');
    }
}

// ==================== ADDRESS ====================

function renderAddressesList() {
    const container = document.getElementById('addressesList');
    
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

function showAddAddressModal() {
    document.getElementById('addressLabel').value = '';
    document.getElementById('addressStreet').value = '';
    document.getElementById('addressNumber').value = '';
    document.getElementById('addressComplement').value = '';
    document.getElementById('addressNeighborhood').value = '';
    document.getElementById('addressReference').value = '';
    capturedLocation = null;
    document.getElementById('addressLocationStatus').innerHTML = `
        <span class="location-icon">📍</span>
        <span>Localização não capturada</span>
    `;
    document.getElementById('addressLocationStatus').className = 'location-status';
    
    openModal('addressModal');
}

function captureAddressLocation() {
    const status = document.getElementById('addressLocationStatus');
    
    if (!navigator.geolocation) {
        status.innerHTML = '<span class="location-icon">❌</span><span>GPS não disponível</span>';
        status.className = 'location-status error';
        return;
    }
    
    status.innerHTML = '<span class="location-icon">⏳</span><span>Obtendo localização...</span>';
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            capturedLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            status.innerHTML = `
                <span class="location-icon">✅</span>
                <span>Localização capturada!</span>
            `;
            status.className = 'location-status success';
        },
        (error) => {
            let msg = 'Erro ao obter localização';
            if (error.code === error.PERMISSION_DENIED) msg = 'Permissão negada';
            status.innerHTML = `<span class="location-icon">❌</span><span>${msg}</span>`;
            status.className = 'location-status error';
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

async function saveAddress(e) {
    e.preventDefault();
    
    const neighborhood = document.getElementById('addressNeighborhood').value;
    
    if (!neighborhood) {
        showToast('Selecione um bairro!');
        return;
    }
    
    const address = {
        label: document.getElementById('addressLabel').value,
        street: document.getElementById('addressStreet').value,
        number: document.getElementById('addressNumber').value,
        complement: document.getElementById('addressComplement').value,
        neighborhood: neighborhood,
        reference: document.getElementById('addressReference').value,
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
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function openProductModal(productId) {
    selectedProduct = products.find(p => p.id === productId);
    if (!selectedProduct) return;
    
    modalQty = 1;
    
    const modalImg = document.getElementById('modalProductImg');
    const hasImage = selectedProduct.imageUrl && selectedProduct.imageUrl.startsWith('data:');
    
    if (hasImage) {
        modalImg.innerHTML = '';
        modalImg.style.backgroundImage = `url('${selectedProduct.imageUrl}')`;
        modalImg.classList.add('has-image');
    } else {
        modalImg.textContent = selectedProduct.emoji || '🍽️';
        modalImg.style.backgroundImage = '';
        modalImg.classList.remove('has-image');
    }
    
    document.getElementById('modalProductName').textContent = selectedProduct.name;
    document.getElementById('modalProductDesc').textContent = selectedProduct.description || 'Sem descrição';
    document.getElementById('modalProductPrice').textContent = formatCurrency(selectedProduct.price);
    document.getElementById('modalQty').textContent = modalQty;
    
    openModal('productModal');
}

function changeModalQty(delta) {
    modalQty = Math.max(1, modalQty + delta);
    document.getElementById('modalQty').textContent = modalQty;
}

function addToCartFromModal() {
    if (selectedProduct) {
        addToCart(selectedProduct, modalQty);
        closeModal('productModal');
    }
}

function openOrderDetail(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const canTrack = TrackingModule.canTrack(order);
    
    document.getElementById('orderDetailContent').innerHTML = `
        <div style="margin-bottom: 20px;">
            <div class="order-store" style="font-size: 1.2rem;">${order.storeName || 'Loja'}</div>
            <h3 style="margin-bottom: 4px;">Pedido #${order.id.slice(-6).toUpperCase()}</h3>
            <p style="color: var(--text-muted);">${formatDate(order.createdAt)}</p>
        </div>
        
        ${canTrack ? `
            <button class="order-track-btn" onclick="closeModal('orderModal'); TrackingModule.openTracking('${order.id}')" style="margin-bottom: 20px;">
                🗺️ Rastrear entrega em tempo real
            </button>
        ` : ''}
        
        <h4 style="margin-bottom: 12px;">📦 Itens</h4>
        <div class="card" style="margin-bottom: 20px;">
            ${order.items.map(item => `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
                    <span>${item.qty}x ${item.name}</span>
                    <span>${formatCurrency(item.price * item.qty)}</span>
                </div>
            `).join('')}
        </div>
        
        <h4 style="margin-bottom: 12px;">📍 Entrega</h4>
        <div class="card" style="margin-bottom: 20px;">
            <p><strong>${order.address.label}</strong></p>
            <p style="color: var(--text-muted);">${order.address.street}, ${order.address.number}</p>
            <p style="color: var(--text-muted);">${order.address.neighborhood}</p>
            ${order.address.reference ? `<p style="color: var(--text-muted);">Ref: ${order.address.reference}</p>` : ''}
        </div>
        
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
            <div class="summary-row">
                <span>Entrega</span>
                <span>${formatCurrency(order.delivery)}</span>
            </div>
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
    
    document.getElementById(`${page}Page`).classList.add('active');
    
    const navIndex = { home: 0, orders: 1, profile: 2, cart: 0, addresses: 2, tracking: 1 };
    document.querySelectorAll('.nav-item')[navIndex[page]]?.classList.add('active');
    
    if (page === 'cart') renderCart();
    if (page === 'orders') renderOrders();
    if (page === 'addresses') renderAddressesList();
    if (page === 'profile') ProfileModule.render();
    if (page === 'home') NotificationsModule.checkAndShowReviewPrompt();
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
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Online/Offline
window.addEventListener('online', () => document.getElementById('offlineBanner').classList.remove('show'));
window.addEventListener('offline', () => document.getElementById('offlineBanner').classList.add('show'));

// Close modals on backdrop
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

// Adicione no index.js do cliente
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

        // Tenta centralizar na localização atual
        navigator.geolocation?.getCurrentPosition(pos => {
            map.setView([pos.coords.latitude, pos.coords.longitude], 16);
        });

        map.on('click', e => {
            if (marker) map.removeLayer(marker);
            marker = L.marker(e.latlng).addTo(map);
            window._pickedLocation = { lat: e.latlng.lat, lng: e.latlng.lng };
            document.getElementById('pickerCoords').textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
            document.getElementById('confirmLocationBtn').disabled = false;
        });
    }, 100);
}

function closeMapPicker() {
    document.getElementById('mapPickerModal')?.remove();
}

function confirmPickedLocation() {
    if (!window._pickedLocation) return;
    capturedLocation = { ...window._pickedLocation, accuracy: 0, manual: true };
    document.getElementById('addressLocationStatus').innerHTML = `<span class="location-icon">✅</span><span>Localização selecionada no mapa</span>`;
    document.getElementById('addressLocationStatus').className = 'location-status success';
    closeMapPicker();
    showToast('Localização definida!');
}
// Renderiza os adicionais do produto no modal
function renderProductAddons(product) {
    const addons = product.addons || [];
    if (addons.length === 0) return '';
    
    // Ordena por "order" 
    const sorted = [...addons].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    
    return `
        <div class="addons-section">
            <div class="addons-title">Adicionais</div>
            <div class="addons-options">
                <label class="addon-option selected">
                    <input type="radio" name="addon-${product.id}" value="" checked onchange="selectAddon(null)">
                    <span class="addon-label">
                        <span class="addon-name">Nenhum</span>
                        <span class="addon-price">-</span>
                    </span>
                </label>
                ${sorted.map((addon, idx) => `
                    <label class="addon-option">
                        <input type="radio" name="addon-${product.id}" value="${idx}" onchange="selectAddon(${JSON.stringify(addon).replace(/"/g, '&quot;')})">
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

// Variável para guardar addon selecionado
let selectedAddon = null;

function selectAddon(addon) {
    selectedAddon = addon;
    // Atualiza visual
    document.querySelectorAll('.addon-option').forEach(el => {
        el.classList.toggle('selected', el.querySelector('input').checked);
    });
    // Atualiza preço total se necessário
    updateTotalPrice();
}

// Ao adicionar ao carrinho, inclua o addon:
function addToCart(product, qty) {
    const item = {
        productId: product.id,
        name: product.name,
        price: product.price,
        qty: qty,
        addons: selectedAddon ? [selectedAddon] : [] // Array para suportar múltiplos no futuro
    };
    cart.push(item);
    selectedAddon = null; // Reset
}
let selectedPayment = 'pix';

function setDeliveryMode(mode) {
    deliveryMode = mode;
    document.getElementById('modeDelivery').classList.toggle('selected', mode === 'delivery');
    document.getElementById('modePickup').classList.toggle('selected', mode === 'pickup');
    document.getElementById('addressSection').style.display = mode === 'delivery' ? 'block' : 'none';
    updateCheckoutSummary();
}

function selectPayment(el) {
    selectedPayment = el.value;
    document.querySelectorAll('.payment-option').forEach(p => p.classList.remove('selected'));
    el.closest('.payment-option').classList.add('selected');
}

function getSelectedDeliveryFee() {
    if (deliveryMode === 'pickup') return 0;
    const addr = addresses.find(a => a.id === selectedAddress);
    return addr ? getDeliveryFeeByNeighborhood(addr.neighborhood) : 0;
}
