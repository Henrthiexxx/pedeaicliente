// ads-loader.js - Pedrad Ads Loader
// Injeta popup de anúncio quando há campanha ativa

(function() {
  'use strict';
  
  const CONFIG = {
    apiBaseUrl: 'https://southamerica-east1-pedrad-814d0.cloudfunctions.net',
    storeId: null, // Será definido via atributo data-store-id
    page: 'index',
    frequencyCapHours: 24, // Mostrar no máximo 1 vez por 24h
    storageKey: 'pedrad_ads'
  };
  
  // ===== HELPERS =====
  
  function getUserKey() {
    let storage = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '{}');
    
    if (!storage.userKey) {
      storage.userKey = 'user_' + Math.random().toString(36).substr(2, 16) + Date.now();
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(storage));
    }
    
    return storage.userKey;
  }
  
  function getViewedCampaigns() {
    const storage = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '{}');
    return storage.viewedCampaigns || {};
  }
  
  function markCampaignViewed(campaignId) {
    const storage = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '{}');
    if (!storage.viewedCampaigns) storage.viewedCampaigns = {};
    storage.viewedCampaigns[campaignId] = Date.now();
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(storage));
  }
  
  function shouldShowCampaign(campaignId) {
    const viewed = getViewedCampaigns();
    
    if (!viewed[campaignId]) return true;
    
    const lastView = viewed[campaignId];
    const hoursSince = (Date.now() - lastView) / (1000 * 60 * 60);
    
    return hoursSince >= CONFIG.frequencyCapHours;
  }
  
  // ===== API =====
  
  async function fetchActiveCampaign() {
    try {
      const url = `${CONFIG.apiBaseUrl}/getActiveCampaigns?storeId=${CONFIG.storeId}&page=${CONFIG.page}`;
      const response = await fetch(url);
      
      if (!response.ok) throw new Error('Erro ao buscar campanha');
      
      const data = await response.json();
      return data.campaign;
      
    } catch (error) {
      console.error('[Pedrad Ads] Fetch error:', error);
      return null;
    }
  }
  
  async function trackEvent(campaignId, event) {
    try {
      const url = `${CONFIG.apiBaseUrl}/trackAdEvent`;
      
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          event,
          storeId: CONFIG.storeId,
          page: CONFIG.page,
          userKey: getUserKey(),
          viewport: `${window.innerWidth}x${window.innerHeight}`
        })
      });
      
    } catch (error) {
      console.error('[Pedrad Ads] Track error:', error);
    }
  }
  
  // ===== RENDER =====
  
  function renderPopup(campaign) {
    const { creative } = campaign;
    const imageUrl = creative.imageData || creative.imageUrl;
    
    if (!imageUrl) return;
    
    // Container
    const overlay = document.createElement('div');
    overlay.id = 'pedrad-ad-popup';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease-in-out;
    `;
    
    // Content
    const content = document.createElement('div');
    content.style.cssText = `
      position: relative;
      max-width: 720px;
      width: 90%;
      margin: 10vh auto;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 25px 80px rgba(0,0,0,0.6);
    `;
    
    // Image
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = creative.title || 'Anúncio';
    img.style.cssText = `
      width: 100%;
      display: block;
      border-radius: 12px;
    `;
    
    // CTA Button
    const ctaBtn = document.createElement('button');
    ctaBtn.textContent = creative.ctaText || 'Compre agora!';
    ctaBtn.style.cssText = `
      position: absolute;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      padding: 16px 32px;
      font-size: 1.1rem;
      font-weight: 700;
      background: #fff;
      color: #000;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: all 0.2s;
    `;
    
    ctaBtn.onmouseover = () => {
      ctaBtn.style.transform = 'translateX(-50%) scale(1.05)';
      ctaBtn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
    };
    
    ctaBtn.onmouseout = () => {
      ctaBtn.style.transform = 'translateX(-50%) scale(1)';
      ctaBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    };
    
    ctaBtn.onclick = () => {
      trackEvent(campaign.id, 'click');
      if (creative.ctaUrl) {
        window.open(creative.ctaUrl, '_blank');
      }
      closePopup();
    };
    
    // Close Button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      position: absolute;
      bottom: 10px;
      right: 10px;
      width: 32px;
      height: 32px;
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      border: 0;
      border-radius: 50%;
      cursor: pointer;
      font-size: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    `;
    
    closeBtn.onmouseover = () => {
      closeBtn.style.background = 'rgba(0, 0, 0, 0.8)';
      closeBtn.style.transform = 'scale(1.1)';
    };
    
    closeBtn.onmouseout = () => {
      closeBtn.style.background = 'rgba(0, 0, 0, 0.5)';
      closeBtn.style.transform = 'scale(1)';
    };
    
    closeBtn.onclick = () => {
      trackEvent(campaign.id, 'click');
      closePopup();
    };
    
    // Assemble
    content.appendChild(img);
    content.appendChild(ctaBtn);
    content.appendChild(closeBtn);
    overlay.appendChild(content);
    
    // Close on overlay click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        trackEvent(campaign.id, 'click');
        closePopup();
      }
    };
    
    // Close on ESC
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        trackEvent(campaign.id, 'click');
        closePopup();
        document.removeEventListener('keydown', escHandler);
      }
    });
    
    // Animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(overlay);
    
    // Track view
    trackEvent(campaign.id, 'view');
    markCampaignViewed(campaign.id);
  }
  
  function closePopup() {
    const popup = document.getElementById('pedrad-ad-popup');
    if (popup) {
      popup.style.animation = 'fadeOut 0.2s ease-in-out';
      setTimeout(() => popup.remove(), 200);
    }
  }
  
  // ===== INIT =====
  
  async function init() {
    // Detecta storeId do script tag
    const scriptTag = document.querySelector('script[data-store-id]');
    if (!scriptTag) {
      console.warn('[Pedrad Ads] Script tag sem data-store-id');
      return;
    }
    
    CONFIG.storeId = scriptTag.getAttribute('data-store-id');
    
    if (!CONFIG.storeId) {
      console.warn('[Pedrad Ads] storeId não definido');
      return;
    }
    
    // Busca campanha ativa
    const campaign = await fetchActiveCampaign();
    
    if (!campaign) {
      console.log('[Pedrad Ads] Nenhuma campanha ativa');
      return;
    }
    
    // Valida frequency cap
    if (!shouldShowCampaign(campaign.id)) {
      console.log('[Pedrad Ads] Frequency cap atingido para campanha', campaign.id);
      return;
    }
    
    // Renderiza popup
    console.log('[Pedrad Ads] Exibindo campanha', campaign.id);
    renderPopup(campaign);
  }
  
  // Aguarda DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
