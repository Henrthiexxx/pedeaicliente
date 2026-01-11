// ==================== MELHORIAS DO CLIENTE - VERSÃO SIMPLIFICADA ====================

(function() {
    console.log('🎨 Iniciando melhorias visuais...');
    
    // ==================== 1. SCROLL TO TOP ====================
    
    const originalShowPage = window.showPage;
    if (typeof originalShowPage === 'function') {
        window.showPage = function(page) {
            originalShowPage(page);
            setTimeout(() => {
                const activePage = document.querySelector('.page.active');
                if (activePage) activePage.scrollTop = 0;
                window.scrollTo(0, 0);
            }, 50);
        };
        console.log('✅ Scroll automático');
    }
    
    // ==================== 2. BOTÃO INFO ====================
    
    function addInfoButton() {
        const header = document.querySelector('.store-header-info');
        if (!header || document.getElementById('infoBtn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'infoBtn';
        btn.innerHTML = 'ℹ';
        btn.style.cssText = 'background:transparent;border:1px solid var(--border);color:var(--text);width:36px;height:36px;border-radius:8px;font-size:1.1rem;cursor:pointer;transition:0.2s;display:flex;align-items:center;justify-content:center;margin-left:auto;flex-shrink:0;';
        
        btn.onmouseenter = () => { btn.style.background = 'rgba(255,255,255,0.1)'; btn.style.borderColor = 'var(--primary)'; };
        btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.borderColor = 'var(--border)'; };
        btn.onclick = () => window.selectedStore?.id && (window.location.href = `store-info.html?id=${window.selectedStore.id}`);
        
        header.parentElement.appendChild(btn);
        header.parentElement.style.display = 'flex';
        header.parentElement.style.alignItems = 'center';
        header.parentElement.style.gap = '12px';
        
        console.log('✅ Botão info');
    }
    
    setInterval(addInfoButton, 1000);
    
    // ==================== 3. CONVERTER PRODUTOS PARA LISTA ====================
    
    function convertToList() {
        const grid = document.getElementById('productsGrid');
        if (!grid || grid.classList.contains('list-mode')) return;
        
        const cards = grid.querySelectorAll('.product-card');
        if (cards.length === 0) return;
        
        console.log(`📋 Convertendo ${cards.length} produtos...`);
        
        const byCategory = {};
        
        cards.forEach(card => {
            const name = card.querySelector('.product-name')?.textContent || '';
            const desc = card.querySelector('.product-desc')?.textContent || '';
            const price = card.querySelector('.product-price')?.textContent || '';
            const img = card.querySelector('.product-img');
            const onclick = card.getAttribute('onclick');
            const productId = onclick?.match(/'([^']+)'/)?.[1];
            const product = window.products?.find(p => p.id === productId);
            const category = product?.category || 'Outros';
            
            if (!byCategory[category]) byCategory[category] = [];
            byCategory[category].push({ name, desc, price, onclick, img, product });
        });
        
        grid.innerHTML = Object.entries(byCategory).map(([cat, items]) => `
            <div style="grid-column:1/-1;margin-bottom:24px;">
                <h3 style="font-size:0.85rem;font-weight:600;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);">${cat}</h3>
                ${items.map(item => {
                    const hasImage = item.img?.classList.contains('has-image');
                    const bgImage = item.img?.style.backgroundImage;
                    const emoji = item.img?.textContent?.trim() || '🍽️';
                    const addonsCount = item.product?.addons?.length || 0;
                    
                    return `
                    <div onclick="${item.onclick}" style="display:flex;gap:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer;transition:0.2s;margin-bottom:12px;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
                        <div class="product-img ${hasImage ? 'has-image' : ''}" style="width:80px;height:80px;min-width:80px;border-radius:8px;${hasImage ? `background-image:${bgImage};background-size:cover;background-position:center;` : 'background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-size:2.5rem;'}">
                            ${hasImage ? '' : emoji}
                        </div>
                        <div style="flex:1;min-width:0;display:flex;flex-direction:column;">
                            <div style="font-weight:600;font-size:0.95rem;margin-bottom:4px;">${item.name}</div>
                            ${item.desc ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.4;">${item.desc}</div>` : ''}
                            <div style="display:flex;align-items:center;gap:8px;margin-top:auto;">
                                <div style="font-weight:600;color:var(--primary);font-size:1rem;">${item.price}</div>
                                ${addonsCount > 0 ? `<div style="font-size:0.7rem;color:var(--text-muted);background:rgba(255,255,255,0.05);padding:3px 8px;border-radius:4px;border:1px solid var(--border);">➕ ${addonsCount} ${addonsCount === 1 ? 'adicional' : 'adicionais'}</div>` : ''}
                            </div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `).join('');
        
        grid.classList.add('list-mode');
        console.log(`✅ ${Object.keys(byCategory).length} categorias`);
    }
    
    // Observer de produtos
    const observer = new MutationObserver(() => {
        const grid = document.getElementById('productsGrid');
        if (grid?.children.length > 0) {
            grid.classList.remove('list-mode');
            setTimeout(convertToList, 100);
        }
    });
    
    const grid = document.getElementById('productsGrid');
    if (grid) {
        observer.observe(grid, { childList: true });
        if (grid.children.length > 0) setTimeout(convertToList, 500);
    }
    
    console.log('✅ Observer ativo');
    
    // ==================== 4. ADICIONAIS NO MODAL ====================
    
    window.selectedAddon = null;
    
    window.selectAddon = function(addon) {
        window.selectedAddon = addon;
        document.querySelectorAll('.addon-option').forEach(el => {
            el.classList.toggle('selected', el.querySelector('input')?.checked);
        });
        if (typeof window.updateModalPrice === 'function') window.updateModalPrice();
    };
    
    const modalObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                const modal = mutation.target;
                if (modal.id === 'productModal' && modal.classList.contains('active')) {
                    setTimeout(addAddonsToModal, 200);
                }
            }
        });
    });
    
    const modal = document.getElementById('productModal');
    if (modal) modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
    
    function addAddonsToModal() {
        if (document.getElementById('customAddons')) return;
        
        const modalName = document.querySelector('.product-detail-name')?.textContent.trim();
        const product = window.products?.find(p => p.name === modalName);
        
        if (!product?.addons?.length) return;
        
        const modalInfo = document.querySelector('.product-detail-info');
        const qtySelector = document.querySelector('.product-qty-selector');
        
        if (!modalInfo || !qtySelector) return;
        
        const container = document.createElement('div');
        container.id = 'customAddons';
        
        const sorted = [...product.addons].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        
        container.innerHTML = `
            <div style="margin:20px 0;padding-top:20px;border-top:1px solid var(--border);">
                <div style="font-weight:600;margin-bottom:12px;font-size:0.95rem;">➕ Adicionais (opcional)</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <label class="addon-option selected" style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;cursor:pointer;">
                        <input type="radio" name="addon" value="" checked onchange="window.selectAddon(null)" style="width:18px;height:18px;">
                        <div style="flex:1;"><div style="font-weight:500;font-size:0.9rem;">Nenhum</div><div style="font-size:0.75rem;color:var(--text-muted);">Sem adicional</div></div>
                        <div style="font-weight:600;color:var(--text-muted);">-</div>
                    </label>
                    ${sorted.map(addon => `
                        <label class="addon-option" style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
                            <input type="radio" name="addon" value="${addon.name}" onchange='window.selectAddon(${JSON.stringify(addon)})' style="width:18px;height:18px;">
                            <div style="flex:1;"><div style="font-weight:500;font-size:0.9rem;">${addon.name}</div><div style="font-size:0.75rem;color:var(--text-muted);">+ R$ ${addon.price.toFixed(2)}</div></div>
                            <div style="font-weight:600;color:var(--primary);">+ R$ ${addon.price.toFixed(2)}</div>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
        
        modalInfo.insertBefore(container, qtySelector);
        console.log(`✅ ${product.addons.length} adicionais`);
    }
    
    const originalAddToCart = window.addToCartFromModal;
    if (typeof originalAddToCart === 'function') {
        window.addToCartFromModal = function() {
            if (window.selectedAddon && window.selectedProduct) {
                window.selectedProduct.selectedAddons = [window.selectedAddon];
            }
            originalAddToCart.apply(this, arguments);
            window.selectedAddon = null;
        };
    }
    
    console.log('✅ Todas melhorias carregadas');
    
})();