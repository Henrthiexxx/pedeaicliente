// ==================== NOTIFICATION SYSTEM ====================

let notificationInterval = null;
let pendingAlertOrders = new Set();

function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        function beep(frequency, duration, startTime) {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.4, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        }
        
        const now = audioCtx.currentTime;
        beep(600, 0.12, now);
        beep(800, 0.12, now + 0.15);
        beep(1000, 0.2, now + 0.3);
        
    } catch (e) {
        console.log('Erro ao tocar som:', e);
    }
    
    if (navigator.vibrate) {
        navigator.vibrate([300, 100, 300, 100, 300]);
    }
}

function startNotificationLoop(orderId) {
    pendingAlertOrders.add(orderId);
    
    if (notificationInterval) return;
    
    playNotificationSound();
    
    notificationInterval = setInterval(() => {
        if (pendingAlertOrders.size > 0) {
            playNotificationSound();
        } else {
            stopNotificationLoop();
        }
    }, 5000);
}

function stopNotificationLoop() {
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
    }
}

function clearOrderAlert(orderId) {
    pendingAlertOrders.delete(orderId);
    
    if (pendingAlertOrders.size === 0) {
        stopNotificationLoop();
        closeNotificationPopup();
    }
}

function checkAndClearAlerts() {
    const pendingOrderIds = orders.filter(o => o.status === 'pending').map(o => o.id);
    
    pendingAlertOrders.forEach(orderId => {
        if (!pendingOrderIds.includes(orderId)) {
            clearOrderAlert(orderId);
        }
    });
}

function showNotificationPopup(orderId, customerName, total) {
    const popup = document.getElementById('notificationPopup');
    const body = document.getElementById('notificationPopupBody');
    
    if (!popup || !body) return;
    
    body.textContent = `#${orderId.slice(-6).toUpperCase()} - ${customerName} - ${formatCurrency(total)}`;
    popup.classList.add('show');
    popup.dataset.orderId = orderId;
}

function closeNotificationPopup() {
    const popup = document.getElementById('notificationPopup');
    if (popup) popup.classList.remove('show');
}

function handleNewOrderNotification(data, message) {
    playNotificationSound();
    showToast('🔔 ' + (message || 'Novo pedido recebido!'));
    
    if (data.orderId) {
        showNotificationPopup(data.orderId, data.customerName || 'Cliente', parseFloat(data.total) || 0);
    }
}

async function requestNotificationPermission() {
    if (!currentStore) {
        showToast('Faça login primeiro');
        return;
    }
    
    if (Notification.permission === 'granted') {
        showToast('Notificações já ativas!');
        if (typeof setupStorePushNotifications === 'function') {
            await setupStorePushNotifications(currentStore.id);
        }
        updateNotificationButton();
        return;
    }
    
    if (Notification.permission === 'denied') {
        showToast('Notificações bloqueadas. Libere nas configurações do navegador.');
        return;
    }
    
    if (typeof setupStorePushNotifications === 'function') {
        await setupStorePushNotifications(currentStore.id);
    }
    
    if (Notification.permission === 'granted') {
        showToast('🔔 Notificações ativadas!');
    } else {
        showToast('Permissão negada');
    }
    
    updateNotificationButton();
}

function updateNotificationButton() {
    const btn = document.getElementById('notifBtn');
    if (!btn) return;
    
    if (Notification.permission === 'granted') {
        btn.textContent = '🔔';
        btn.title = 'Notificações ativas';
        btn.classList.add('active');
    } else if (Notification.permission === 'denied') {
        btn.textContent = '🔕';
        btn.title = 'Notificações bloqueadas';
    } else {
        btn.textContent = '🔔';
        btn.title = 'Clique para ativar notificações';
    }
}

// Notification popup click handler
document.addEventListener('DOMContentLoaded', () => {
    const popup = document.getElementById('notificationPopup');
    if (popup) {
        popup.addEventListener('click', (e) => {
            if (e.target.classList.contains('notification-popup-close')) return;
            
            const orderId = popup.dataset.orderId;
            if (orderId) {
                showPage('orders');
                setTimeout(() => {
                    const orderEl = document.getElementById(`order-${orderId}`);
                    if (orderEl) {
                        orderEl.classList.add('expanded');
                        orderEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 300);
            }
            closeNotificationPopup();
        });
    }
});

// ==================== ORDERS ====================

function filterOrders(filter) {
    orderFilter = filter;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');
    renderOrders();
}

function renderOrders() {
    const container = document.getElementById('ordersList');
    if (!container) return;
    
    const filtered = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter);
    
    container.innerHTML = filtered.length === 0 
        ? '<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-title">Nenhum pedido</div></div>'
        : filtered.map(o => renderOrderCard(o)).join('');
}

function renderOrderCard(order) {
    const date = order.createdAt?.toDate?.() || new Date(order.createdAt);
    const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const isPending = order.status === 'pending';
    
    const customerName = order.userName || order.customerName || 'Cliente';
    const customerPhone = order.userPhone || order.phone || '';
    const customerCpf = order.userCpf || order.cpf || '';
    
    const addr = order.address || {};
    const fullAddress = [
        addr.street,
        addr.number ? `nº ${addr.number}` : '',
        addr.complement || '',
        addr.neighborhood || '',
        addr.city || '',
        addr.cep ? `CEP: ${addr.cep}` : ''
    ].filter(Boolean).join(', ');
    const reference = addr.reference || '';
    
    const paymentLabels = {
        pix: '💠 PIX', credit: '💳 Crédito', debit: '💳 Débito',
        cash: '💵 Dinheiro', picpay: '💚 PicPay', food_voucher: '🎫 Vale Alimentação'
    };
    const paymentMethod = paymentLabels[order.paymentMethod] || order.paymentMethod || 'Não informado';
    const needChange = order.needChange && order.changeFor ? `Troco para ${formatCurrency(order.changeFor)}` : '';
    
    const deliveryMode = order.deliveryMode === 'pickup' ? '🏃 Retirada no local' : '🛵 Entrega';
    const deliveryFee = order.deliveryFee || 0;
    const subtotal = (order.total || 0) - deliveryFee;
    const notes = order.notes || order.observation || '';
    
    return `<div class="order-card ${isPending ? 'new-order' : ''}">
        <div class="order-header" onclick="toggleOrder('${order.id}')">
            <div>
                <div class="order-id">#${order.id.slice(-6).toUpperCase()}</div>
                <div class="order-time">${dateStr} ${timeStr}</div>
            </div>
            <span class="order-status status-${order.status}">${getStatusLabel(order.status)}</span>
        </div>
        <div class="order-body" id="order-${order.id}">
            <div class="order-section">
                <div class="order-section-title">👤 Cliente</div>
                <div class="order-section-content">
                    <div class="order-detail-row"><span class="order-detail-label">Nome</span><span class="order-detail-value">${customerName}</span></div>
                    ${customerPhone ? `<div class="order-detail-row"><span class="order-detail-label">Telefone</span><a href="tel:${customerPhone}" class="order-detail-value order-phone">${formatPhone(customerPhone)}</a><a href="https://wa.me/55${customerPhone.replace(/\D/g, '')}" target="_blank" class="btn-whatsapp" title="Abrir WhatsApp">💬</a></div>` : ''}
                    ${customerCpf ? `<div class="order-detail-row"><span class="order-detail-label">CPF</span><span class="order-detail-value">${customerCpf}</span></div>` : ''}
                </div>
            </div>
            <div class="order-section">
                <div class="order-section-title">${deliveryMode}</div>
                <div class="order-section-content">
                    ${order.deliveryMode !== 'pickup' ? `<div class="order-address-full"><div class="order-address-label">${addr.label || 'Endereço'}</div><div class="order-address-text">${fullAddress || 'Não informado'}</div>${reference ? `<div class="order-address-ref">📍 Ref: ${reference}</div>` : ''}</div>` : `<div class="order-pickup-info">Cliente irá retirar no estabelecimento</div>`}
                </div>
            </div>
            <div class="order-section">
                <div class="order-section-title">🛒 Itens do Pedido</div>
                <div class="order-items">
                    ${order.items.map(i => `<div class="order-item"><span class="order-item-qty">${i.qty}x</span><span class="order-item-name">${i.name}${i.addons?.length ? `<small class="order-item-addons">(${i.addons.map(a => a.name).join(', ')})</small>` : ''}${i.observation ? `<small class="order-item-obs">Obs: ${i.observation}</small>` : ''}</span><span class="order-item-price">${formatCurrency((i.price + (i.addons?.reduce((s,a) => s + a.price, 0) || 0)) * i.qty)}</span></div>`).join('')}
                </div>
            </div>
            ${notes ? `<div class="order-section"><div class="order-section-title">📝 Observações</div><div class="order-notes">${notes}</div></div>` : ''}
            <div class="order-section">
                <div class="order-section-title">💰 Pagamento</div>
                <div class="order-section-content">
                    <div class="order-detail-row"><span class="order-detail-label">Forma</span><span class="order-detail-value">${paymentMethod}</span></div>
                    ${needChange ? `<div class="order-detail-row"><span class="order-detail-label">Troco</span><span class="order-detail-value">${needChange}</span></div>` : ''}
                    <div class="order-totals">
                        <div class="order-total-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
                        ${deliveryFee > 0 ? `<div class="order-total-row"><span>Taxa de entrega</span><span>${formatCurrency(deliveryFee)}</span></div>` : ''}
                        <div class="order-total-row total"><span>Total</span><span>${formatCurrency(order.total)}</span></div>
                    </div>
                </div>
            </div>
            <div class="order-actions">${getOrderActions(order)}</div>
        </div>
    </div>`;
}

function getOrderActions(order) {
    const actions = {
        pending: `<button class="btn btn-success btn-sm" onclick="updateOrderStatus('${order.id}', 'confirmed')">✓ Aceitar</button><button class="btn btn-danger btn-sm" onclick="updateOrderStatus('${order.id}', 'cancelled')">✗ Recusar</button>`,
        confirmed: `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${order.id}', 'preparing')">🍳 Iniciar Preparo</button>`,
        preparing: `<button class="btn btn-warning btn-sm" onclick="updateOrderStatus('${order.id}', 'ready')">✓ Pronto</button>`,
        ready: `<button class="btn btn-success btn-sm" onclick="updateOrderStatus('${order.id}', 'delivering')">🛵 Saiu para Entrega</button>`,
        delivering: `<button class="btn btn-success btn-sm" onclick="updateOrderStatus('${order.id}', 'delivered')">✓ Entregue</button>`
    };
    return actions[order.status] || '';
}

function toggleOrder(orderId) { 
    const el = document.getElementById(`order-${orderId}`);
    if (el) el.classList.toggle('expanded'); 
}

async function updateOrderStatus(orderId, status) {
    try {
        const timeline = orders.find(o => o.id === orderId)?.timeline || [];
        timeline.push({ status, timestamp: new Date().toISOString(), message: getStatusLabel(status) });
        await db.collection('orders').doc(orderId).update({ status, timeline, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        
        clearOrderAlert(orderId);
        showToast(`Pedido: ${getStatusLabel(status)}`);
    } catch (err) { 
        showToast('Erro ao atualizar'); 
    }
}

// ==================== PRODUCTS ====================

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  const searchInput = document.getElementById('searchInput');
  const search = (searchInput?.value || '').toLowerCase();

  let filtered = products;

  if (activeCategory !== 'all') {
    filtered = filtered.filter(p => p.category === activeCategory);
  }

  if (search) {
    filtered = filtered.filter(p =>
      (p.name || '').toLowerCase().includes(search) ||
      (p.description || '').toLowerCase().includes(search)
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">Nenhum produto encontrado</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const rawUrl = (p.imageUrl || '').trim();
    const ok = hasImageUrl(rawUrl);
    const safeUrl = ok ? encodeURI(rawUrl) : '';

    return `
      <div class="product-card" onclick="openProductModal('${p.id}')">
        <div class="product-img ${ok ? 'has-image' : ''}">
          ${ok
            ? `<img src="${safeUrl}" alt=""
                 onerror="this.remove();this.parentElement.classList.remove('has-image');this.parentElement.innerHTML='${p.emoji || '🍽️'}'">`
            : (p.emoji || '🍽️')
          }
        </div>
        <div class="product-info">
          <div class="product-name">${p.name || ''}</div>
          <div class="product-desc">${p.description || ''}</div>
          <div class="product-price">${formatCurrency(p.price)}</div>
        </div>
      </div>
    `;
  }).join('');
}


function filterProductsList() { renderProducts(); }

function initEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (!picker) return;
    picker.innerHTML = foodEmojis.map(e => `<div class="emoji-item ${e === selectedEmoji ? 'selected' : ''}" onclick="selectEmoji('${e}')">${e}</div>`).join('');
}

function selectEmoji(emoji) {
    selectedEmoji = emoji;
    document.querySelectorAll('.emoji-item').forEach(el => el.classList.toggle('selected', el.textContent === emoji));
    productImageData = null;
    
    const upload = document.getElementById('productImageUpload');
    const placeholder = document.getElementById('productImagePlaceholder');
    if (upload) upload.classList.remove('has-image');
    if (placeholder) placeholder.innerHTML = `<span>📷</span><div>Clique para enviar (quadrada)</div>`;
}

// ==================== ADDONS ====================

function renderAddons() {
    const container = document.getElementById('addonsList');
    if (!container) return;
    
    if (productAddons.length === 0) {
        container.innerHTML = '<div class="addon-empty">Nenhum adicional cadastrado</div>';
        return;
    }
    container.innerHTML = productAddons.map((addon, idx) => `
        <div class="addon-item" draggable="true" ondragstart="dragAddon(event, ${idx})" ondragover="event.preventDefault()" ondrop="dropAddon(event, ${idx})">
            <span class="addon-drag">⋮⋮</span>
            <input type="text" class="form-input addon-name" value="${addon.name}" onchange="updateAddon(${idx}, 'name', this.value)">
            <input type="number" class="form-input addon-price" value="${addon.price}" step="0.50" onchange="updateAddon(${idx}, 'price', parseFloat(this.value) || 0)">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeAddon(${idx})">×</button>
        </div>
    `).join('');
}

function addAddon() {
    const nameInput = document.getElementById('newAddonName');
    const priceInput = document.getElementById('newAddonPrice');
    const name = nameInput?.value?.trim();
    const price = parseFloat(priceInput?.value) || 0;
    
    if (!name) { showToast('Digite o nome do adicional'); return; }
    
    productAddons.push({ name, price, order: productAddons.length });
    if (nameInput) nameInput.value = '';
    if (priceInput) priceInput.value = '';
    renderAddons();
}

function updateAddon(idx, field, value) { productAddons[idx][field] = value; }
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

// ==================== PRODUCT MODAL ====================

function openProductModal() {
    const fields = ['productId', 'productName', 'productDescription', 'productPrice'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    const categoryEl = document.getElementById('productCategory');
    if (categoryEl) categoryEl.value = categories[0] || '';
    
    const toggleEl = document.getElementById('productActiveToggle');
    if (toggleEl) toggleEl.classList.add('active');
    
    const titleEl = document.getElementById('productModalTitle');
    if (titleEl) titleEl.textContent = 'Novo Produto';
    
    productImageData = null;
    const upload = document.getElementById('productImageUpload');
    const placeholder = document.getElementById('productImagePlaceholder');
    if (upload) upload.classList.remove('has-image');
    if (placeholder) placeholder.innerHTML = `<span>📷</span><div>Clique para enviar (quadrada)</div>`;
    
    selectedEmoji = '🍔';
    productAddons = [];
    initEmojiPicker();
    renderAddons();
    openModal('productModal');
}

function editProduct(productId) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    
    setVal('productId', p.id);
    setVal('productName', p.name);
    setVal('productDescription', p.description || '');
    setVal('productPrice', p.price);
    setVal('productCategory', p.category || '');
    
    const titleEl = document.getElementById('productModalTitle');
    if (titleEl) titleEl.textContent = 'Editar Produto';
    
    const toggleEl = document.getElementById('productActiveToggle');
    if (toggleEl) toggleEl.classList.toggle('active', p.active !== false);
    
    const upload = document.getElementById('productImageUpload');
    const placeholder = document.getElementById('productImagePlaceholder');
    
    if (p.imageUrl && upload) {
        upload.classList.add('has-image');
        upload.innerHTML = `<img src="${p.imageUrl}"><input type="file" id="productImageInput" accept="image/*" onchange="handleProductImageUpload(event)">`;
    } else {
        if (upload) upload.classList.remove('has-image');
        if (placeholder) placeholder.innerHTML = `<span>📷</span><div>Clique para enviar (quadrada)</div>`;
    }
    
    selectedEmoji = p.emoji || '🍔';
    productAddons = (p.addons || []).map((a, i) => ({ ...a, order: a.order ?? i }));
    productAddons.sort((a, b) => a.order - b.order);
    initEmojiPicker();
    renderAddons();
    openModal('productModal');
}

async function handleProductImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    productImageData = await compressImageSquare(file, 480, 0.75);
    const upload = document.getElementById('productImageUpload');
    if (upload) {
        upload.classList.add('has-image');
        upload.innerHTML = `<img src="${productImageData}"><input type="file" id="productImageInput" accept="image/*" onchange="handleProductImageUpload(event)">`;
    }
}

async function saveProduct() {
    const id = document.getElementById('productId')?.value;
    const name = document.getElementById('productName')?.value?.trim();
    const price = parseFloat(document.getElementById('productPrice')?.value);
    
    if (!name || !price) { showToast('Preencha nome e preço'); return; }
    
    try {
        const data = {
            name,
            description: document.getElementById('productDescription')?.value?.trim() || '',
            price,
            category: document.getElementById('productCategory')?.value || '',
            active: document.getElementById('productActiveToggle')?.classList.contains('active') ?? true,
            emoji: selectedEmoji,
            addons: productAddons.map((a, i) => ({ name: a.name, price: a.price, order: i })),
            storeId: currentStore.id,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (productImageData?.startsWith('data:')) data.imageUrl = productImageData;
        
        if (id) {
            await db.collection('products').doc(id).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('products').add(data);
        }
        
        closeModal('productModal');
        await loadProducts();
        loadCategories();
        showToast('Produto salvo!');
    } catch (err) { console.error(err); showToast('Erro ao salvar'); }
}

function confirmDeleteProduct(productId) {
    const p = products.find(x => x.id === productId);
    showConfirmModal('Excluir produto?', `"${p?.name || 'Produto'}" será removido permanentemente.`, () => deleteProduct(productId), 'Excluir');
}

async function deleteProduct(productId) {
    try { 
        await db.collection('products').doc(productId).delete(); 
        await loadProducts(); 
        showToast('Excluído'); 
    } catch (err) { showToast('Erro'); }
}

function updateCategorySelect() {
    const select = document.getElementById('productCategory');
    if (!select) return;
    select.innerHTML = categories.length > 0 
        ? categories.map(c => `<option value="${c}">${c}</option>`).join('')
        : '<option value="">Adicione categoria primeiro</option>';
}

// ==================== CATEGORIES ====================

function renderCategories() {
    const container = document.getElementById('categoriesList');
    if (!container) return;
    
    container.innerHTML = categories.length === 0 
        ? '<div class="empty-state"><div class="empty-state-icon">📁</div><div class="empty-state-title">Nenhuma categoria</div></div>'
        : categories.map(c => `<div class="card" style="display: flex; justify-content: space-between; align-items: center;"><div><strong>${c}</strong><div style="color: var(--text-muted); font-size: 0.9rem;">${products.filter(p => p.category === c).length} produtos</div></div><button class="btn btn-danger btn-sm" onclick="confirmDeleteCategory('${c}')">🗑️</button></div>`).join('');
}

function openCategoryModal() { 
    const input = document.getElementById('categoryName');
    if (input) input.value = ''; 
    openModal('categoryModal'); 
}

async function saveCategory() {
    const name = document.getElementById('categoryName')?.value?.trim();
    if (!name) { showToast('Digite o nome'); return; }
    if (categories.includes(name)) { showToast('Já existe'); return; }
    categories.push(name);
    renderCategories();
    updateCategorySelect();
    closeModal('categoryModal');
    showToast('Criada');
}

function confirmDeleteCategory(cat) {
    const count = products.filter(p => p.category === cat).length;
    if (count > 0) { showToast(`Remova ${count} produtos primeiro`); return; }
    showConfirmModal('Excluir categoria?', `"${cat}" será removida.`, () => deleteCategory(cat), 'Excluir');
}

async function deleteCategory(cat) {
    categories = categories.filter(c => c !== cat);
    renderCategories();
    updateCategorySelect();
    showToast('Removida');
}

// ==================== STORE SETTINGS ====================

async function handleStoreImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    storeImageData = await compressImageSquare(file, 400, 0.8);
    const upload = document.getElementById('storeImageUpload');
    if (upload) {
        upload.classList.add('has-image');
        upload.innerHTML = `<img src="${storeImageData}"><input type="file" id="storeImageInput" accept="image/*" onchange="handleStoreImageUpload(event)">`;
    }
}

async function saveStoreInfo() {
    try {
        const data = {
            name: document.getElementById('storeName')?.value || '',
            category: document.getElementById('storeCategory')?.value || '',
            description: document.getElementById('storeDescription')?.value || '',
            deliveryTime: document.getElementById('storeDeliveryTime')?.value || '',
            deliveryFee: parseFloat(document.getElementById('storeDeliveryFee')?.value) || 0,
            address: document.getElementById('storeAddress')?.value || '',
            phone: document.getElementById('storePhone')?.value || '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (storeImageData?.startsWith('data:')) data.imageUrl = storeImageData;
        
        await db.collection('stores').doc(currentStore.id).update(data);
        currentStore = { ...currentStore, ...data };
        updateStoreUI();
        showToast('Salvo!');
    } catch (err) { console.error(err); showToast('Erro'); }
}

async function toggleStoreStatus() {
    const newStatus = currentStore.open === false;
    try {
        await db.collection('stores').doc(currentStore.id).update({ open: newStatus });
        currentStore.open = newStatus;
        updateStoreUI();
        showToast(newStatus ? 'Aberta!' : 'Fechada!');
    } catch (err) { showToast('Erro'); }
}

function selectDeliveryType(type, save = true) {
    ['deliveryApp', 'deliveryOwn', 'deliveryBoth'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('selected');
    });
    const targetId = type === 'app' ? 'deliveryApp' : type === 'own' ? 'deliveryOwn' : 'deliveryBoth';
    const target = document.getElementById(targetId);
    if (target) target.classList.add('selected');
    if (save && currentStore) currentStore.deliveryType = type;
}

function toggleSetting(setting) { 
    const toggle = document.getElementById(`${setting}Toggle`);
    if (toggle) toggle.classList.toggle('active'); 
}

async function saveSettings() {
    try {
        const deliveryApp = document.getElementById('deliveryApp');
        const deliveryOwn = document.getElementById('deliveryOwn');
        
        const deliveryType = deliveryApp?.classList.contains('selected') ? 'app' 
            : deliveryOwn?.classList.contains('selected') ? 'own' : 'both';
        
        await db.collection('stores').doc(currentStore.id).update({
            deliveryType,
            settings: {
                soundEnabled: document.getElementById('soundToggle')?.classList.contains('active') ?? true,
                autoAccept: document.getElementById('autoAcceptToggle')?.classList.contains('active') ?? false,
                weekdayOpen: document.getElementById('weekdayOpen')?.value || '18:00',
                weekdayClose: document.getElementById('weekdayClose')?.value || '23:00',
                weekendOpen: document.getElementById('weekendOpen')?.value || '11:00',
                weekendClose: document.getElementById('weekendClose')?.value || '23:00'
            }
        });
        showToast('Salvo!');
    } catch (err) { showToast('Erro'); }
}
