// ==================== IMAGE HELPER ====================
// Detecta URL ou base64 e renderiza com lazy loading

const ImageHelper = {
    
    // Verifica se é imagem válida (URL ou base64)
    isValid(src) {
        if (!src || typeof src !== 'string') return false;
        const s = src.trim();
        if (s.startsWith('data:image/')) return true;
        if (/^https?:\/\/.+/i.test(s) && s.length > 10 && !s.includes(' ')) return true;
        return false;
    },

    // Retorna a melhor fonte de imagem (prioriza imageData sobre imageUrl)
    getSrc(item) {
        if (!item) return null;
        const data = (item.imageData || '').trim();
        const url = (item.imageUrl || '').trim();
        if (data && this.isValid(data)) return data;
        if (url && this.isValid(url)) return url;
        return null;
    },

    // Renderiza tag <img> com lazy loading e fallback
    render(item, fallback = '🍽️', className = '') {
        const src = this.getSrc(item);
        if (!src) return fallback;

        const alt = (item.name || 'Imagem').replace(/"/g, '&quot;');
        const fb = fallback.replace(/'/g, "\\'");
        
        return `<img 
            src="${src}" 
            alt="${alt}" 
            loading="lazy"
            class="${className}"
            onerror="this.remove();this.parentElement.classList.remove('has-image');this.parentElement.innerHTML='${fb}';"
        >`;
    },

    // Renderiza div com background-image (para banners)
    renderBg(item, fallback = '🍽️') {
        const src = this.getSrc(item);
        if (!src) return { hasImage: false, style: '', content: fallback };
        
        return {
            hasImage: true,
            style: `background-image:url('${src}');background-size:cover;background-position:center;`,
            content: ''
        };
    },

    // Para usar em elementos existentes
    applyToElement(el, item, fallback = '🍽️') {
        if (!el) return;
        
        const src = this.getSrc(item);
        if (!src) {
            el.classList.remove('has-image');
            el.innerHTML = fallback;
            return;
        }

        el.classList.add('has-image');
        el.innerHTML = this.render(item, fallback);
    },

    // Preload de imagem (retorna promise)
    preload(src) {
        return new Promise((resolve, reject) => {
            if (!this.isValid(src)) return reject('Invalid src');
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject('Load failed');
            img.src = src;
        });
    }
};

window.ImageHelper = ImageHelper;
