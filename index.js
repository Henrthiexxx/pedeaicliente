// ==================== FIREBASE CONFIG ====================
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

// ==================== STATE ====================
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

// ==================== INIT - EVITA FLASH DE LOGIN ====================
(function initApp() {
    // Decide UI inicial baseado em sessão local
    if (typeof AuthManager !== 'undefined') {
        AuthManager.init();
    } else {
        // Fallback: verifica localStorage direto
        const hasSession = localStorage.getItem('auth_uid');
        const authPage = document.getElementById('authPage');
        const mainApp = document.getElementById('mainApp');
        if (hasSession) {
            if (authPage) authPage.style.display = 'none';
            if (mainApp) mainApp.style.display = 'block';
        } else {
            if (authPage) authPage.style.display = 'flex';
            if (mainApp) mainApp.style.display = 'none';
        }
    }
})();

// ==================== AUTH ====================
auth.onAuthStateChanged(async (user) => {
    // Usa AuthManager se disponível
    if (typeof AuthManager !== 'undefined') {
        await AuthManager.onAuthStateChanged(user);
    }

    if (user) {
        currentUser = user;
        window.currentUser = user;
        
        // Salva UID para outros módulos
        localStorage.setItem('auth_uid', user.uid);
        localStorage.setItem('auth_name', user.displayName || '');
        localStorage.setItem('auth_email', user.email || '');

        await loadUserData();
        showMainApp();

        // Inicia módulos
        if (typeof StoresModule !== 'undefined') StoresModule.init();
        if (typeof ProfileModule !== 'undefined') ProfileModule.init();
        if (typeof NotificationsModule !== 'undefined') {
            NotificationsModule.init();
            NotificationsModule.checkAndShowReviewPrompt();
            NotificationsModule.updateNotificationBadge();
            NotificationsModule.setupOrderStatusListener();
        }
        if (typeof TrackingModule !== 'undefined') TrackingModule.init();
        if (typeof UserMetrics !== 'undefined') UserMetrics.startSession();

        // Render
        if (typeof StoresModule !== 'undefined') StoresModule.render();
        if (typeof ProfileModule !== 'undefined') ProfileModule.render();
        
// Sincroniza notificações
        if (typeof NotificationSync !== 'undefined') {
            await NotificationSync.syncNotifications();
        }

        // FCM Push Notifications - pede permissão se ainda não pediu
        if (typeof setupClientPushNotifications === 'function' && Notification.permission === 'granted') {
            setupClientPushNotifications();
        }
    } else {
        currentUser = null;
        window.currentUser = null;
        localStorage.removeItem('auth_uid');
        showAuthPage();
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
    
    if (!email || !password) return showToast('Preencha email e senha');
    
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
    
    if (!name || !email || !password) return showToast('Preencha todos os campos');
    
    try {
        const { user } = await auth.createUserWithEmailAndPassword(email, password);
        await user.updateProfile({ displayName: name });
        await db.collection('users').doc(user.uid).set({
            name, email, phone,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Conta criada!');
    } catch (err) {
        showToast(getAuthError(err.code));
    }
}

async function handleLogout() {
    if (!confirm('Deseja sair?')) return;
    if (typeof AuthManager !== 'undefined') {
        await AuthManager.logout();
    } else {
        localStorage.removeItem('auth_uid');
        await auth.signOut();
    }
    cart = [];
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

// ==================== DATA LOADING (COM CACHE) ====================
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
        deliveryFees = typeof DataCache !== 'undefined' 
            ? await DataCache.getFees()
            : (await db.collection('deliveryFees').where('active', '==', true).get())
                .docs.map(doc => ({ id: doc.id, ...doc.data() }));
        deliveryFees.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (err) {
        console.error('Error loading fees:', err);
    }
}

async function loadCoupons() {
    try {
        coupons = typeof DataCache !== 'undefined'
            ? await DataCache.getCoupons()
            : (await db.collection('coupons').where('active', '==', true).get())
                .docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
        console.error('Error loading coupons:', err);
    }
}

async function loadStores() {
    try {
        stores = typeof DataCache !== 'undefined'
            ? await DataCache.getStores()
            : (await db.collection('stores').get())
                .docs.map(doc => ({ id: doc.id, ...doc.data() }))
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
        products = typeof DataCache !== 'undefined'
            ? await DataCache.getProducts(storeId)
            : (await db.collection('products').where('storeId', '==', storeId).get())
                .docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(p => p.active !== false)
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const cats = new Set(products.map(p => p.category).filter(Boolean));
        categories = ['all', ...cats];
    } catch (err) {
        console.error('Error loading products:', err);
    }
}

async function loadOrders() {
    if (!currentUser) return;
    try {
        const snapshot = await db.collection('orders')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch {
        const snapshot = await db.collection('orders')
            .where('userId', '==', currentUser.uid)
            .get();
        orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    renderOrders();
}

function loadCart() {
    if (!currentUser) return;
    try {
        const saved = localStorage.getItem(`cart_${currentUser.uid}`);
        if (saved) {
            cart = JSON.parse(saved);
            updateCartBadge();
        }
    } catch {
        cart = [];
    }
}

function saveCart() {
    if (!currentUser) return;
    localStorage.setItem(`cart_${currentUser.uid}`, JSON.stringify(cart));
    updateCartBadge();
}

// ==================== REALTIME LISTENERS ====================
function setupRealtimeListeners() {
    if (!currentUser) return;
    
    // Orders
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
    
    // Stores (atualiza cache)
    db.collection('stores').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'modified') {
                const store = { id: change.doc.id, ...change.doc.data() };
                const idx = stores.findIndex(s => s.id === store.id);
                if (idx !== -1) {
                    stores[idx] = store;
                    if (typeof DataCache !== 'undefined') DataCache.set('stores', stores);
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

// ==================== IMAGE HELPER (INLINE FALLBACK) ====================
function getImageSrc(item) {
    if (!item) return null;
    if (typeof ImageHelper !== 'undefined') return ImageHelper.getSrc(item);
    const data = (item.imageData || '').trim();
    const url = (item.imageUrl || '').trim();
    if (data && (data.startsWith('data:image/') || /^https?:\/\//.test(data))) return data;
    if (url && /^https?:\/\//.test(url)) return url;
    return null;
}

function hasImageUrl(src) {
    if (typeof ImageHelper !== 'undefined') return ImageHelper.isValid(src);
    if (typeof src !== 'string') return false;
    const u = src.trim();
    return u.startsWith('data:image/') || (/^https?:\/\//i.test(u) && u.length > 10);
}

// ==================== STORES ====================
async function selectStore(storeId) {
    localStorage.setItem("currentStoreId", storeId);
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

// ==================== RENDER ====================
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

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    const search = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    let filtered = Array.isArray(products) ? products : [];

    if (activeCategory && activeCategory !== 'all') {
        filtered = filtered.filter(p => (p.category || '') === activeCategory);
    }
    if (search) {
        filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(search) ||
            (p.description || '').toLowerCase().includes(search)
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Nenhum produto encontrado</div></div>`;
        return;
    }

    // Agrupa por categoria
    const groups = {};
    filtered.forEach(p => {
        const cat = p.category || 'Outros';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(p);
    });

    let html = '';
    for (const [cat, items] of Object.entries(groups)) {
        html += `<div class="category-section">
            <h3 class="category-section-title">${cat}</h3>
            <div class="category-products">`;

        html += items.map(p => {
            const imgData = (p.imageData || '').trim();
            const imgUrl = (p.imageUrl || '').trim();
            const imgSrc = (imgData && (imgData.startsWith('data:image/') || /^https?:\/\//.test(imgData)))
                ? imgData : (imgUrl && /^https?:\/\//.test(imgUrl)) ? imgUrl : null;
            const hasImg = !!imgSrc;
            const fallback = p.emoji || '🍽️';

            return `
            <div class="product-item" onclick="openProductModal('${p.id}')">
                <div class="product-item-img ${hasImg ? 'has-image' : ''}"
                     ${hasImg ? `style="background-image:url('${imgSrc}')"` : ''}>
                    ${!hasImg ? fallback : ''}
                </div>
                <div class="product-item-info">
                    <div class="product-item-name">${p.name || 'Produto'}</div>
                    <div class="product-item-desc">${p.description || ''}</div>
                    <div class="product-item-price">${formatCurrency(p.price || 0)}</div>
                </div>
                <button class="product-item-add" onclick="event.stopPropagation();openProductModal('${p.id}')">+</button>
            </div>`;
        }).join('');

        html += `</div></div>`;
    }

    grid.innerHTML = html;
}

// ==================== CART ====================
function addToCart(product, qty = 1, addons = []) {
    if (!selectedStore) return;

    if (cart.length > 0 && cart[0].storeId !== selectedStore.id) {
        showToast(`Finalize o pedido de ${cart[0].storeName} primeiro!`);
        return;
    }

    const safeAddons = Array.isArray(addons) ? addons.map(a => ({
        name: String(a.name || "").trim(),
        price: parseFloat(a.price) || 0
    })).filter(a => a.name && a.price >= 0) : [];

    const addonKey = safeAddons.length ? safeAddons.map(a => a.name).sort().join("|") : "none";
    const itemKey = `${product.id}__${addonKey}`;
    const existing = cart.find(i => i.itemKey === itemKey);

    // Prioriza imageData (base64) sobre imageUrl
    const imgData = (product.imageData || '').trim();
    const imgUrl = (product.imageUrl || '').trim();
    const finalImage = (imgData && (imgData.startsWith('data:image/') || /^https?:\/\//.test(imgData))) 
        ? imgData 
        : imgUrl;

    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({
            itemKey,
            id: product.id,
            name: product.name,
            price: parseFloat(product.price) || 0,
            emoji: product.emoji,
            imageUrl: finalImage,
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
    if (cart[index].qty <= 0) cart.splice(index, 1);
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
        const addonTotal = (item.addons || []).reduce((s, a) => s + (Number(a.price) || 0), 0);
        return sum + ((item.price + addonTotal) * item.qty);
    }, 0);
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
        const imgUrl = item.imageUrl || '';
        const hasImg = imgUrl && (imgUrl.startsWith('data:image/') || /^https?:\/\//.test(imgUrl));
        const addonTotal = (item.addons || []).reduce((s, a) => s + (parseFloat(a.price) || 0), 0);
        const itemTotal = (parseFloat(item.price) + addonTotal) * item.qty;
        const fallback = item.emoji || '🍽️';
        
        return `
        <div class="cart-item">
            <div class="cart-item-img ${hasImg ? 'has-image' : ''}"
                 ${hasImg ? `style="background-image:url('${imgUrl}');background-size:cover;background-position:center;"` : ''}>
                ${!hasImg ? fallback : ''}
            </div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                ${item.addons?.length ? `<div class="cart-item-addons">${item.addons.map(a => `+ ${a.name} (${formatCurrency(a.price)})`).join(', ')}</div>` : ''}
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

function updateCartSummary() {
    const subtotal = getCartSubtotal();
    const delivery = getSelectedDeliveryFee();
    const discount = calculateDiscount(subtotal);
    const total = subtotal - discount + delivery;
    
    const el = (id) => document.getElementById(id);
    if (el('cartSubtotal')) el('cartSubtotal').textContent = formatCurrency(subtotal);
    if (el('cartDelivery')) el('cartDelivery').textContent = formatCurrency(delivery);
    if (el('cartTotal')) el('cartTotal').textContent = formatCurrency(total);
    
    if (el('cartDiscountRow')) {
        if (discount > 0) {
            if (el('cartDiscount')) el('cartDiscount').textContent = `- ${formatCurrency(discount)}`;
            el('cartDiscountRow').style.display = 'flex';
        } else {
            el('cartDiscountRow').style.display = 'none';
        }
    }
}

// ==================== DELIVERY & PAYMENT ====================
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

function setDeliveryMode(mode) {
    deliveryMode = mode;
    document.getElementById('modeDelivery')?.classList.toggle('selected', mode === 'delivery');
    document.getElementById('modePickup')?.classList.toggle('selected', mode === 'pickup');
    const addressSection = document.getElementById('addressSection');
    const deliveryRow = document.getElementById('checkoutDeliveryRow');
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
        if (status) { status.textContent = ''; status.className = 'coupon-status'; }
        appliedCoupon = null;
        updateCheckoutSummary();
        return;
    }
    
    const coupon = coupons.find(c => (c.code || '').toUpperCase() === code);
    
    if (!coupon) {
        if (status) { status.textContent = '❌ Cupom inválido'; status.className = 'coupon-status error'; }
        appliedCoupon = null;
    } else if (coupon.minValue && getCartSubtotal() < coupon.minValue) {
        if (status) { status.textContent = `❌ Mínimo ${formatCurrency(coupon.minValue)}`; status.className = 'coupon-status error'; }
        appliedCoupon = null;
    } else {
        appliedCoupon = coupon;
        const txt = coupon.type === 'percent' ? `${coupon.value}%` : formatCurrency(coupon.value);
        if (status) { status.textContent = `✅ ${txt} de desconto!`; status.className = 'coupon-status success'; }
    }
    updateCheckoutSummary();
}

function calculateDiscount(subtotal) {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.type === 'percent') return Math.min(subtotal * (appliedCoupon.value / 100), subtotal);
    return Math.min(appliedCoupon.value, subtotal);
}

// ==================== CHECKOUT ====================
function showCheckout() {
    if (cart.length === 0) return showToast('Carrinho vazio!');
    
    const store = stores.find(s => s.id === cart[0].storeId);
    if (store?.open === false) return showToast('Esta loja fechou.');
    
    appliedCoupon = null;
    deliveryMode = 'delivery';
    selectedPayment = 'pix';
    
    document.getElementById('couponInput').value = '';
    document.getElementById('couponStatus').textContent = '';
    document.getElementById('modeDelivery')?.classList.add('selected');
    document.getElementById('modePickup')?.classList.remove('selected');
    document.getElementById('addressSection').style.display = 'block';
    document.getElementById('checkoutDeliveryRow').style.display = 'flex';
    
    document.querySelectorAll('.payment-option').forEach(p => p.classList.remove('selected'));
    const pix = document.querySelector('.payment-option input[value="pix"]');
    if (pix) { pix.checked = true; pix.closest('.payment-option')?.classList.add('selected'); }
    
    renderCheckoutAddresses();
    updateCheckoutSummary();
    openModal('checkoutModal');
}

function selectAddress(id) {
    selectedAddress = id;
    renderCheckoutAddresses();
    updateCheckoutSummary();
}

function renderCheckoutAddresses() {
    const container = document.getElementById('checkoutAddresses');
    if (!container) return;
    
    if (addresses.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);margin-bottom:12px;">Nenhum endereço</p>';
        return;
    }
    
    container.innerHTML = addresses.map(addr => {
        const fee = getDeliveryFeeByNeighborhood(addr.neighborhood);
        return `
            <div class="address-card ${selectedAddress === addr.id ? 'selected' : ''}" onclick="selectAddress('${addr.id}')">
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

function updateCheckoutSummary() {
    const subtotal = getCartSubtotal();
    const delivery = getSelectedDeliveryFee();
    const discount = calculateDiscount(subtotal);
    const total = subtotal - discount + delivery;
    const addr = addresses.find(a => a.id === selectedAddress);
    
    const el = (id) => document.getElementById(id);
    if (el('checkoutSubtotal')) el('checkoutSubtotal').textContent = formatCurrency(subtotal);
    if (el('checkoutDelivery')) el('checkoutDelivery').textContent = formatCurrency(delivery);
    if (el('checkoutNeighborhood')) el('checkoutNeighborhood').textContent = deliveryMode === 'pickup' ? 'Retirada' : (addr?.neighborhood || '-');
    if (el('checkoutTotal')) el('checkoutTotal').textContent = formatCurrency(total);
    
    if (el('checkoutDiscountRow')) {
        if (discount > 0) {
            if (el('checkoutDiscount')) el('checkoutDiscount').textContent = `- ${formatCurrency(discount)}`;
            el('checkoutDiscountRow').style.display = 'flex';
        } else {
            el('checkoutDiscountRow').style.display = 'none';
        }
    }
}

function sanitizeAddons(addons) {
    if (!Array.isArray(addons)) return [];
    return addons
        .filter(a => a && typeof a === 'object')
        .map((a, i) => ({
            name: String(a.name || '').trim() || `Item ${i + 1}`,
            price: parseFloat(a.price) || 0,
            order: typeof a.order === 'number' ? a.order : i
        }))
        .filter(a => a.name && a.name !== `Item ${a.order + 1}`);
}

async function submitOrder() {
    if (deliveryMode === 'delivery' && !selectedAddress) return showToast('Selecione um endereço!');
    
    const storeId = cart[0]?.storeId;
    if (!storeId) return showToast('Carrinho vazio!');
    
    const store = stores.find(s => s.id === storeId);
    if (!store) { cart = []; saveCart(); closeModal('checkoutModal'); return showToast('Loja não encontrada!'); }
    if (store.open === false) return showToast('Loja fechada!');
    
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
        items: cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            qty: item.qty,
            addons: sanitizeAddons(item.addons || [])
        })),
        subtotal, delivery, discount, total,
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
        reviewed: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        timeline: [{ status: 'pending', timestamp: new Date().toISOString(), message: 'Pedido recebido' }]
    };
    
    try {
        const docRef = await db.collection('orders').add(order);
        
        // Atualiza métricas
        if (typeof UserMetrics !== 'undefined') {
            UserMetrics.onOrderComplete({ ...order, id: docRef.id });
        }
        
        cart = [];
        appliedCoupon = null;
        saveCart();
        renderCart();
        updateCartBadge();
        closeModal('checkoutModal');
        showPage('orders');
        showToast('Pedido realizado!');
    } catch (err) {
        console.error('Order error:', err);
        showToast('Erro ao fazer pedido');
    }
}

// ==================== ADDRESS ====================
function populateNeighborhoodSelect() {
    const select = document.getElementById('addressNeighborhood');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione o bairro</option>' +
        deliveryFees.map(f => `<option value="${f.name}">${f.name} - ${formatCurrency(f.fee)}</option>`).join('');
}

function showAddAddressModal() {
    ['addressLabel', 'addressStreet', 'addressNumber', 'addressComplement', 'addressNeighborhood', 'addressReference']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    capturedLocation = null;
    const status = document.getElementById('addressLocationStatus');
    if (status) { status.innerHTML = `<span>📍</span><span>Localização não capturada</span>`; status.className = 'location-status'; }
    openModal('addressModal');
}

function captureAddressLocation() {
    const status = document.getElementById('addressLocationStatus');
    if (!navigator.geolocation) {
        if (status) { status.innerHTML = '<span>❌</span><span>GPS não disponível</span>'; status.className = 'location-status error'; }
        return;
    }
    if (status) status.innerHTML = '<span>⏳</span><span>Obtendo...</span>';
    navigator.geolocation.getCurrentPosition(
        pos => {
            capturedLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            if (status) { status.innerHTML = '<span>✅</span><span>Localização capturada!</span>'; status.className = 'location-status success'; }
        },
        err => {
            if (status) { status.innerHTML = `<span>❌</span><span>${err.code === 1 ? 'Permissão negada' : 'Erro'}</span>`; status.className = 'location-status error'; }
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

async function saveAddress(e) {
    e.preventDefault();
    if (!currentUser) return;
    
    const neighborhood = document.getElementById('addressNeighborhood')?.value;
    if (!neighborhood) return showToast('Selecione um bairro!');
    
    const address = {
        label: document.getElementById('addressLabel')?.value || '',
        street: document.getElementById('addressStreet')?.value || '',
        number: document.getElementById('addressNumber')?.value || '',
        complement: document.getElementById('addressComplement')?.value || '',
        neighborhood,
        reference: document.getElementById('addressReference')?.value || '',
        location: capturedLocation
    };
    
    try {
        const docRef = await db.collection('users').doc(currentUser.uid).collection('addresses').add(address);
        address.id = docRef.id;
        addresses.push(address);
        selectedAddress = address.id;
        closeModal('addressModal');
        renderCheckoutAddresses();
        updateCheckoutSummary();
        showToast('Endereço salvo!');
    } catch {
        showToast('Erro ao salvar');
    }
}

// ==================== ORDERS ====================
function renderOrders() {
    const container = document.getElementById('ordersList');
    if (!container) return;
    
    if (orders.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#888;">📭<br>Nenhum pedido</div>';
        return;
    }
    
    const statuses = {
        pending: '🕐 Pendente', confirmed: '✅ Confirmado', preparing: '👨‍🍳 Preparando',
        ready: '📦 Pronto', delivering: '🛵 A caminho', delivered: '✅ Entregue', cancelled: '❌ Cancelado'
    };
    
    container.innerHTML = orders.map(order => {
        const date = order.createdAt?.toDate?.() || new Date();
        return `
            <div class="order-card" onclick="openOrderDetail('${order.id}')">
                <div class="order-header">
                    <div>
                        <div class="order-id">#${order.id.slice(-6).toUpperCase()}</div>
                        <div class="order-date">${date.toLocaleDateString('pt-BR')}</div>
                    </div>
                    <div class="order-status status-${order.status}">${statuses[order.status]}</div>
                </div>
                <div class="order-items">${(order.items || []).map(i => `${i.qty}x ${i.name}`).join(', ')}</div>
                <div class="order-total"><span>Total</span><span>${formatCurrency(order.total)}</span></div>
            </div>
        `;
    }).join('');
}

function openOrderDetail(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const canTrack = typeof TrackingModule !== 'undefined' && TrackingModule.canTrack(order);
    const payments = { pix: 'PIX', credit: 'Crédito', debit: 'Débito', cash: 'Dinheiro', picpay: 'PicPay', alimentacao: 'VA/VR' };
    
    const content = document.getElementById('orderDetailContent');
    if (!content) return;
    
    content.innerHTML = `
        <div style="margin-bottom:20px;">
            <div class="order-store" style="font-size:1.2rem;">${order.storeName || 'Loja'}</div>
            <h3>Pedido #${order.id.slice(-6).toUpperCase()}</h3>
            <p style="color:var(--text-muted);">${formatDate(order.createdAt)}</p>
            <p style="color:var(--text-muted);font-size:0.85rem;">
                ${order.deliveryMode === 'pickup' ? '🏪 Retirada' : '🛵 Entrega'} • ${payments[order.paymentMethod] || 'Dinheiro'}
            </p>
        </div>
        ${canTrack ? `<button class="order-track-btn" onclick="closeModal('orderModal');TrackingModule.openTracking('${order.id}')">🗺️ Rastrear</button>` : ''}
        <h4 style="margin:16px 0 12px;">📦 Itens</h4>
        <div class="card">
            ${(order.items || []).map(item => {
                const addons = sanitizeAddons(item.addons || []);
                const addonTotal = addons.reduce((s, a) => s + (a.price || 0), 0);
                return `
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
                    <div>
                        <span>${item.qty}x ${item.name}</span>
                        ${addons.length ? `<div style="font-size:0.8rem;color:var(--text-muted);">${addons.map(a => `+ ${a.name}`).join(', ')}</div>` : ''}
                    </div>
                    <span>${formatCurrency((item.price + addonTotal) * item.qty)}</span>
                </div>
            `;}).join('')}
        </div>
        ${order.deliveryMode !== 'pickup' && order.address ? `
            <h4 style="margin:16px 0 12px;">📍 Entrega</h4>
            <div class="card"><p><strong>${order.address.label}</strong></p><p style="color:var(--text-muted);">${order.address.street}, ${order.address.number} - ${order.address.neighborhood}</p></div>
        ` : ''}
        <h4 style="margin:16px 0 12px;">📋 Status</h4>
        <div class="timeline">
            ${(order.timeline || []).map((t, i, arr) => `
                <div class="timeline-item">
                    <div class="timeline-dot ${i === arr.length - 1 ? 'active' : ''}">✓</div>
                    <div class="timeline-content">
                        <div class="timeline-title">${getStatusLabel(t.status)}</div>
                        <div class="timeline-time">${new Date(t.timestamp).toLocaleString('pt-BR')}</div>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="card" style="margin-top:20px;">
            <div class="summary-row"><span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span></div>
            ${order.discount > 0 ? `<div class="summary-row" style="color:var(--success);"><span>Desconto</span><span>- ${formatCurrency(order.discount)}</span></div>` : ''}
            ${order.deliveryMode !== 'pickup' ? `<div class="summary-row"><span>Entrega</span><span>${formatCurrency(order.delivery)}</span></div>` : ''}
            <div class="summary-row total"><span>Total</span><span>${formatCurrency(order.total)}</span></div>
        </div>
        ${order.status === 'delivered' && !order.reviewed ? `<button class="btn btn-primary" onclick="closeModal('orderModal');NotificationsModule?.openReviewModal('${order.id}')" style="margin-top:16px;">⭐ Avaliar</button>` : ''}
    `;
    openModal('orderModal');
}

// ==================== MODALS ====================
function openModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

function openProductModal(productId) {
    const storeId = localStorage.getItem("currentStoreId");
    if (!storeId) return showToast("Selecione uma loja!");
    document.getElementById("popupFrame").src = `popup.html?storeId=${encodeURIComponent(storeId)}&productId=${encodeURIComponent(productId)}`;
    document.getElementById("htmlPopup").style.display = "block";
}

function closeProductPopup() {
    document.getElementById("htmlPopup").style.display = "none";
    document.getElementById("popupFrame").src = "about:blank";
}

// ==================== NAVIGATION ====================
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`${page}Page`)?.classList.add('active');
    const navIndex = { home: 0, orders: 1, profile: 2, cart: 0, addresses: 2, tracking: 1, notifications: 0 };
    document.querySelectorAll('.nav-item')[navIndex[page]]?.classList.add('active');
    
    if (page === 'cart') renderCart();
    if (page === 'orders') { renderOrders(); loadOrders(); }
    if (page === 'profile' && typeof ProfileModule !== 'undefined') ProfileModule.render();
    if (page === 'home' && typeof NotificationsModule !== 'undefined') NotificationsModule.checkAndShowReviewPrompt();
}

// ==================== UTILITIES ====================
function formatCurrency(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0); }

function formatDate(ts) {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getStatusLabel(s) {
    return { pending: 'Pendente', confirmed: 'Confirmado', preparing: 'Preparando', ready: 'Pronto', delivering: 'Em entrega', delivered: 'Entregue', cancelled: 'Cancelado' }[s] || s;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}



// ==================== POPUP MESSAGE HANDLER ====================
window.addEventListener("message", (e) => {
    if (!e.data) return;
    if (e.data.type === "closePopup") closeProductPopup();
    if (e.data.type === "cartUpdated") { loadCart(); renderCart(); updateCartBadge(); }
    if (e.data.type === "ADD_TO_CART") {
        const { productId, qty, selections } = e.data.payload || {};
        const product = products.find(p => p.id === productId);
        if (!product) return showToast("Produto inválido");
        const addons = [];
        if (selections?.flavor?.name) addons.push({ name: selections.flavor.name, price: parseFloat(selections.flavor.price) || 0 });
        if (selections?.size?.name) addons.push({ name: selections.size.name, price: parseFloat(selections.size.price) || 0 });
        if (Array.isArray(selections?.extras)) selections.extras.forEach(ex => { if (ex?.name) addons.push({ name: ex.name, price: parseFloat(ex.price) || 0 }); });
        addToCart(product, qty || 1, addons);
        closeProductPopup();
    }
});

// ==================== EVENTS ====================
window.addEventListener('online', () => document.getElementById('offlineBanner')?.classList.remove('show'));
window.addEventListener('offline', () => document.getElementById('offlineBanner')?.classList.add('show'));
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); }));

// Page redirects
(function() {
    const _showPage = window.showPage;
    window.showPage = function(page) {
        if (page === 'orders') { window.location.href = 'orders.html'; return; }
        if (typeof _showPage === 'function') return _showPage(page);
    };
})();
