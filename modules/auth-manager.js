// ==================== AUTH MANAGER ====================
// Evita flash de login usando localStorage

const AuthManager = {
    KEYS: {
        uid: 'auth_uid',
        name: 'auth_name',
        email: 'auth_email',
        lastCheck: 'auth_last_check'
    },

    // Salva dados do usuário localmente
    saveLocal(user) {
        if (!user) return this.clearLocal();
        localStorage.setItem(this.KEYS.uid, user.uid);
        localStorage.setItem(this.KEYS.name, user.displayName || '');
        localStorage.setItem(this.KEYS.email, user.email || '');
        localStorage.setItem(this.KEYS.lastCheck, Date.now().toString());
    },

    clearLocal() {
        Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
    },

    // Verifica se tem sessão local (para decidir UI inicial)
    hasLocalSession() {
        const uid = localStorage.getItem(this.KEYS.uid);
        const lastCheck = parseInt(localStorage.getItem(this.KEYS.lastCheck) || '0');
        // Considera válido se checado nas últimas 24h
        const isRecent = Date.now() - lastCheck < 24 * 60 * 60 * 1000;
        return !!(uid && isRecent);
    },

    // Dados locais (para exibição rápida)
    getLocalUser() {
        if (!this.hasLocalSession()) return null;
        return {
            uid: localStorage.getItem(this.KEYS.uid),
            displayName: localStorage.getItem(this.KEYS.name),
            email: localStorage.getItem(this.KEYS.email)
        };
    },

    // Inicializa - retorna se deve mostrar app ou login
    init() {
        // Se tem sessão local, mostra app imediatamente
        if (this.hasLocalSession()) {
            this.showApp();
            return true;
        }
        // Senão, mostra login
        this.showLogin();
        return false;
    },

    showApp() {
        const auth = document.getElementById('authPage');
        const main = document.getElementById('mainApp');
        if (auth) auth.style.display = 'none';
        if (main) main.style.display = 'block';
    },

    showLogin() {
        const auth = document.getElementById('authPage');
        const main = document.getElementById('mainApp');
        if (auth) auth.style.display = 'flex';
        if (main) main.style.display = 'none';
    },

    // Chamado pelo Firebase auth state change
    async onAuthStateChanged(user) {
        if (user) {
            this.saveLocal(user);
            this.showApp();
            return user;
        } else {
            // Só limpa se realmente deslogou (não no primeiro load)
            const hadSession = this.hasLocalSession();
            this.clearLocal();
            if (hadSession) {
                // Usuário deslogou explicitamente
                this.showLogin();
            }
            return null;
        }
    },

    // Logout explícito
    async logout() {
        this.clearLocal();
        await firebase.auth().signOut();
        this.showLogin();
        // Limpa caches
        DataCache?.invalidate('stores');
        DataCache?.invalidate('products');
    }
};

window.AuthManager = AuthManager;
