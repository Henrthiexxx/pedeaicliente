// ==================== FIREBASE CONFIG ====================
const firebaseConfig = {
    apiKey: "AIzaSyAnIJRcUxN-0swpVnonPbJjTSK87o4CQ_g",
    authDomain: "pedrad-814d0.firebaseapp.com",
    projectId: "pedrad-814d0",
    storageBucket: "pedrad-814d0.appspot.com",
    messagingSenderId: "293587190550",
    appId: "1:293587190550:web:80c9399f82847c80e20637"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ==================== STATE ====================
let currentUser = null;
let currentStore = null;
let orders = [];
let products = [];
let categories = [];
let orderFilter = 'all';
let selectedEmoji = '🍔';
let productImageData = null;
let storeImageData = null;
let productAddons = [];
let knownOrderIds = new Set();

const foodEmojis = ['🍔', '🍕', '🍟', '🌭', '🍗', '🥓', '🍖', '🥩', '🍝', '🍜', '🍲', '🥗', '🌮', '🌯', '🥙', '🧆', '🍣', '🍤', '🍱', '🥡', '🍚', '🍛', '🍙', '🥟', '🍰', '🎂', '🍮', '🍩', '🍪', '🍫', '🍬', '🍭', '🍦', '🍨', '🍧', '🥤', '🧃', '🍺', '🍷', '☕', '🧋', '🥛', '💧', '🍇', '🍉', '🍊', '🍋', '🍌', '🍎', '🍒', '🥑', '🥕', '🌽', '🥔', '🧀', '🥚', '🥐', '🥖', '🥨', '🥯', '🥞', '🧇'];

// ==================== AUTH ====================

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        await loadStoreData();
        if (currentStore) {
            showMainApp();
            await loadAllData();
            setupRealtimeListeners();
            updateNotificationButton();
        } else {
            showToast('Loja não encontrada para este usuário');
            auth.signOut();
        }
    } else {
        showAuthPage();
    }
});

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
        setTimeout(() => {
            if (currentStore && Notification.permission === 'default') {
                requestNotificationPermission();
            }
        }, 1000);
    } catch (err) {
        showToast('Erro: ' + err.message);
    }
}

function handleLogout() {
    showConfirmModal('Deseja sair?', 'Você será desconectado do painel.', () => auth.signOut());
}

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
    initEmojiPicker();
}

// ==================== DATA LOADING ====================

async function loadStoreData() {
    try {
        let snapshot = await db.collection('stores').where('ownerEmail', '==', currentUser.email).limit(1).get();
        
        if (snapshot.empty) {
            snapshot = await db.collection('stores').where('ownerId', '==', currentUser.uid).limit(1).get();
        }
        
        if (!snapshot.empty) {
            currentStore = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            updateStoreUI();
        }
    } catch (err) {
        console.error('Error loading store:', err);
    }
}

function updateStoreUI() {
    if (!currentStore) return;
    
    const sidebarName = document.getElementById('sidebarStoreName');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const sidebarStatus = document.getElementById('sidebarStatus');
    const storeToggle = document.getElementById('storeToggle');
    
    if (sidebarName) sidebarName.textContent = currentStore.name || 'Minha Loja';
    if (sidebarAvatar) sidebarAvatar.innerHTML = currentStore.imageUrl 
        ? `<img src="${currentStore.imageUrl}" alt="Logo">`
        : (currentStore.emoji || '🏪');
    
    const isOpen = currentStore.open !== false;
    if (sidebarStatus) {
        sidebarStatus.textContent = isOpen ? '🟢 Aberto' : '🔴 Fechado';
        sidebarStatus.className = 'store-status' + (isOpen ? '' : ' closed');
    }
    if (storeToggle) storeToggle.className = 'toggle' + (isOpen ? ' active' : '');
    
    // Form fields
    const fields = {
        storeName: currentStore.name || '',
        storeCategory: currentStore.category || 'Hambúrgueres',
        storeDescription: currentStore.description || '',
        storeDeliveryTime: currentStore.deliveryTime || '',
        storeDeliveryFee: currentStore.deliveryFee || '',
        storeAddress: currentStore.address || '',
        storePhone: currentStore.phone || ''
    };
    
    Object.entries(fields).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });
    
    const storeImageUpload = document.getElementById('storeImageUpload');
    if (currentStore.imageUrl && storeImageUpload) {
        storeImageUpload.classList.add('has-image');
        storeImageUpload.innerHTML = `<img src="${currentStore.imageUrl}" alt="Logo"><input type="file" id="storeImageInput" accept="image/*" onchange="handleStoreImageUpload(event)">`;
    }
    
    selectDeliveryType(currentStore.deliveryType || 'app', false);
}

async function loadAllData() {
    await Promise.all([loadOrders(), loadProducts(), loadCategories()]);
    updateDashboard();
}

async function loadOrders() {
    if (!currentStore) return;
    
    try {
        const snapshot = await db.collection('orders').where('storeId', '==', currentStore.id).get();
        
        orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
            const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
            return dateB - dateA;
        });
        
        orders.forEach(o => knownOrderIds.add(o.id));
        
        renderOrders();
        updatePendingBadge();
    } catch (err) {
        console.error('Error loading orders:', err);
    }
}

async function loadProducts() {
    if (!currentStore) return;
    
    try {
        const snapshot = await db.collection('products').where('storeId', '==', currentStore.id).get();
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderProducts();
    } catch (err) {
        console.error('Error loading products:', err);
    }
}

async function loadCategories() {
    categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    renderCategories();
    updateCategorySelect();
}

// ==================== REALTIME LISTENERS ====================

function setupRealtimeListeners() {
    if (!currentStore) return;
    
    db.collection('orders').where('storeId', '==', currentStore.id).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            const order = { id: change.doc.id, ...change.doc.data() };
            
            if (change.type === 'added') {
                const isNew = !knownOrderIds.has(order.id);
                
                if (isNew) {
                    knownOrderIds.add(order.id);
                    orders.unshift(order);
                    
                    if (order.status === 'pending') {
                        startNotificationLoop(order.id);
                        showNotificationPopup(order.id, order.userName || 'Cliente', order.total || 0);
                        showToast('🔔 Novo pedido recebido!');
                        
                        if (Notification.permission === 'granted') {
                            const notif = new Notification('🔔 Novo Pedido!', {
                                body: `#${order.id.slice(-6).toUpperCase()} - ${order.userName || 'Cliente'} - ${formatCurrency(order.total)}`,
                                icon: '/pedeai/icon-192.png',
                                tag: order.id,
                                requireInteraction: true
                            });
                            
                            notif.onclick = () => {
                                window.focus();
                                showPage('orders');
                                setTimeout(() => {
                                    const el = document.getElementById(`order-${order.id}`);
                                    if (el) {
                                        el.classList.add('expanded');
                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                }, 300);
                                notif.close();
                            };
                        }
                    }
                }
            } else if (change.type === 'modified') {
                const idx = orders.findIndex(o => o.id === order.id);
                if (idx !== -1) {
                    const oldStatus = orders[idx].status;
                    orders[idx] = order;
                    
                    if (oldStatus === 'pending' && order.status !== 'pending') {
                        clearOrderAlert(order.id);
                    }
                }
            } else if (change.type === 'removed') {
                orders = orders.filter(o => o.id !== order.id);
                knownOrderIds.delete(order.id);
                clearOrderAlert(order.id);
            }
        });
        
        checkAndClearAlerts();
        renderOrders();
        updateDashboard();
        updatePendingBadge();
    });
}

// ==================== NAVIGATION ====================

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const pageEl = document.getElementById(`${page}Page`);
    const titleEl = document.getElementById('pageTitle');
    
    if (pageEl) pageEl.classList.add('active');
    if (titleEl) {
        titleEl.textContent = { 
            dashboard: 'Dashboard', 
            orders: 'Pedidos', 
            products: 'Produtos', 
            categories: 'Categorias', 
            store: 'Minha Loja', 
            settings: 'Configurações' 
        }[page] || page;
    }
    
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.textContent.toLowerCase().includes(page) || (page === 'dashboard' && item.textContent.includes('Dashboard'))) {
            item.classList.add('active');
        }
    });
    
    closeSidebar();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
}

// ==================== DASHBOARD ====================

function updateDashboard() {
    const today = new Date(); 
    today.setHours(0, 0, 0, 0);
    const todayOrders = orders.filter(o => (o.createdAt?.toDate?.() || new Date(o.createdAt)) >= today);
    
    const statPending = document.getElementById('statPending');
    const statToday = document.getElementById('statToday');
    const statRevenue = document.getElementById('statRevenue');
    const statProducts = document.getElementById('statProducts');
    const recentContainer = document.getElementById('recentOrders');
    
    if (statPending) statPending.textContent = orders.filter(o => o.status === 'pending').length;
    if (statToday) statToday.textContent = todayOrders.length;
    if (statRevenue) statRevenue.textContent = formatCurrency(todayOrders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total || 0), 0));
    if (statProducts) statProducts.textContent = products.filter(p => p.active !== false).length;
    
    if (recentContainer) {
        const recent = orders.slice(0, 5);
        recentContainer.innerHTML = recent.length === 0 
            ? '<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">Nenhum pedido ainda</div></div>'
            : recent.map(o => renderOrderCard(o, true)).join('');
    }
}

function updatePendingBadge() {
    const badge = document.getElementById('pendingBadge');
    if (!badge) return;
    
    const pending = orders.filter(o => o.status === 'pending').length;
    badge.textContent = pending;
    badge.style.display = pending > 0 ? 'block' : 'none';
}

// ==================== UTILITIES ====================

function compressImageSquare(file, maxSize, quality) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const srcSize = Math.min(img.width, img.height);
                const cropX = (img.width - srcSize) / 2;
                const cropY = (img.height - srcSize) / 2;
                const finalSize = Math.min(srcSize, maxSize);
                canvas.width = finalSize;
                canvas.height = finalSize;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, cropX, cropY, srcSize, srcSize, 0, 0, finalSize, finalSize);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function openModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active'); 
}

function closeModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active'); 
}

function formatCurrency(v) { 
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0); 
}

function getStatusLabel(s) { 
    return { 
        pending: 'Pendente', 
        confirmed: 'Confirmado', 
        preparing: 'Preparando', 
        ready: 'Pronto', 
        delivering: 'Em entrega', 
        delivered: 'Entregue', 
        cancelled: 'Cancelado' 
    }[s] || s; 
}

function showToast(msg) { 
    const t = document.getElementById('toast'); 
    if (!t) return;
    t.textContent = msg; 
    t.classList.add('show'); 
    setTimeout(() => t.classList.remove('show'), 3000); 
}

function formatPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
        return `(${cleaned.slice(0,2)}) ${cleaned.slice(2,7)}-${cleaned.slice(7)}`;
    }
    if (cleaned.length === 10) {
        return `(${cleaned.slice(0,2)}) ${cleaned.slice(2,6)}-${cleaned.slice(6)}`;
    }
    return phone;
}

function showConfirmModal(title, text, onConfirm, confirmText = 'Confirmar', cancelText = 'Cancelar') {
    const titleEl = document.getElementById('confirmModalTitle');
    const textEl = document.getElementById('confirmModalText');
    const btnEl = document.getElementById('confirmModalBtn');
    const cancelEl = document.getElementById('confirmModalCancel');
    
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
    if (btnEl) {
        btnEl.textContent = confirmText;
        btnEl.onclick = () => {
            closeModal('confirmModal');
            if (onConfirm) onConfirm();
        };
    }
    if (cancelEl) cancelEl.textContent = cancelText;
    
    openModal('confirmModal');
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal').forEach(m => {
        m.addEventListener('click', (e) => { 
            if (e.target === m) m.classList.remove('active'); 
        });
    });
});
