/* ===== modules/search.js =====
 * Barra de busca global - página inicial (storeSelection)
 * Auto-suficiente, cache localStorage 30min
 */

(function () {
  var allStores = [];
  var allProducts = [];
  var searchConfig = {};
  var dataLoaded = false;
  var injected = false;
  var debounceTimer = null;

  // ===== INIT =====
  function init() {
    if (injected) return;
    injectSearchBar();
    injected = true;
    bindEvents();
    loadData();
  }

  // ===== LOAD DATA (cache 30min) =====
  function loadData() {
    if (dataLoaded) return Promise.resolve();

    var TTL = 1000 * 60 * 30;
    try {
      var cached = JSON.parse(localStorage.getItem('searchCache') || 'null');
      if (cached && cached.ts && (Date.now() - cached.ts) < TTL) {
        cached.stores.forEach(function (s) { allStores.push(s); });
        cached.products.forEach(function (p) { allProducts.push(p); });
        (cached.config || []).forEach(function (c) { if (c.refId) searchConfig[c.refId] = c; });
        dataLoaded = true;
        return Promise.resolve();
      }
    } catch (_) {}

    return Promise.all([
      db.collection('searchConfig').get().catch(function () { return { docs: [] }; }),
      db.collection('stores').get(),
      db.collection('products').get()
    ]).then(function (snaps) {
      var cfgArr = [];
      snaps[0].docs.forEach(function (doc) {
        var d = doc.data();
        if (d.refId) { searchConfig[d.refId] = d; cfgArr.push(d); }
      });
      snaps[1].docs.forEach(function (doc) {
        allStores.push(Object.assign({ id: doc.id }, doc.data()));
      });
      snaps[2].docs.forEach(function (doc) {
        allProducts.push(Object.assign({ id: doc.id }, doc.data()));
      });
      dataLoaded = true;

      try {
        localStorage.setItem('searchCache', JSON.stringify({
          ts: Date.now(),
          stores: allStores.map(function (s) {
            return { id:s.id, name:s.name, category:s.category, emoji:s.emoji,
              bannerData:s.bannerData||'', imageData:s.imageData||'', imageUrl:s.imageUrl||'',
              storeId:s.storeId, open:s.open, deliveryTime:s.deliveryTime };
          }),
          products: allProducts.map(function (p) {
            return { id:p.id, name:p.name, description:p.description,
              price:p.price, emoji:p.emoji, storeId:p.storeId };
          }),
          config: cfgArr
        }));
      } catch (_) {}
    }).catch(function (e) {
      console.warn('SearchModule: erro ao carregar dados', e);
    });
  }

  // ===== INJECT SEARCH BAR =====
  function injectSearchBar() {
    var el = document.getElementById('storeSelection');
    if (!el) return;

    var w = document.createElement('div');
    w.id = 'globalSearchWrapper';
    w.style.cssText = 'margin-bottom:16px;position:relative;z-index:60;';
    w.innerHTML =
      '<div style="position:relative;">' +
        '<input type="text" id="globalSearchInput" placeholder="Buscar lojas e produtos..." autocomplete="off" style="' +
          'width:100%;padding:14px 16px 14px 42px;background:var(--bg-input,#171717);border:1px solid var(--border,#262626);' +
          'border-radius:12px;color:var(--text,#fff);font-size:0.95rem;transition:border-color 0.2s;outline:none;">' +
        '<span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted,#737373);font-size:1.1rem;pointer-events:none;">🔍</span>' +
        '<button id="globalSearchClear" type="button" style="' +
          'display:none;position:absolute;right:10px;top:50%;transform:translateY(-50%);background:var(--bg-card,#0a0a0a);' +
          'border:1px solid var(--border,#262626);border-radius:50%;width:28px;height:28px;color:var(--text-muted,#737373);' +
          'font-size:1rem;cursor:pointer;line-height:1;">×</button>' +
      '</div>' +
      '<div id="globalSearchResults" style="' +
        'display:none;background:var(--bg-card,#0a0a0a);border:1px solid var(--border,#262626);border-radius:12px;' +
        'margin-top:8px;max-height:60vh;overflow-y:auto;position:absolute;left:0;right:0;z-index:60;' +
        'box-shadow:0 8px 30px rgba(0,0,0,0.6);"></div>';

    el.insertBefore(w, el.firstChild);
  }

  // ===== BIND EVENTS =====
  function bindEvents() {
    var input = document.getElementById('globalSearchInput');
    var clearBtn = document.getElementById('globalSearchClear');
    var resultsEl = document.getElementById('globalSearchResults');
    if (!input || !resultsEl) return;

    input.addEventListener('focus', function () {
      input.style.borderColor = '#fff';
      var val = input.value.trim();
      if (val) performSearch(val);
      else showAbsoluteResults();
    });

    input.addEventListener('blur', function () {
      input.style.borderColor = '';
    });

    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var val = input.value.trim();
      clearBtn.style.display = val ? 'block' : 'none';
      debounceTimer = setTimeout(function () {
        if (val) performSearch(val);
        else showAbsoluteResults();
      }, 250);
    });

    // mousedown + preventDefault impede o blur do input antes do click
    clearBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    clearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      input.value = '';
      clearBtn.style.display = 'none';
      hideResults();
    });

    // Impede blur quando clica nos resultados
    resultsEl.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });

    // Event delegation: captura click em qualquer resultado
    resultsEl.addEventListener('click', function (e) {
      var row = e.target;
      // sobe até achar o elemento com data-type
      while (row && row !== resultsEl && !row.hasAttribute('data-type')) {
        row = row.parentElement;
      }
      if (!row || !row.hasAttribute('data-type')) return;

      var type = row.getAttribute('data-type');
      var sid = row.getAttribute('data-store') || '';
      var pid = row.getAttribute('data-product') || '';
      goTo(type, sid, pid);
    });

    // Fecha ao clicar fora
    document.addEventListener('click', function (e) {
      var wrapper = document.getElementById('globalSearchWrapper');
      if (wrapper && !wrapper.contains(e.target)) hideResults();
    });
  }

  // ===== PERFORM SEARCH =====
  function performSearch(query) {
    if (!dataLoaded) { loadData().then(function () { performSearch(query); }); return; }

    var q = norm(query);
    var results = [];

    allStores.forEach(function (store) {
      var cfg = searchConfig[store.id] || {};
      if (cfg.visible === false) return;
      var name = norm(store.name || '');
      var cat = norm(store.category || '');
      var match = name.indexOf(q) >= 0 || cat.indexOf(q) >= 0;
      if (match || cfg.absolute) {
        results.push({
          type: 'store', name: store.name || 'Loja',
          subtitle: store.category || '', emoji: store.emoji || '🏪',
          imageData: store.bannerData || store.imageData || store.imageUrl || '',
          priority: cfg.priority || 0, absolute: !!cfg.absolute,
          score: match ? (name.indexOf(q) === 0 ? 100 : 50) : 0,
          storeId: store.id, productId: '', price: 0
        });
      }
    });

    allProducts.forEach(function (prod) {
      var cfg = searchConfig[prod.id] || {};
      if (cfg.visible === false) return;
      var name = norm(prod.name || '');
      var desc = norm(prod.description || '');
      var match = name.indexOf(q) >= 0 || desc.indexOf(q) >= 0;
      if (match || cfg.absolute) {
        results.push({
          type: 'product', name: prod.name || 'Produto',
          subtitle: cfg.tag || '', emoji: prod.emoji || '🍽️',
          imageData: '', price: prod.price || 0,
          priority: cfg.priority || 0, absolute: !!cfg.absolute,
          score: match ? (name.indexOf(q) === 0 ? 100 : 50) : 0,
          storeId: prod.storeId || '', productId: prod.id
        });
      }
    });

    results.sort(sortFn);
    renderResults(results, query, false);
  }

  // ===== ABSOLUTE RESULTS =====
  function showAbsoluteResults() {
    if (!dataLoaded) { loadData().then(function () { showAbsoluteResults(); }); return; }

    var abs = [];
    allStores.forEach(function (s) {
      var cfg = searchConfig[s.id] || {};
      if (cfg.absolute && cfg.visible !== false) {
        abs.push({ type:'store', name:s.name||'Loja',
          subtitle:cfg.tag||s.category||'', emoji:s.emoji||'🏪',
          imageData:s.bannerData||s.imageData||s.imageUrl||'',
          priority:cfg.priority||0, storeId:s.id, productId:'', price:0 });
      }
    });
    allProducts.forEach(function (p) {
      var cfg = searchConfig[p.id] || {};
      if (cfg.absolute && cfg.visible !== false) {
        abs.push({ type:'product', name:p.name||'Produto',
          subtitle:cfg.tag||'', emoji:p.emoji||'🍽️',
          imageData:'', price:p.price||0,
          priority:cfg.priority||0, storeId:p.storeId||'', productId:p.id });
      }
    });

    abs.sort(sortFn);
    if (abs.length > 0) renderResults(abs, '', true);
  }

  function sortFn(a, b) {
    if (a.absolute && !b.absolute) return -1;
    if (!a.absolute && b.absolute) return 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return (b.score || 0) - (a.score || 0);
  }

  // ===== RENDER =====
  function renderResults(results, query, isPromo) {
    var el = document.getElementById('globalSearchResults');
    if (!el) return;

    if (results.length === 0 && query) {
      el.style.display = 'block';
      el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.9rem;">' +
        'Nenhum resultado para "' + esc(query) + '"</div>';
      return;
    }
    if (results.length === 0) { hideResults(); return; }

    el.style.display = 'block';
    var html = isPromo
      ? '<div style="padding:10px 14px 4px;font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">⭐ Destaques</div>'
      : '';

    var list = results.slice(0, 15);
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var img = getImg(r);
      var priceHtml = r.price ? '<span style="color:var(--primary);font-weight:600;font-size:0.85rem;">' + fmtCur(r.price) + '</span>' : '';
      var icon = r.type === 'store' ? '🏪 ' : '';

      html +=
        '<div data-type="' + r.type + '" data-store="' + esc(r.storeId) + '" data-product="' + esc(r.productId) + '"' +
        ' style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;border-bottom:1px solid var(--border);">' +
          '<div style="width:48px;height:48px;min-width:48px;border-radius:10px;background:var(--bg-input);' +
            'display:flex;align-items:center;justify-content:center;font-size:1.5rem;overflow:hidden;border:1px solid var(--border);' +
            (img ? "background-image:url('" + img + "');background-size:cover;background-position:center;font-size:0;" : '') + '">' +
            (img ? '' : (r.emoji || '🍽️')) +
          '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + icon + esc(r.name) + '</div>' +
            '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">' + esc(r.subtitle) + '</div>' +
          '</div>' +
          priceHtml +
          '<span style="color:var(--text-muted);font-size:1.2rem;">›</span>' +
        '</div>';
    }

    el.innerHTML = html;
  }

  // ===== NAVIGATE =====
  function goTo(type, storeId, productId) {
    hideResults();
    var input = document.getElementById('globalSearchInput');
    var clear = document.getElementById('globalSearchClear');
    if (input) { input.value = ''; input.blur(); }
    if (clear) clear.style.display = 'none';

    // Abre a loja
    if (storeId) {
      if (typeof selectStore === 'function') {
        selectStore(storeId);
      } else if (typeof openStore === 'function') {
        openStore(storeId);
      }
    }

    // Se for produto, espera loja carregar e abre popup
    if (type === 'product' && storeId && productId) {
      setTimeout(function () {
        var popup = document.getElementById('htmlPopup');
        var frame = document.getElementById('popupFrame');
        if (popup && frame) {
          frame.src = 'popup.html?storeId=' + encodeURIComponent(storeId) + '&productId=' + encodeURIComponent(productId);
          popup.style.display = 'block';
        }
      }, 600);
    }
  }

  function hideResults() {
    var el = document.getElementById('globalSearchResults');
    if (el) el.style.display = 'none';
  }

  // ===== UTILS =====
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function getImg(r) {
    var d = (r.imageData || '').trim();
    return (d && (d.indexOf('data:image/') === 0 || /^https?:\/\//.test(d))) ? d : null;
  }
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtCur(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0); }

  // ===== AUTO-INIT =====
  function tryInit() {
    if (typeof firebase === 'undefined') return false;
    if (typeof db === 'undefined') return false;
    if (!document.getElementById('storeSelection')) return false;
    var user = firebase.auth().currentUser;
    if (!user) return false;
    init();
    return true;
  }

  if (tryInit()) return;

  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(function () {
      if (!tryInit()) setTimeout(tryInit, 800);
    });
  }

  var att = 0;
  var iv = setInterval(function () {
    if (tryInit() || ++att > 15) clearInterval(iv);
  }, 1000);

})();
