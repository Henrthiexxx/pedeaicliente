// ==================== FIREBASE ====================
const firebaseConfig = {
  apiKey: "AIzaSyAnIJRcUxN-0swpVnonPbJjTSK87o4CQ_g",
  authDomain: "pedrad-814d0.firebaseapp.com",
  projectId: "pedrad-814d0",
  storageBucket: "pedrad-814d0.appspot.com",
  messagingSenderId: "293587190550",
  appId: "1:293587190550:web:80c9399f82847c80e20637"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// ==================== UI ====================
const UIModal = (() => {
  const el = document.getElementById('uiModal');
  const titleEl = document.getElementById('uiModalTitle');
  const textEl = document.getElementById('uiModalText');
  const okBtn = document.getElementById('uiModalOk');
  const cancelBtn = document.getElementById('uiModalCancel');

  function open({ title = 'Aviso', text = '', okText = 'OK', cancelText = 'Cancelar', showCancel = false }) {
    titleEl.textContent = title;
    textEl.textContent = text;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;
    cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
  }

  function close() {
    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
  }

  function alert({ title = 'Aviso', text = '', okText = 'OK' }) {
    return new Promise(resolve => {
      open({ title, text, okText, showCancel: false });
      okBtn.onclick = () => { close(); resolve(true); };
      cancelBtn.onclick = null;
    });
  }

  function confirm({ title = 'Confirmar', text = '', okText = 'Confirmar', cancelText = 'Cancelar' }) {
    return new Promise(resolve => {
      open({ title, text, okText, cancelText, showCancel: true });
      okBtn.onclick = () => { close(); resolve(true); };
      cancelBtn.onclick = () => { close(); resolve(false); };
    });
  }

  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });

  return { alert, confirm };
})();

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ==================== STATE ====================
const LS = {
  cart: 'cart',
  storeId: 'checkoutStoreId',
  storeCache: 'cache_store_',
  feesCache: 'cache_deliveryFees_v1',
  addrCache: 'cache_addresses_v1_',
  cartDigest: 'cache_cart_digest_v1',
  checkoutOrigin: 'checkoutOrigin',
  checkoutRole: 'checkoutRole'
};

let cart = [];
let store = null;
let user = null;

let deliveryMode = 'delivery';
let selectedAddressId = null;
let selectedPayment = 'pix';

let deliveryFees = [];
let addresses = [];

const TTL_STORE_MS = 1000 * 60 * 60 * 24 * 30;
const TTL_ADDR_MS = 1000 * 60 * 60 * 24 * 30;
const TTL_FEES_MS = 1000 * 60 * 60 * 24 * 7;

// ==================== CACHE HELPERS ====================
function now() {
  return Date.now();
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch (_) {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function isFresh(cacheObj, ttlMs) {
  if (!cacheObj || !cacheObj.ts) return false;
  return (now() - cacheObj.ts) < ttlMs;
}

// ==================== CART ====================
function parseCartAny(raw) {
  try {
    const obj = JSON.parse(raw);
    if (Array.isArray(obj)) return obj;
    if (obj && Array.isArray(obj.items)) return obj.items;
    if (obj && Array.isArray(obj.cart)) return obj.cart;
  } catch (_) {}
  return [];
}

function readCartRawByUid(uid) {
  const a = localStorage.getItem('cart');
  const b = uid ? localStorage.getItem(`cart_${uid}`) : null;
  const c = localStorage.getItem('LS_CART');
  const d = localStorage.getItem('pedrad_cart');
  const e = localStorage.getItem('cartItems');
  return [a, b, c, d, e].filter(Boolean);
}

function normalizeCart(list) {
  return (Array.isArray(list) ? list : []).map((it) => {
    const addons = it.addons || it.adicionais || it.extras || [];
    const normAddons = (Array.isArray(addons) ? addons : []).map(a => ({
      name: a.name ?? a.nome ?? '',
      price: Number(a.price ?? a.preco ?? 0) || 0
    })).filter(a => a.name);

    return {
      id: it.id ?? it.productId ?? it.prodId ?? it.sku ?? '',
      name: it.name ?? it.nome ?? 'Item',
      qty: Number(it.qty ?? it.qtd ?? it.quantidade ?? 1) || 1,
      price: Number(it.price ?? it.preco ?? it.valor ?? 0) || 0,
      addons: normAddons,
      observation: it.observation ?? it.obs ?? it.observacao ?? it.note ?? '',
      storeId: it.storeId ?? it.lojaId ?? null,
      storeName: it.storeName ?? it.nomeLoja ?? null
    };
  }).filter(i => i.qty > 0);
}

function loadCartFromStorage(uid) {
  const raws = readCartRawByUid(uid);
  for (const raw of raws) {
    const list = parseCartAny(raw);
    if (Array.isArray(list) && list.length) return normalizeCart(list);
  }
  return [];
}

function syncCart(uid) {
  cart = loadCartFromStorage(uid);
  renderCartOptimized(true);
  updateTotals();
}

// ==================== CONTEXT / CLASSIFICATION ====================
function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

function normalizeOrigin(value) {
  const v = String(value || '').trim().toLowerCase();

  if (['store', 'loja', 'painel', 'store_panel', 'seller'].includes(v)) return 'store';
  if (['app', 'cliente', 'customer', 'user', 'site'].includes(v)) return 'app';

  return '';
}

function normalizeRole(value) {
  const v = String(value || '').trim().toLowerCase();

  if (['store', 'loja', 'seller', 'shop'].includes(v)) return 'store';
  if (['admin', 'adm'].includes(v)) return 'admin';
  if (['customer', 'client', 'cliente', 'user', 'app'].includes(v)) return 'customer';

  return '';
}

function detectSalesChannel() {
  const fromQuery = normalizeOrigin(getParam('origin'));
  if (fromQuery) return fromQuery;

  const fromLocalStorage = normalizeOrigin(localStorage.getItem(LS.checkoutOrigin));
  if (fromLocalStorage) return fromLocalStorage;

  return 'app';
}

function detectCreatedByRole() {
  const fromQuery = normalizeRole(getParam('createdBy') || getParam('role'));
  if (fromQuery) return fromQuery;

  const fromLocalStorage = normalizeRole(localStorage.getItem(LS.checkoutRole));
  if (fromLocalStorage) return fromLocalStorage;

  const channel = detectSalesChannel();
  if (channel === 'store') return 'store';
  return 'customer';
}

// ==================== DISPATCH POOL (NOVO) ====================
// Consulta a loja pra saber se tem entregadores vinculados.
// Se tem → pool 'store' (só os vinculados pegam).
// Se não → pool 'app' (entregadores avulsos pegam).
async function resolveDeliveryPoolByStore(orderType, storeId) {
  if (orderType !== 'delivery') return 'none';
  if (!storeId) return 'app';

  try {
    // Qualquer um desses campos já caracteriza vínculo
    const q1 = db.collection('drivers')
      .where('linkedStores', 'array-contains', storeId)
      .limit(1).get();
    const q2 = db.collection('drivers')
      .where('linkedStoreId', '==', storeId)
      .limit(1).get();
    const q3 = db.collection('drivers')
      .where('storeId', '==', storeId)
      .limit(1).get();

    const [s1, s2, s3] = await Promise.all([q1, q2, q3]);
    const hasLinked = !s1.empty || !s2.empty || !s3.empty;
    return hasLinked ? 'store' : 'app';
  } catch (e) {
    console.error('resolveDeliveryPoolByStore error:', e);
    // Em caso de erro, fallback seguro pro pool do app
    return 'app';
  }
}

async function buildDispatchFields({ orderType, storeId }) {
  const isDelivery = orderType === 'delivery';
  const deliveryPool = await resolveDeliveryPoolByStore(orderType, storeId);

  return {
    dispatchVersion: 2,
    deliveryPool,
    deliveryPoolSource: 'storeLinkedDrivers',
    dispatchState: isDelivery ? 'available' : 'not_applicable',
    dispatchAvailableAt: isDelivery ? firebase.firestore.FieldValue.serverTimestamp() : null,
    driverId: null,
    driverName: null,
    driverPhone: null,
    driverVehicle: null,
    driver: null,
    driverEarning: null,
    acceptedAt: null
  };
}

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', () => initPage());

async function initPage() {
  const storeId = getParam('storeId') || localStorage.getItem(LS.storeId) || '';

  syncCart(null);
  renderCartOptimized(true);
  updateTotals();

  if (storeId) await loadStoreSmart(storeId);

  auth.onAuthStateChanged(async (u) => {
    user = u;

    if (!user) {
      await UIModal.alert({ title: 'Login', text: 'Faça login para continuar.' });
      window.location.href = 'index.html';
      return;
    }

    syncCart(user.uid);

    await loadDeliveryFeesSmart();
    await loadAddressesSmart();

    if (!selectedAddressId && addresses.length) selectedAddressId = addresses[0].id;

    renderAddresses();
    updateTotals();
  });

  window.addEventListener('storage', (e) => {
    const keys = ['cart', 'LS_CART', 'pedrad_cart', 'cartItems', user?.uid ? `cart_${user.uid}` : ''];
    if (keys.includes(e.key)) syncCart(user?.uid || null);
  });
}

// ==================== STORE ====================
async function loadStoreSmart(storeId) {
  const key = LS.storeCache + storeId;
  const cached = readCache(key);

  if (isFresh(cached, TTL_STORE_MS) && cached.data) {
    store = cached.data;
    updateTotals();
    return;
  }

  try {
    const doc = await db.collection('stores').doc(storeId).get();
    if (doc.exists) {
      store = { id: doc.id, ...doc.data() };
      writeCache(key, { ts: now(), data: store });
      updateTotals();
    }
  } catch (err) {
    console.error('Erro ao carregar loja:', err);
  }
}

// ==================== FEES ====================
async function loadDeliveryFeesSmart(force = false) {
  const cached = readCache(LS.feesCache);

  if (!force && isFresh(cached, TTL_FEES_MS) && Array.isArray(cached.data)) {
    deliveryFees = cached.data;
    return;
  }

  try {
    const snap = await db.collection('deliveryFees').where('active', '==', true).get();
    deliveryFees = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    writeCache(LS.feesCache, { ts: now(), data: deliveryFees });
  } catch (err) {
    console.error('Erro ao carregar deliveryFees:', err);
  }
}

// ==================== ADDRESSES ====================
async function loadAddressesSmart(force = false) {
  if (!user) return;

  const key = LS.addrCache + user.uid;
  const cached = readCache(key);

  if (!force && isFresh(cached, TTL_ADDR_MS) && Array.isArray(cached.data)) {
    addresses = cached.data;
    return;
  }

  try {
    const snap = await db.collection('users').doc(user.uid).collection('addresses').get();
    addresses = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (addresses.length && !selectedAddressId) selectedAddressId = addresses[0].id;

    writeCache(key, { ts: now(), data: addresses });
  } catch (err) {
    console.error('Erro ao carregar endereços:', err);
  }
}

async function hardRefreshAddresses() {
  if (!user) return;
  await loadAddressesSmart(true);
  renderAddresses();
  updateTotals();
  showToast('Endereços atualizados');
}

async function hardRefreshAll() {
  showToast('Atualizando...');

  const storeId = getParam('storeId') || localStorage.getItem(LS.storeId);

  await Promise.all([
    loadDeliveryFeesSmart(true),
    loadAddressesSmart(true),
    storeId ? loadStoreSmart(storeId) : Promise.resolve()
  ]);

  syncCart(user?.uid || null);
  renderAddresses();
  updateTotals();
  showToast('Atualizado');
}

// ==================== RENDER CART ====================
function digestCart(list) {
  try {
    return JSON.stringify(list.map(i => [
      i.id || i.name,
      i.qty,
      i.price,
      (i.addons || []).map(a => [a.name, a.price]),
      i.observation || ''
    ]));
  } catch (_) {
    return String(Math.random());
  }
}

function renderCartOptimized(force = false) {
  const container = document.getElementById('cartItems');
  if (!container) return;

  const d = digestCart(cart);
  const last = localStorage.getItem(LS.cartDigest);

  if (!force && last === d) return;

  try {
    localStorage.setItem(LS.cartDigest, d);
  } catch (_) {}

  if (!Array.isArray(cart) || cart.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:18px;">Carrinho vazio</div>`;
    document.getElementById('finishBtn').disabled = true;
    return;
  }

  document.getElementById('finishBtn').disabled = false;

  container.innerHTML = cart.map(item => {
    const addons = Array.isArray(item.addons) ? item.addons : [];
    const addonsText = addons.length ? addons.map(a => a.name).filter(Boolean).join(', ') : '';
    const addonsSum = addons.reduce((s, a) => s + (Number(a.price) || 0), 0);

    const unit = (Number(item.price) || 0) + addonsSum;
    const qty = Number(item.qty) || 1;
    const total = unit * qty;

    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(item.name || 'Item')}</div>
          <div class="cart-item-meta">
            ${addonsText ? `Adicionais: ${escapeHtml(addonsText)}<br>` : ``}
            ${item.observation ? `Obs: ${escapeHtml(item.observation)}<br>` : ``}
            <span class="pill">${qty}x ${formatCurrency(unit)}</span>
          </div>
        </div>
        <div class="cart-item-price">${formatCurrency(total)}</div>
      </div>
    `;
  }).join('');
}

// ==================== ADDRESSES RENDER ====================
function renderAddresses() {
  const container = document.getElementById('addressList');
  if (!container) return;

  if (deliveryMode !== 'delivery') {
    container.innerHTML = `<div style="color:var(--text-muted);padding:10px 0;">Retirada selecionada. Endereço não é necessário.</div>`;
    return;
  }

  if (!addresses.length) {
    container.innerHTML = `
      <div style="text-align:center;color:var(--text-muted);padding:16px;border:1px dashed var(--border);border-radius:14px;background:rgba(255,255,255,.02);">
        Nenhum endereço cadastrado.
      </div>
    `;
    return;
  }

  container.innerHTML = addresses.map(addr => {
    const id = String(addr.id || '');
    const selected = id && id === selectedAddressId;
    const fee = getDeliveryFee(addr.neighborhood);

    const line1 = `${addr.street || ''}${addr.number ? ', ' + addr.number : ''}${addr.complement ? ' - ' + addr.complement : ''}`.trim();
    const line2 = `${addr.neighborhood || ''}`.trim();

    return `
      <div class="address-card ${selected ? 'selected' : ''}" onclick="selectAddress('${escapeAttr(id)}')">
        <div class="address-label">${escapeHtml(addr.label || 'Endereço')}</div>
        <div class="address-text">
          ${escapeHtml(line1 || '—')}<br>
          ${escapeHtml(line2 || '—')}
        </div>
        <div class="pill">Taxa: ${formatCurrency(fee)}</div>
      </div>
    `;
  }).join('');
}

function selectAddress(id) {
  selectedAddressId = id;
  renderAddresses();
  updateTotals();
}

// ==================== DELIVERY MODE / PAYMENT ====================
function selectDeliveryMode(mode) {
  deliveryMode = mode;

  document.getElementById('deliveryOption').classList.toggle('selected', mode === 'delivery');
  document.getElementById('pickupOption').classList.toggle('selected', mode === 'pickup');

  document.getElementById('addressSection').style.display = (mode === 'delivery') ? 'block' : 'none';

  if (mode === 'delivery') renderAddresses();
  updateTotals();
}

function selectPayment(method) {
  selectedPayment = method;

  document.querySelectorAll('.payment-method').forEach(el => {
    el.classList.toggle('selected', el.dataset.method === method);
  });

  const changeBox = document.getElementById('changeInput');
  const changeFor = document.getElementById('changeFor');

  if (method === 'cash') {
    changeBox.style.display = 'block';
    const total = getCurrentTotal();
    changeFor.min = String(Math.ceil(total));
    if (!changeFor.value || Number(changeFor.value) < total) {
      changeFor.value = String(Math.ceil(total));
    }
  } else {
    changeBox.style.display = 'none';
    if (changeFor) changeFor.value = '';
  }
}

function getCurrentTotal() {
  const subtotal = (Array.isArray(cart) ? cart : []).reduce((sum, item) => {
    const addons = Array.isArray(item.addons) ? item.addons : [];
    const addonsSum = addons.reduce((s, a) => s + (Number(a.price) || 0), 0);
    const unit = (Number(item.price) || 0) + addonsSum;
    const qty = Number(item.qty) || 1;
    return sum + (unit * qty);
  }, 0);

  let deliveryFee = 0;
  if (deliveryMode === 'delivery') {
    const addr = getSelectedAddress();
    if (addr?.neighborhood) deliveryFee = getDeliveryFee(addr.neighborhood);
    else if (store && store.deliveryFee != null) deliveryFee = Number(store.deliveryFee) || 0;
  }

  return subtotal + deliveryFee;
}

// ==================== TOTALS ====================
function getDeliveryFee(neighborhood) {
  if (!neighborhood) return 0;
  const found = deliveryFees.find(f => String(f.name || '').toLowerCase() === String(neighborhood).toLowerCase());
  return Number(found?.fee) || 0;
}

function getSelectedAddress() {
  if (!selectedAddressId) return null;
  return addresses.find(a => String(a.id) === String(selectedAddressId)) || null;
}

function updateTotals() {
  const subtotal = (Array.isArray(cart) ? cart : []).reduce((sum, item) => {
    const addons = Array.isArray(item.addons) ? item.addons : [];
    const addonsSum = addons.reduce((s, a) => s + (Number(a.price) || 0), 0);
    const unit = (Number(item.price) || 0) + addonsSum;
    const qty = Number(item.qty) || 1;
    return sum + (unit * qty);
  }, 0);

  let deliveryFee = 0;

  if (deliveryMode === 'delivery') {
    const addr = getSelectedAddress();
    if (addr?.neighborhood) deliveryFee = getDeliveryFee(addr.neighborhood);
    else if (store && store.deliveryFee != null) deliveryFee = Number(store.deliveryFee) || 0;
  }

  const total = subtotal + deliveryFee;

  document.getElementById('subtotal').textContent = formatCurrency(subtotal);
  document.getElementById('deliveryFee').textContent = formatCurrency(deliveryFee);
  document.getElementById('total').textContent = formatCurrency(total);

  document.getElementById('deliveryFeeRow').style.display = (deliveryFee > 0) ? 'flex' : 'none';

  if (selectedPayment === 'cash') {
    const changeFor = document.getElementById('changeFor');
    if (changeFor) {
      changeFor.min = String(Math.ceil(total));
      if (!changeFor.value || Number(changeFor.value) < total) {
        changeFor.value = String(Math.ceil(total));
      }
    }
  }
}

// ==================== FINISH ORDER ====================
async function finishOrder() {
  if (!user) {
    await UIModal.alert({ title: 'Login', text: 'Faça login para continuar.' });
    return;
  }

  if (!cart.length) {
    await UIModal.alert({ title: 'Carrinho', text: 'Seu carrinho está vazio.' });
    return;
  }

  const resolvedStoreId = store?.id || cart?.[0]?.storeId || null;
  if (!resolvedStoreId) {
    await UIModal.alert({ title: 'Loja', text: 'Não foi possível identificar a loja do pedido.' });
    return;
  }

  if (deliveryMode === 'delivery' && !getSelectedAddress()) {
    await UIModal.alert({ title: 'Endereço', text: 'Selecione um endereço para entrega.' });
    return;
  }

  const btn = document.getElementById('finishBtn');
  btn.disabled = true;
  btn.textContent = 'Processando...';

  try {
    const subtotal = (Array.isArray(cart) ? cart : []).reduce((sum, item) => {
      const addons = Array.isArray(item.addons) ? item.addons : [];
      const addonsSum = addons.reduce((s, a) => s + (Number(a.price) || 0), 0);
      const unit = (Number(item.price) || 0) + addonsSum;
      const qty = Number(item.qty) || 1;
      return sum + (unit * qty);
    }, 0);

    const addr = getSelectedAddress();
    const deliveryFee = (deliveryMode === 'delivery')
      ? (addr?.neighborhood ? getDeliveryFee(addr.neighborhood) : (Number(store?.deliveryFee) || 0))
      : 0;

    const total = subtotal + deliveryFee;

    if (selectedPayment === 'cash') {
      const changeVal = parseFloat(document.getElementById('changeFor')?.value || '0') || 0;
      if (changeVal < total) {
        await UIModal.alert({
          title: 'Troco inválido',
          text: `O valor do troco não pode ser menor que o total (${formatCurrency(total)}).`
        });
        btn.disabled = false;
        btn.textContent = 'Finalizar pedido';
        return;
      }
    }

    const salesChannel   = detectSalesChannel();    // 'app' | 'store'
    const createdByRole  = detectCreatedByRole();   // 'customer' | 'store' | 'admin'
    const orderScope     = salesChannel;            // mesmo que channel
    const orderType      = deliveryMode;            // 'delivery' | 'pickup'
    const dispatchFields = await buildDispatchFields({ orderType, storeId: resolvedStoreId });
    const order = {
      storeId: resolvedStoreId,
      storeName: store?.name || cart?.[0]?.storeName || '',
      userId: user.uid,
      userName: user.displayName || user.email || '',
      userPhone: localStorage.getItem('userPhone') || user.phoneNumber || '',
      items: cart,
      salesChannel,
      orderScope,
      orderType,
      createdByRole,

      deliveryPool: dispatchFields.deliveryPool,
      deliveryPoolSource: dispatchFields.deliveryPoolSource,
      dispatchVersion: dispatchFields.dispatchVersion,
      dispatchState: dispatchFields.dispatchState,
      dispatchAvailableAt: dispatchFields.dispatchAvailableAt,

      driverId: dispatchFields.driverId,
      driverName: dispatchFields.driverName,
      driverPhone: dispatchFields.driverPhone,
      driverVehicle: dispatchFields.driverVehicle,
      driver: dispatchFields.driver,
      driverEarning: dispatchFields.driverEarning,
      acceptedAt: dispatchFields.acceptedAt,

      address: orderType === 'delivery' ? (addr || null) : null,
      paymentMethod: selectedPayment,
      needChange: selectedPayment === 'cash',
      changeFor: selectedPayment === 'cash'
        ? (parseFloat(document.getElementById('changeFor')?.value) || 0)
        : 0,
      notes: String(document.getElementById('notes')?.value || '').trim(),
      subtotal,
      deliveryFee,
      total,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      timeline: [{
        status: 'pending',
        timestamp: new Date().toISOString(),
        message: 'Pedido realizado'
      }]
    };

    await db.collection('orders').add(order);

    try {
      localStorage.removeItem('cart');
      if (user?.uid) localStorage.removeItem(`cart_${user.uid}`);
      localStorage.removeItem('LS_CART');
      localStorage.removeItem('pedrad_cart');
      localStorage.removeItem('cartItems');
      localStorage.removeItem(LS.cartDigest);
    } catch (_) {}

    await UIModal.alert({ title: 'Sucesso', text: 'Pedido realizado com sucesso.' });
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Erro ao finalizar pedido:', err);
    await UIModal.alert({ title: 'Erro', text: 'Não foi possível finalizar o pedido.' });
    btn.disabled = false;
    btn.textContent = 'Finalizar pedido';
  }
}

// ==================== NAV ====================
function goBack() {
  if (history.length > 1) history.back();
  else window.location.href = 'index.html';
}

// ==================== HELPERS ====================
function formatCurrency(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll('`', '&#096;');
}

// ==================== GLOBALS ====================
window.selectDeliveryMode = selectDeliveryMode;
window.selectPayment = selectPayment;
window.finishOrder = finishOrder;
window.hardRefreshAddresses = hardRefreshAddresses;
window.hardRefreshAll = hardRefreshAll;
window.selectAddress = selectAddress;
window.goBack = goBack;