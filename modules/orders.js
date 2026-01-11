// ==================== ORDERS MODULE ====================

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

// ==================== ADDRESSES ====================

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

function populateNeighborhoodSelect() {
    const select = document.getElementById('addressNeighborhood');
    select.innerHTML = '<option value="">Selecione o bairro</option>' +
        deliveryFees.map(f => `<option value="${f.name}">${f.name} - ${formatCurrency(f.fee)}</option>`).join('');
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