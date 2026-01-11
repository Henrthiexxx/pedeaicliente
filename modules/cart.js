// ==================== CART MODULE ====================

// ==================== STORES & PRODUCTS ====================

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

// ==================== PRODUCT MODAL ====================

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

// ==================== CART ====================

function addToCart(product, qty = 1) {
    if (cart.length > 0 && cart[0].storeId !== selectedStore.id) {
        if (!confirm(`Limpar carrinho de ${cart[0].storeName} e adicionar de ${selectedStore.name}?`)) {
            return;
        }
        cart = [];
        appliedCoupon = null;
    }
    
    const existing = cart.find(item => item.id === product.id);
    
    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            emoji: product.emoji,
            imageUrl: product.imageUrl || null,
            storeId: selectedStore.id,
            storeName: selectedStore.name,
            qty
        });
    }
    
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