// ==================== PROFILE MODULE ====================
// Gerencia foto de perfil e dados do usuário

const ProfileModule = {
    photoURL: null,

    init() {
        this.loadPhoto();
    },

    loadPhoto() {
        try {
            const saved = localStorage.getItem(`profilePhoto_${currentUser?.uid}`);
            this.photoURL = saved || null;
        } catch (e) {
            this.photoURL = null;
        }
    },

    savePhoto(dataURL) {
        try {
            localStorage.setItem(`profilePhoto_${currentUser?.uid}`, dataURL);
            this.photoURL = dataURL;
            
            // Também salva no Firestore para sincronizar
            if (currentUser) {
                db.collection('users').doc(currentUser.uid).update({
                    photoURL: dataURL
                }).catch(console.error);
            }
        } catch (e) {
            console.error('Erro ao salvar foto:', e);
        }
    },

    openPhotoSelector() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => this.handlePhotoSelect(e);
        input.click();
    },

    async handlePhotoSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Validar tamanho (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            showToast('Imagem muito grande (max 2MB)');
            return;
        }

        try {
            const dataURL = await this.compressImage(file, 200, 200, 0.8);
            this.savePhoto(dataURL);
            this.render();
            showToast('Foto atualizada!');
        } catch (err) {
            console.error(err);
            showToast('Erro ao processar imagem');
        }
    },

    compressImage(file, maxWidth, maxHeight, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let { width, height } = img;

                    // Redimensionar mantendo proporção
                    if (width > height) {
                        if (width > maxWidth) {
                            height = (height * maxWidth) / width;
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width = (width * maxHeight) / height;
                            height = maxHeight;
                        }
                    }

                    // Fazer crop quadrado central
                    const size = Math.min(width, height);
                    canvas.width = size;
                    canvas.height = size;

                    const ctx = canvas.getContext('2d');
                    const sx = (img.width - img.width * (size / width)) / 2;
                    const sy = (img.height - img.height * (size / height)) / 2;

                    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, size, size);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    removePhoto() {
        if (!confirm('Remover foto de perfil?')) return;
        
        localStorage.removeItem(`profilePhoto_${currentUser?.uid}`);
        this.photoURL = null;
        
        if (currentUser) {
            db.collection('users').doc(currentUser.uid).update({
                photoURL: null
            }).catch(console.error);
        }
        
        this.render();
        showToast('Foto removida');
    },

    getAvatarHTML(size = 'large') {
        const sizes = {
            small: { container: 40, icon: '1.2rem' },
            medium: { container: 60, icon: '1.8rem' },
            large: { container: 100, icon: '2.5rem' }
        };
        const s = sizes[size] || sizes.large;

        if (this.photoURL) {
            return `
                <div class="profile-avatar has-photo" 
                     style="width: ${s.container}px; height: ${s.container}px; background-image: url('${this.photoURL}');"
                     onclick="ProfileModule.openPhotoSelector()">
                    <div class="avatar-edit-overlay">📷</div>
                </div>
            `;
        }

        return `
            <div class="profile-avatar" 
                 style="width: ${s.container}px; height: ${s.container}px; font-size: ${s.icon};"
                 onclick="ProfileModule.openPhotoSelector()">
                👤
                <div class="avatar-edit-overlay">📷</div>
            </div>
        `;
    },

    render() {
        // Avatar na página de perfil
        const avatarContainer = document.getElementById('profileAvatarContainer');
        if (avatarContainer) {
            avatarContainer.innerHTML = this.getAvatarHTML('large');
        }

        // Nome e email
        if (currentUser) {
            const nameEl = document.getElementById('profileName');
            const emailEl = document.getElementById('profileEmail');
            if (nameEl) nameEl.textContent = currentUser.displayName || 'Usuário';
            if (emailEl) emailEl.textContent = currentUser.email;
        }
    }
};

// Exportar para uso global
window.ProfileModule = ProfileModule;