/* ===== modules/search.js =====
 * Barra de busca global na página inicial (storeSelection)
 * Auto-suficiente: carrega dados do Firestore sozinho
 */

const SearchModule = (() => {
  let allStores = [];
  let allProducts = [];
  let searchConfig = {};
  let dataLoaded = false;
  let injected = false;
  let debounceTimer = null;

  // ===== INIT =====
  function init() {
    if (injected) return;
    injectSearchBar();
    injected = true;
    bindEvents();
    loadData();
  }

  // ===== LOAD DATA FROM FIRESTORE =====
 async function loadData() {
    if (dataLoaded) return;

    // Tenta cache local primeiro (TTL 30min)
    const TTL = 1000 * 60 * 30;
    try {
      const cached = JSON.parse(localStorage.getItem('searchCache') || 'null');
      if (cached && cached.ts && (Date.now() - cached.ts) < TTL) {
        cached.stores.forEach(s => allStores.push(s));
        cached.products.forEach(p => allProducts.push(p));
        (cached.config || []).forEach(c => { if (c.refId) searchConfig[c.refId] = c; });
        dataLoaded = true;
        return;
      }
    } catch (_) {}

    try {
      const [cfgSnap, storeSnap, prodSnap] = await Promise.all([
        db.collection('searchConfig').get().catch(() => ({ docs: [] })),
        db.collection('stores').get(),
        db.collection('products').get()
      ]);

      const cfgArr = [];
      cfgSnap.docs.forEach(doc => {
        const d = doc.data();
        if (d.refId) { searchConfig[d.refId] = d; cfgArr.push(d); }
      });

      storeSnap.docs.forEach(doc => {
        allStores.push({ id: doc.id, ...doc.data() });
      });

      prodSnap.docs.forEach(doc => {
        allProducts.push({ id: doc.id, ...doc.data() });
      });

      dataLoaded = true;

      // Salva no cache (sem imageData pesado pra não estourar storage)
      try {
        const lite = s => ({ id:s.id, name:s.name, category:s.category, emoji:s.emoji,
          bannerData:s.bannerData||'', imageData:s.imageData||'', imageUrl:s.imageUrl||'',
          storeId:s.storeId, open:s.open, deliveryTime:s.deliveryTime });
        const liteProd = p => ({ id:p.id, name:p.name, description:p.description,
          price:p.price, emoji:p.emoji, storeId:p.storeId });
        localStorage.setItem('searchCache', JSON.stringify({
          ts: Date.now(),
          stores: allStores.map(lite),
          products: allProducts.map(liteProd),
          config: cfgArr
        }));
      } catch(_){}
    } catch (e) {
      console.warn('SearchModule: erro ao carregar dados', e);
    }
  }

  // ===== INJECT SEARCH BAR INTO storeSelection =====
  function injectSearchBar() {
    const storeSelection = document.getElementById('storeSelection');
    if (!storeSelection) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'globalSearchWrapper';
    wrapper.style.cssText = 'margin-bottom:16px;position:relative;z-index:60;';
    wrapper.innerHTML = `
      <div style="position:relative;">
        <input type="text" id="globalSearchInput"
          placeholder="Buscar lojas e produtos..."
          autocomplete="off"
          style="
            width:100%; padding:14px 16px 14px 42px;
            background:var(--bg-input,#171717); border:1px solid var(--border,#262626);
            border-radius:12px; color:var(--text,#fff); font-size:0.95rem;
            transition:border-color 0.2s; outline:none;
          ">
        <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);
          color:var(--text-muted,#737373);font-size:1.1rem;pointer-events:none;">🔍</span>
        <button id="globalSearchClear" style="
          display:none; position:absolute; right:10px; top:50%;
          transform:translateY(-50%); background:var(--bg-card,#0a0a0a);
          border:1px solid var(--border,#262626); border-radius:50%;
          width:28px; height:28px; color:var(--text-muted,#737373);
          font-size:1rem; cursor:pointer; line-height:1;
        ">×</button>
      </div>
      <div id="globalSearchResults" style="
        display:none; background:var(--bg-card,#0a0a0a);
        border:1px solid var(--border,#262626); border-radius:12px;
        margin-top:8px; max-height:60vh; overflow-y:auto;
        position:absolute; left:0; right:0; z-index:60;
        box-shadow: 0 8px 30px rgba(0,0,0,0.6);
      "></div>
    `;

    // Insere ANTES de tudo dentro de storeSelection
    storeSelection.insertBefore(wrapper, storeSelection.firstChild);
  }

  // ===== BIND EVENTS =====
  function bindEvents() {
    const input = document.getElementById('globalSearchInput');
    const clearBtn = document.getElementById('globalSearchClear');
    if (!input) return;

    input.addEventListener('focus', () => {
      input.style.borderColor = '#fff';
      const val = input.value.trim();
      if (val) performSearch(val);
      else showAbsoluteResults();
    });

    input.addEventListener('blur', () => {
      input.style.borderColor = '';
    });

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const val = input.value.trim();
      clearBtn.style.display = val ? 'block' : 'none';
      debounceTimer = setTimeout(() => {
        if (val) performSearch(val);
        else showAbsoluteResults();
      }, 250);
    });

    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      clearBtn.style.display = 'none';
      hideResults();
    });

    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('globalSearchWrapper');
      if (wrapper && !wrapper.contains(e.target)) hideResults();
    });
  }

  // ===== PERFORM SEARCH =====
  function performSearch(query) {
    if (!dataLoaded) { loadData().then(() => performSearch(query)); return; }

    const q = norm(query);
    let results = [];

    allStores.forEach(store => {
      const cfg = searchConfig[store.id] || {};
      if (cfg.visible === false) return;
      const name = norm(store.name || '');
      const cat = norm(store.category || '');
      const match = name.includes(q) || cat.includes(q);
      if (match || cfg.absolute) {
        results.push({
          type: 'store', id: store.id, name: store.name || 'Loja',
          subtitle: store.category || '', emoji: store.emoji || '🏪',
          imageData: store.bannerData || store.imageData || store.imageUrl || '',
          priority: cfg.priority || 0, absolute: !!cfg.absolute,
          score: match ? (name.startsWith(q) ? 100 : 50) : 0,
          storeId: store.id
        });
      }
    });

    allProducts.forEach(prod => {
      const cfg = searchConfig[prod.id] || {};
      if (cfg.visible === false) return;
      const name = norm(prod.name || '');
      const desc = norm(prod.description || '');
      const match = name.includes(q) || desc.includes(q);
      if (match || cfg.absolute) {
        const store = allStores.find(s => s.id === prod.storeId);
        results.push({
          type: 'product', id: prod.id, name: prod.name || 'Produto',
          subtitle: cfg.tag || '', emoji: prod.emoji || '🍽️',
          imageData: prod.imageData || '', price: prod.price,
          priority: cfg.priority || 0, absolute: !!cfg.absolute,
          score: match ? (name.startsWith(q) ? 100 : 50) : 0,
          storeId: prod.storeId, productId: prod.id
        });
      }
    });

    results.sort((a, b) => {
      if (a.absolute !== b.absolute) return b.absolute - a.absolute;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.score - a.score;
    });

    renderResults(results, query);
  }

  // ===== ABSOLUTE RESULTS (foco sem query) =====
  function showAbsoluteResults() {
    if (!dataLoaded) { loadData().then(() => showAbsoluteResults()); return; }

    let abs = [];
    allStores.forEach(s => {
      const cfg = searchConfig[s.id] || {};
      if (cfg.absolute && cfg.visible !== false) {
        abs.push({ type:'store', id:s.id, name:s.name||'Loja',
          subtitle:cfg.tag||s.category||'', emoji:s.emoji||'🏪',
          imageData:s.bannerData||s.imageData||'',
          priority:cfg.priority||0, storeId:s.id });
      }
    });
    allProducts.forEach(p => {
      const cfg = searchConfig[p.id] || {};
      if (cfg.absolute && cfg.visible !== false) {
        const store = allStores.find(s => s.id === p.storeId);
        abs.push({ type:'product', id:p.id, name:p.name||'Produto',
          subtitle: cfg.tag || '', emoji:p.emoji||'🍽️',
          imageData:p.imageData||'', price:p.price,
          priority:cfg.priority||0, storeId:p.storeId, productId:p.id });
      }
    });

    abs.sort((a, b) => b.priority - a.priority);
    if (abs.length > 0) renderResults(abs, '', true);
  }

  // ===== RENDER =====
  function renderResults(results, query, isPromo) {
    const el = document.getElementById('globalSearchResults');
    if (!el) return;

    if (results.length === 0 && query) {
      el.style.display = 'block';
      el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.9rem;">
        Nenhum resultado para "${esc(query)}"</div>`;
      return;
    }
    if (results.length === 0) { hideResults(); return; }

    el.style.display = 'block';
    const hdr = isPromo ? '<div style="padding:10px 14px 4px;font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">⭐ Destaques</div>' : '';

    el.innerHTML = hdr + results.slice(0, 15).map(r => {
      const img = getImg(r);
      const price = r.price ? `<span style="color:var(--primary);font-weight:600;font-size:0.85rem;">${fmtCur(r.price)}</span>` : '';
      const icon = r.type === 'store' ? '🏪 ' : '';

      return `<div onclick="SearchModule.goTo('${r.type}','${r.storeId||''}','${r.productId||''}')"
        style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;transition:background 0.15s;border-bottom:1px solid var(--border);"
        onmouseover="this.style.background='rgba(255,255,255,0.04)'"
        onmouseout="this.style.background='transparent'">
        <div style="width:48px;height:48px;min-width:48px;border-radius:10px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:1.5rem;overflow:hidden;border:1px solid var(--border);${img?`background-image:url('${img}');background-size:cover;background-position:center;font-size:0;`:''}">
          ${img?'':(r.emoji||'🍽️')}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${icon}${esc(r.name)}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">${esc(r.subtitle)}</div>
        </div>
        ${price}
        <span style="color:var(--text-muted);font-size:1.2rem;">›</span>
      </div>`;
    }).join('');
  }

  // ===== NAVIGATE =====
function goTo(type, storeId, productId) {
    hideResults();
    const input = document.getElementById('globalSearchInput');
    const clear = document.getElementById('globalSearchClear');
    if (input) { input.value = ''; input.blur(); }
    if (clear) clear.style.display = 'none';

    if (type === 'store' && storeId) {
      if (typeof openStore === 'function') openStore(storeId);
      else if (typeof StoresModule !== 'undefined' && StoresModule.openStore) StoresModule.openStore(storeId);
    } else if (type === 'product' && storeId) {
      // Seta o produto pra abrir automaticamente após carregar a loja
      sessionStorage.setItem('pendingProductId', productId);
      if (typeof openStore === 'function') openStore(storeId);
      else if (typeof StoresModule !== 'undefined' && StoresModule.openStore) StoresModule.openStore(storeId);
    }
  }

  function hideResults() {
    const el = document.getElementById('globalSearchResults');
    if (el) el.style.display = 'none';
  }

  // ===== UTILS =====
  function norm(s) { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function getImg(r) {
    const d = (r.imageData||'').trim();
    return (d && (d.startsWith('data:image/') || /^https?:\/\//.test(d))) ? d : null;
  }
  function esc(s) { return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;'); }
  function fmtCur(v) { return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0); }

  return { init, goTo };
})();

// ===== AUTO-INIT =====
(function() {
  function tryInit() {
    if (typeof firebase === 'undefined') return false;
    if (typeof db === 'undefined') return false;
    if (!document.getElementById('storeSelection')) return false;
    var user = firebase.auth().currentUser;
    if (!user) return false;
    SearchModule.init();
    return true;
  }

  if (tryInit()) return;

  // Retry on auth change
  var authUnsub = null;
  function onAuth() {
    if (tryInit() && authUnsub) { /* success */ }
    else { setTimeout(tryInit, 800); }
  }

  if (typeof firebase !== 'undefined' && firebase.auth) {
    authUnsub = firebase.auth().onAuthStateChanged(onAuth);
  }

  // Fallback polling
  var att = 0;
  var iv = setInterval(function() {
    if (tryInit() || ++att > 15) clearInterval(iv);
  }, 1000);
})();
