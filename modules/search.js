/* ===== modules/search.js =====
 * Barra de busca global - pesquisa lojas e produtos
 * Usa coleção 'searchConfig' do Firestore para prioridade/visibilidade
 */

const SearchModule = (() => {
  let allStores = [];
  let allProducts = [];
  let searchConfig = {}; // { [refId]: { visible, priority, absolute, type } }
  let configLoaded = false;
  let searchOpen = false;
  let debounceTimer = null;

  // ===== INIT =====
  async function init() {
    await loadSearchConfig();
    injectSearchBar();
    bindEvents();
  }

  // ===== LOAD CONFIG FROM FIRESTORE =====
  async function loadSearchConfig() {
    try {
      const snap = await db.collection('searchConfig').get();
      snap.docs.forEach(doc => {
        searchConfig[doc.data().refId] = { id: doc.id, ...doc.data() };
      });
      configLoaded = true;
    } catch (e) {
      console.warn('SearchConfig não encontrado, usando defaults');
      configLoaded = true;
    }
  }

  // ===== INJECT SEARCH BAR =====
  function injectSearchBar() {
    // Container de busca no topo (abaixo do header)
    const container = document.getElementById('homePage');
    if (!container) return;

    const searchHTML = `
      <div id="globalSearchWrapper" style="margin-bottom:16px;">
        <div id="globalSearchBar" style="position:relative;">
          <input type="text" id="globalSearchInput"
            placeholder="Buscar lojas e produtos..."
            autocomplete="off"
            style="
              width:100%; padding:14px 16px 14px 42px;
              background:var(--bg-input); border:1px solid var(--border);
              border-radius:12px; color:var(--text); font-size:0.95rem;
              transition:border-color 0.2s;
            ">
          <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);
            color:var(--text-muted);font-size:1.1rem;pointer-events:none;">⌕</span>
          <button id="globalSearchClear" style="
            display:none; position:absolute; right:10px; top:50%;
            transform:translateY(-50%); background:var(--bg-card);
            border:1px solid var(--border); border-radius:50%;
            width:28px; height:28px; color:var(--text-muted);
            font-size:1rem; cursor:pointer;
          ">×</button>
        </div>
        <div id="globalSearchResults" style="
          display:none; background:var(--bg-card);
          border:1px solid var(--border); border-radius:12px;
          margin-top:8px; max-height:60vh; overflow-y:auto;
        "></div>
      </div>
    `;

    // Insere antes do storeSelection
    const storeSelection = document.getElementById('storeSelection');
    if (storeSelection) {
      storeSelection.insertAdjacentHTML('afterbegin', searchHTML);
    }
  }

  // ===== BIND EVENTS =====
  function bindEvents() {
    const input = document.getElementById('globalSearchInput');
    const clearBtn = document.getElementById('globalSearchClear');
    if (!input) return;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => performSearch(input.value.trim()), 200);
      clearBtn.style.display = input.value ? 'block' : 'none';
    });

    input.addEventListener('focus', () => {
      if (input.value.trim()) performSearch(input.value.trim());
      else showAbsoluteResults();
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      hideResults();
    });

    // Fecha ao clicar fora
    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('globalSearchWrapper');
      if (wrapper && !wrapper.contains(e.target)) hideResults();
    });
  }

  // ===== UPDATE DATA (chamado por stores.js quando carrega) =====
  function updateData(stores, products) {
    allStores = stores || [];
    allProducts = products || [];
  }

  // ===== PERFORM SEARCH =====
  function performSearch(query) {
    const resultsEl = document.getElementById('globalSearchResults');
    if (!resultsEl) return;

    if (!query) { showAbsoluteResults(); return; }

    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let results = [];

    // Busca lojas
    allStores.forEach(store => {
      const cfg = searchConfig[store.id] || {};
      if (cfg.visible === false) return; // Oculta do search

      const name = (store.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cat = (store.category || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const match = name.includes(q) || cat.includes(q);

      if (match || cfg.absolute) {
        results.push({
          type: 'store',
          id: store.id,
          name: store.name,
          subtitle: store.category || '',
          emoji: store.emoji || '🏪',
          imageData: store.imageData || store.bannerData,
          imageUrl: store.imageUrl || store.bannerUrl,
          priority: cfg.priority || 0,
          absolute: cfg.absolute || false,
          matchScore: match ? (name.startsWith(q) ? 100 : 50) : 0,
          storeId: store.id
        });
      }
    });

    // Busca produtos
    allProducts.forEach(prod => {
      const cfg = searchConfig[prod.id] || {};
      if (cfg.visible === false) return;

      const name = (prod.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const desc = (prod.description || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const match = name.includes(q) || desc.includes(q);

      if (match || cfg.absolute) {
        // Encontra a loja do produto
        const store = allStores.find(s => s.id === prod.storeId);
        results.push({
          type: 'product',
          id: prod.id,
          name: prod.name,
          subtitle: store ? store.name : '',
          emoji: prod.emoji || '🍽️',
          imageData: prod.imageData,
          imageUrl: prod.imageUrl,
          price: prod.price,
          priority: cfg.priority || 0,
          absolute: cfg.absolute || false,
          matchScore: match ? (name.startsWith(q) ? 100 : 50) : 0,
          storeId: prod.storeId,
          productId: prod.id
        });
      }
    });

    // Ordena: absolutos primeiro, depois por prioridade, depois por matchScore
    results.sort((a, b) => {
      if (a.absolute !== b.absolute) return b.absolute - a.absolute;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.matchScore - a.matchScore;
    });

    renderResults(results, query);
  }

  // ===== SHOW ABSOLUTE RESULTS (quando foca sem query) =====
  function showAbsoluteResults() {
    let absolutes = [];

    allStores.forEach(store => {
      const cfg = searchConfig[store.id] || {};
      if (cfg.absolute && cfg.visible !== false) {
        absolutes.push({
          type: 'store', id: store.id, name: store.name,
          subtitle: cfg.tag || store.category || '', emoji: store.emoji || '🏪',
          imageData: store.imageData || store.bannerData,
          imageUrl: store.imageUrl || store.bannerUrl,
          priority: cfg.priority || 0, storeId: store.id
        });
      }
    });

    allProducts.forEach(prod => {
      const cfg = searchConfig[prod.id] || {};
      if (cfg.absolute && cfg.visible !== false) {
        const store = allStores.find(s => s.id === prod.storeId);
        absolutes.push({
          type: 'product', id: prod.id, name: prod.name,
          subtitle: store ? store.name : '', emoji: prod.emoji || '🍽️',
          imageData: prod.imageData, imageUrl: prod.imageUrl,
          price: prod.price, priority: cfg.priority || 0,
          storeId: prod.storeId, productId: prod.id
        });
      }
    });

    absolutes.sort((a, b) => b.priority - a.priority);

    if (absolutes.length > 0) {
      renderResults(absolutes, '', true);
    } else {
      hideResults();
    }
  }

  // ===== RENDER RESULTS =====
  function renderResults(results, query, isPromo) {
    const el = document.getElementById('globalSearchResults');
    if (!el) return;

    if (results.length === 0) {
      el.style.display = 'block';
      el.innerHTML = `
        <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.9rem;">
          Nenhum resultado para "${esc(query)}"
        </div>`;
      return;
    }

    el.style.display = 'block';
    el.innerHTML = (isPromo ? '<div style="padding:10px 14px 4px;font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Destaques</div>' : '') +
      results.slice(0, 15).map(r => {
        const imgSrc = getImgSrc(r);
        const imgStyle = imgSrc
          ? `background-image:url('${imgSrc}');background-size:cover;background-position:center;font-size:0;`
          : '';
        const priceTag = r.price ? `<span style="color:var(--primary);font-weight:600;font-size:0.85rem;">${fmtCur(r.price)}</span>` : '';
        const typeIcon = r.type === 'store' ? '🏪' : '';

        return `
          <div onclick="SearchModule.goToResult('${r.type}','${r.storeId || ''}','${r.productId || ''}')"
            style="display:flex;align-items:center;gap:12px;padding:12px 14px;
              cursor:pointer;transition:background 0.15s;border-bottom:1px solid var(--border);"
            onmouseover="this.style.background='rgba(255,255,255,0.03)'"
            onmouseout="this.style.background='transparent'">
            <div style="width:48px;height:48px;min-width:48px;border-radius:10px;
              background:var(--bg-input);display:flex;align-items:center;justify-content:center;
              font-size:1.5rem;overflow:hidden;border:1px solid var(--border);${imgStyle}">
              ${imgSrc ? '' : (r.emoji || '🍽️')}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${typeIcon} ${esc(r.name)}
              </div>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">
                ${esc(r.subtitle)}
              </div>
            </div>
            ${priceTag}
            <span style="color:var(--text-muted);font-size:1.2rem;">›</span>
          </div>`;
      }).join('');
  }

  // ===== GO TO RESULT =====
  function goToResult(type, storeId, productId) {
    hideResults();
    document.getElementById('globalSearchInput').value = '';
    document.getElementById('globalSearchClear').style.display = 'none';

    if (type === 'store' && storeId) {
      // Navega pra loja (usa função existente do stores.js)
      if (typeof openStore === 'function') openStore(storeId);
      else if (typeof StoresModule !== 'undefined' && StoresModule.openStore) StoresModule.openStore(storeId);
    } else if (type === 'product' && storeId && productId) {
      // Abre popup do produto
      const popup = document.getElementById('htmlPopup');
      const frame = document.getElementById('popupFrame');
      if (popup && frame) {
        frame.src = `popup.html?storeId=${storeId}&productId=${productId}`;
        popup.style.display = 'block';
      }
    }
  }

  function hideResults() {
    const el = document.getElementById('globalSearchResults');
    if (el) el.style.display = 'none';
  }

  // ===== HELPERS =====
  function getImgSrc(item) {
    const data = (item.imageData || '').trim();
    const url = (item.imageUrl || '').trim();
    if (data && (data.startsWith('data:image/') || /^https?:\/\//.test(data))) return data;
    if (url && /^https?:\/\//.test(url)) return url;
    return null;
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtCur(v) {
    return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v || 0);
  }

  return { init, updateData, goToResult };
})();

// Auto-init quando auth estiver pronto
window.addEventListener('load', () => {
  firebase.auth().onAuthStateChanged(user => {
    if (!user) return;
    // Aguarda stores carregarem, depois inicia busca
    const waitForStores = setInterval(() => {
      // Tenta pegar stores e products de variáveis globais
      let stores = [], products = [];
      if (typeof window._allStores !== 'undefined') stores = window._allStores;
      if (typeof window._allProducts !== 'undefined') products = window._allProducts;
      if (stores.length > 0 || products.length > 0) {
        clearInterval(waitForStores);
        SearchModule.updateData(stores, products);
        SearchModule.init();
      }
    }, 500);
    // Timeout after 10s
    setTimeout(() => clearInterval(waitForStores), 10000);
  });
});
