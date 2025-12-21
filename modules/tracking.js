// ==================== TRACKING MODULE ====================
// Rastreamento em tempo real da localização do entregador

const TrackingModule = {
    map: null,
    driverMarker: null,
    customerMarker: null,
    routeLine: null,
    currentOrderId: null,
    unsubscribe: null,

    init() {
        // Carrega Leaflet CSS
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        // Carrega Leaflet JS
        if (!window.L) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => console.log('Leaflet loaded');
            document.head.appendChild(script);
        }
    },

    async openTracking(orderId) {
        const order = orders.find(o => o.id === orderId);
        if (!order) {
            showToast('Pedido não encontrado');
            return;
        }

        // Só permite rastrear pedidos em andamento
        if (!this.canTrack(order)) {
            showToast('Rastreamento não disponível');
            return;
        }

        this.currentOrderId = orderId;
        
        // Renderiza a página
        this.renderTrackingPage(order);
        showPage('tracking');

        // Aguarda Leaflet carregar
        await this.waitForLeaflet();
        
        // Inicializa o mapa
        setTimeout(() => {
            this.initMap(order);
            this.startLocationListener(orderId);
        }, 100);
    },

    waitForLeaflet() {
        return new Promise((resolve) => {
            if (window.L) {
                resolve();
            } else {
                const check = setInterval(() => {
                    if (window.L) {
                        clearInterval(check);
                        resolve();
                    }
                }, 100);
            }
        });
    },

    renderTrackingPage(order) {
        const page = document.getElementById('trackingPage');
        const hasDriver = order.status === 'delivering' && order.driverId;
        
        page.innerHTML = `
            <div class="tracking-header">
                <button class="tracking-back-btn" onclick="TrackingModule.closeTracking()">←</button>
                <div class="tracking-title">
                    <h2>🛵 Rastreando Entrega</h2>
                    <span class="tracking-order-id">Pedido #${order.id.slice(-6).toUpperCase()}</span>
                </div>
            </div>

            <div id="trackingMap" class="tracking-map"></div>

            <div class="tracking-info-panel">
                <div class="tracking-status-bar">
                    <div class="tracking-status-dot ${hasDriver ? 'active pulse' : ''}"></div>
                    <span class="tracking-status-text">${this.getStatusText(order)}</span>
                </div>

                <div class="tracking-driver-card" id="driverCard">
                    <div class="driver-avatar" id="trackingDriverAvatar">🏍️</div>
                    <div class="driver-info">
                        <div class="driver-name" id="driverName">${hasDriver ? (order.driverName || 'Entregador') : 'Aguardando entregador...'}</div>
                        <div class="driver-vehicle" id="driverVehicle">${order.driverVehicle || '-'}</div>
                    </div>
                    <div class="driver-actions" id="driverActions" style="display: ${order.driverPhone ? 'flex' : 'none'};">
                        <a class="driver-action-btn" href="tel:${order.driverPhone || ''}">📞</a>
                    </div>
                </div>

                <div class="tracking-address-card">
                    <div class="tracking-address-icon">📍</div>
                    <div class="tracking-address-info">
                        <div class="tracking-address-label">Entregar em</div>
                        <div class="tracking-address-text">${order.address.street}, ${order.address.number}</div>
                        <div class="tracking-address-neighborhood">${order.address.neighborhood}</div>
                    </div>
                </div>

                <div class="tracking-eta" id="trackingEta">
                    <span class="eta-icon">⏱️</span>
                    <span class="eta-text" id="etaText">${hasDriver ? 'Calculando tempo...' : 'Aguardando início da entrega'}</span>
                </div>

                <div class="tracking-live-indicator" id="liveIndicator" style="display: none;">
                    <span class="live-dot"></span>
                    <span>Localização em tempo real</span>
                </div>
            </div>
        `;
    },

    getStatusText(order) {
        const texts = {
            pending: '⏳ Aguardando confirmação da loja',
            confirmed: '✅ Pedido confirmado pela loja',
            preparing: '👨‍🍳 Preparando seu pedido',
            ready: '📦 Pronto! Aguardando entregador',
            delivering: '🛵 Entregador a caminho'
        };
        return texts[order.status] || 'Processando...';
    },

    initMap(order) {
        // Destrói mapa anterior
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        // Coordenadas do endereço ou padrão
        let centerLat = -15.8267;
        let centerLng = -47.9218;

        if (order.address?.location) {
            centerLat = order.address.location.lat;
            centerLng = order.address.location.lng;
        }

        // Cria o mapa
        this.map = L.map('trackingMap', {
            zoomControl: false
        }).setView([centerLat, centerLng], 15);

        // Tiles OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(this.map);

        // Controle de zoom
        L.control.zoom({ position: 'topright' }).addTo(this.map);

        // Marcador do cliente (destino)
        const customerIcon = L.divIcon({
            className: 'custom-marker customer-marker',
            html: '<div class="marker-pin customer">📍</div>',
            iconSize: [40, 40],
            iconAnchor: [20, 40]
        });

        this.customerMarker = L.marker([centerLat, centerLng], { icon: customerIcon })
            .addTo(this.map)
            .bindPopup('Seu endereço');

        // Marcador do entregador (inicia invisível)
        const driverIcon = L.divIcon({
            className: 'custom-marker driver-marker',
            html: '<div class="marker-pin driver">🛵</div>',
            iconSize: [50, 50],
            iconAnchor: [25, 25]
        });

        this.driverMarker = L.marker([centerLat, centerLng], { 
            icon: driverIcon,
            opacity: 0
        }).addTo(this.map);
    },

    startLocationListener(orderId) {
        // Cancela listener anterior
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        // Escuta mudanças no pedido
        this.unsubscribe = db.collection('orders').doc(orderId)
            .onSnapshot(doc => {
                if (!doc.exists) return;
                
                const order = { id: doc.id, ...doc.data() };
                
                // Atualiza status
                const statusText = document.querySelector('.tracking-status-text');
                const statusDot = document.querySelector('.tracking-status-dot');
                if (statusText) {
                    statusText.textContent = this.getStatusText(order);
                }
                if (statusDot) {
                    statusDot.classList.toggle('active', order.status === 'delivering');
                    statusDot.classList.toggle('pulse', order.status === 'delivering');
                }

                // Atualiza info do entregador
                if (order.driver || order.driverName) {
                    this.updateDriverInfo(order);
                }

                // Atualiza localização no mapa
                if (order.driverLocation) {
                    this.updateDriverLocation(order.driverLocation, order.address?.location);
                    document.getElementById('liveIndicator').style.display = 'flex';
                }

                // Se entregue, fecha o rastreamento
                if (order.status === 'delivered') {
                    showToast('🎉 Pedido entregue!');
                    setTimeout(() => this.closeTracking(), 2000);
                }
            });
    },

    updateDriverInfo(order) {
        const nameEl = document.getElementById('driverName');
        const vehicleEl = document.getElementById('driverVehicle');
        const actionsEl = document.getElementById('driverActions');
        const avatarEl = document.getElementById('trackingDriverAvatar');

        const driver = order.driver || {};
        
        if (nameEl) nameEl.textContent = driver.name || order.driverName || 'Entregador';
        if (vehicleEl) vehicleEl.textContent = driver.vehicle || order.driverVehicle || 'Moto';
        
        // Foto do entregador
        if (avatarEl && driver.photoUrl) {
            avatarEl.style.backgroundImage = `url(${driver.photoUrl})`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';
            avatarEl.textContent = '';
        }
        
        // Botão de ligar
        const phone = driver.phone || order.driverPhone;
        if (phone && actionsEl) {
            actionsEl.innerHTML = `<a class="driver-action-btn" href="tel:${phone}">📞</a>`;
            actionsEl.style.display = 'flex';
        }
    },

    updateDriverLocation(driverLocation, customerLocation) {
        if (!this.map || !this.driverMarker) return;

        const driverLat = driverLocation.lat;
        const driverLng = driverLocation.lng;

        // Atualiza marcador com animação suave
        this.driverMarker.setLatLng([driverLat, driverLng]);
        this.driverMarker.setOpacity(1);

        // Remove linha anterior
        if (this.routeLine) {
            this.map.removeLayer(this.routeLine);
        }

        // Desenha linha tracejada
        if (customerLocation) {
            this.routeLine = L.polyline([
                [driverLat, driverLng],
                [customerLocation.lat, customerLocation.lng]
            ], {
                color: '#6366f1',
                weight: 4,
                opacity: 0.7,
                dashArray: '10, 10'
            }).addTo(this.map);

            // Ajusta zoom para mostrar ambos
            const bounds = L.latLngBounds([
                [driverLat, driverLng],
                [customerLocation.lat, customerLocation.lng]
            ]);
            this.map.fitBounds(bounds, { padding: [50, 50] });

            // Calcula ETA
            this.updateETA(driverLat, driverLng, customerLocation.lat, customerLocation.lng);
        } else {
            this.map.setView([driverLat, driverLng], 16);
        }

        // Timestamp da última atualização
        if (driverLocation.updatedAt) {
            const time = new Date(driverLocation.updatedAt).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            this.driverMarker.bindPopup(`🛵 Atualizado: ${time}`);
        }
    },

    updateETA(driverLat, driverLng, customerLat, customerLng) {
        // Fórmula de Haversine para distância
        const R = 6371;
        const dLat = (customerLat - driverLat) * Math.PI / 180;
        const dLng = (customerLng - driverLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(driverLat * Math.PI / 180) * Math.cos(customerLat * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;

        // Estima tempo (25km/h média urbana)
        const timeMinutes = Math.ceil((distance / 25) * 60);

        const etaText = document.getElementById('etaText');
        if (etaText) {
            if (distance < 0.1) {
                etaText.innerHTML = '🎉 Entregador chegando!';
                document.getElementById('trackingEta').classList.add('arriving');
            } else {
                etaText.innerHTML = `~${timeMinutes} min (${distance.toFixed(1)} km)`;
            }
        }
    },

    closeTracking() {
        // Para o listener
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        // Limpa o mapa
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        this.driverMarker = null;
        this.customerMarker = null;
        this.routeLine = null;
        this.currentOrderId = null;

        showPage('orders');
    },

    // Verifica se pedido pode ser rastreado
    canTrack(order) {
        return ['confirmed', 'preparing', 'ready', 'delivering'].includes(order.status);
    }
};

// Exportar
window.TrackingModule = TrackingModule;

function setManualLocation() {
    const lat = parseFloat(document.getElementById('manualLat').value);
    const lng = parseFloat(document.getElementById('manualLng').value);
    if (isNaN(lat) || isNaN(lng)) return showToast('Coordenadas inválidas');
    capturedLocation = { lat, lng, accuracy: 0, manual: true };
    document.getElementById('addressLocationStatus').innerHTML = `<span class="location-icon">✅</span><span>Localização manual definida</span>`;
    document.getElementById('addressLocationStatus').className = 'location-status success';
    showToast('Localização definida!');
}