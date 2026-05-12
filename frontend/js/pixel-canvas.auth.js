'use strict';

// Authentication and profile behavior. Methods are split from the original PixelCanvas class without behavior changes.

window.PixelCanvas.prototype.initAuthModal = function() {
        const modal = document.getElementById('auth-modal');
        const tabs = document.querySelectorAll('.auth-tab');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const guestBtn = document.getElementById('guest-btn');
        const switchLink = document.getElementById('auth-switch-link');
        const switchText = document.getElementById('auth-switch-text');
        const title = document.getElementById('auth-title');

        modal.style.display = 'block';

        const switchTab = (tab) => {
            tabs.forEach(t => t.classList.remove('active'));
            const activeTab = typeof tab === 'string' ? document.querySelector(`[data-tab="${tab}"]`) : tab;
            activeTab.classList.add('active');
            
            if (activeTab.dataset.tab === 'login') {
                loginForm.style.display = 'flex';
                registerForm.style.display = 'none';
                title.textContent = 'Welcome Back';
                switchText.innerHTML = `Don't have an account? <a href="#" id="auth-switch-link">Register</a>`;
            } else {
                loginForm.style.display = 'none';
                registerForm.style.display = 'flex';
                title.textContent = 'Create Account';
                switchText.innerHTML = `Already have an account? <a href="#" id="auth-switch-link">Login</a>`;
            }
            
            // Re-bind switch link
            document.getElementById('auth-switch-link').addEventListener('click', (e) => {
                e.preventDefault();
                switchTab(activeTab.dataset.tab === 'login' ? 'register' : 'login');
            });
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab));
        });

        switchLink.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('register');
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            await this.login(email, password);
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('reg-name').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            await this.register(name, email, password);
        });

        guestBtn.addEventListener('click', () => {
            this.userName = 'Guest_' + Math.random().toString(36).substring(7);
            localStorage.setItem('pixelUserName', this.userName);
            modal.style.display = 'none';
            this.updateAuthUI();
            this.sendIdentify();
            if (!localStorage.getItem('sp_tour_seen')) this.startTour();
        });

        // Close logic
        const closeBtn = document.getElementById('auth-modal-close');
        const closeModal = () => {
            if (this.userName || this.user) {
                modal.style.display = 'none';
            } else {
                // If they have no name/user yet, we can't let them close without picking guest mode
                guestBtn.click();
            }
        };

        closeBtn.addEventListener('click', closeModal);

        window.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') closeModal();
        });


};

window.PixelCanvas.prototype.initProfilePage = function() {
        this.initTourReplayBtn();
        const page = document.getElementById('profile-page');
        const closeBtn = document.getElementById('close-profile-btn');
        const logoutBtn = document.getElementById('dash-logout-btn');
        const profileForm = document.getElementById('profile-form');

        const closePage = () => {
            page.style.display = 'none';
        };

        closeBtn.addEventListener('click', closePage);
        
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && page.style.display === 'flex') closePage();
        });

        // Initialize Public Profile close behavior
        const publicProfileModal = document.getElementById('public-profile-modal');
        const publicProfileCloseBtn = document.getElementById('close-public-profile-btn');
        const closePublicProfile = () => {
            publicProfileModal.style.display = 'none';
        };
        publicProfileCloseBtn.addEventListener('click', closePublicProfile);
        window.addEventListener('click', (e) => {
            if (e.target === publicProfileModal) closePublicProfile();
        });
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && publicProfileModal.style.display === 'flex') closePublicProfile();
        });

        logoutBtn.addEventListener('click', () => {
            this.logout();
            closePage();
        });

        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('save-profile-btn');
            const name = document.getElementById('profile-name').value;
            const password = document.getElementById('profile-password').value;
            const avatarStyle = document.getElementById('profile-avatar-style').value;
            
            const updateData = { name, avatarStyle };
            if (password) updateData.password = password;

            this.setLoading(submitBtn, true);
            try {
                const response = await fetch(`${this.getApiBaseUrl()}/users/me`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                    credentials: 'include',
                    body: JSON.stringify(updateData)
                });

                if (!response.ok) throw new Error('Update failed');
                
                const updatedUser = await response.json();
                this.user = updatedUser;
                localStorage.setItem('pixelUser', JSON.stringify(updatedUser)); // non-sensitive user info only
                this.userName = updatedUser.name;
                this.updateAuthUI();
                
                alert('Profile updated successfully!');
                document.getElementById('profile-password').value = '';
            } catch (error) {
                alert(error.message);
            } finally {
                this.setLoading(submitBtn, false);
            }
        });
    
};

window.PixelCanvas.prototype.setLoading = function(button, isLoading) {
        if (!button) return;
        if (isLoading) {
            button.classList.add('btn-loading');
            button.disabled = true;
        } else {
            button.classList.remove('btn-loading');
            button.disabled = false;
        }
    
};

window.PixelCanvas.prototype.openProfilePage = async function() {
        if (!this.user) return;

        const page = document.getElementById('profile-page');
        const pixelCountEl = document.getElementById('dash-pixel-count');
        const nameInput = document.getElementById('profile-name');
        const emailInput = document.getElementById('profile-email');

        const avatarEl = document.getElementById('dash-avatar');
        const usernameDisplayEl = document.getElementById('dash-username-display');

        // Show page and skeletons
        page.style.display = 'flex';
        usernameDisplayEl.textContent = this.user.name;
        avatarEl.innerHTML = '<div class="skeleton-dark dash-stat-skeleton" style="width:100%; height:100%; border-radius:50%;"></div>';
        pixelCountEl.innerHTML = '<div class="skeleton-dark dash-stat-skeleton"></div>';
        document.getElementById('dash-rank').innerHTML = '<div class="skeleton-dark dash-stat-skeleton"></div>';
        document.getElementById('dash-most-used-color').innerHTML = '<div class="skeleton-dark dash-stat-skeleton"></div>';
        nameInput.value = 'Loading...';
        emailInput.value = 'Loading...';
        
        // Start loading palettes for the profile view
        this.loadUserPalettes();

        try {
            const response = await fetch(`${this.getApiBaseUrl()}/users/me`, {
                credentials: 'include',
                headers: this.getAuthHeaders(),
            });

            if (!response.ok) {
                if (response.status === 401) {
                    this.user = null;
                    localStorage.removeItem('pixelUser');
                    page.style.display = 'none';
                    this.updateAuthUI();
                    this.initAuthModal();
                    return;
                }
                throw new Error('Failed to fetch profile');
            }

            const data = await response.json();

            // Populate page
            this.user.pixelCount = data.pixelCount;
            this.user.avatarStyle = data.avatarStyle || 'bottts';
            this.updateAuthUI();
            avatarEl.innerHTML = this.getAvatarHtml(data.name, data.pixelCount, this.user.avatarStyle);
            pixelCountEl.textContent = data.pixelCount.toLocaleString();
            
            // Populate Rank
            const rankEl = document.getElementById('dash-rank');
            rankEl.textContent = `#${data.rank || 0}`;

            // Populate Top Color
            const mostUsedColorEl = document.getElementById('dash-most-used-color');
            const colorPreviewEl = document.getElementById('dash-color-preview');
            if (data.mostUsedColor) {
                mostUsedColorEl.textContent = data.mostUsedColor.color.toUpperCase();
                colorPreviewEl.style.backgroundColor = data.mostUsedColor.color;
            } else {
                mostUsedColorEl.textContent = 'None';
                colorPreviewEl.style.backgroundColor = 'transparent';
            }

            nameInput.value = data.name;
            emailInput.value = data.email;
            const styleSelect = document.getElementById('profile-avatar-style');
            if (styleSelect) styleSelect.value = data.avatarStyle || 'bottts';
        } catch (error) {
            console.error('Profile error:', error);
            page.style.display = 'none';
        }
    
};

window.PixelCanvas.prototype.openPublicProfilePage = async function(userName) {
        if (!userName || userName === 'Anonymous') return;

        const modal = document.getElementById('public-profile-modal');
        const nameEl = document.getElementById('public-profile-name');
        const pixelCountEl = document.getElementById('public-dash-pixel-count');
        const rankEl = document.getElementById('public-dash-rank');
        const mostUsedColorEl = document.getElementById('public-dash-most-used-color');
        const colorPreviewEl = document.getElementById('public-dash-color-preview');

        const avatarEl = document.getElementById('public-profile-avatar');

        // Show modal and skeletons
        modal.style.display = 'flex';
        nameEl.textContent = userName;
        avatarEl.innerHTML = '<div class="skeleton-dark dash-stat-skeleton" style="width:100%; height:100%; border-radius:50%;"></div>';
        pixelCountEl.innerHTML = '<div class="skeleton-dark dash-stat-skeleton"></div>';
        rankEl.innerHTML = '<div class="skeleton-dark dash-stat-skeleton"></div>';
        mostUsedColorEl.innerHTML = '<div class="skeleton-dark dash-stat-skeleton"></div>';
        
        try {
            const response = await fetch(`${this.getApiBaseUrl()}/users/public/${encodeURIComponent(userName)}`);

            if (!response.ok) {
                throw new Error('Failed to fetch public profile');
            }

            const data = await response.json();

            // Populate page
            nameEl.textContent = data.name;
            avatarEl.innerHTML = this.getAvatarHtml(data.name, data.pixelCount, data.avatarStyle);
            pixelCountEl.textContent = data.pixelCount.toLocaleString();
            rankEl.textContent = `#${data.rank || 0}`;

            if (data.mostUsedColor) {
                mostUsedColorEl.textContent = data.mostUsedColor.color.toUpperCase();
                colorPreviewEl.style.backgroundColor = data.mostUsedColor.color;
            } else {
                mostUsedColorEl.textContent = 'None';
                colorPreviewEl.style.backgroundColor = 'transparent';
            }
        } catch (error) {
            console.error('Public Profile error:', error);
            pixelCountEl.textContent = 'Error';
            rankEl.textContent = 'Error';
            mostUsedColorEl.textContent = 'Error';
            colorPreviewEl.style.backgroundColor = 'transparent';
        }
};

window.PixelCanvas.prototype.login = async function(email, password) {
        const btn = document.querySelector('#login-form button[type="submit"]');
        this.setLoading(btn, true);
        try {
            const response = await fetch(`${this.getApiBaseUrl()}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Login failed');
            }

            const data = await response.json();
            this.handleAuthSuccess(data);
        } catch (error) {
            alert(error.message);
        } finally {
            this.setLoading(btn, false);
        }
    
};

window.PixelCanvas.prototype.register = async function(name, email, password) {
        const btn = document.querySelector('#register-form button[type="submit"]');
        this.setLoading(btn, true);
        try {
            const response = await fetch(`${this.getApiBaseUrl()}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, email, password })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Registration failed');
            }

            const data = await response.json();
            this.handleAuthSuccess(data);
        } catch (error) {
            alert(error.message);
        } finally {
            this.setLoading(btn, false);
        }
    
};

window.PixelCanvas.prototype.handleAuthSuccess = function(data) {
        this.user = data.user;
        this.userName = data.user.name;

        localStorage.setItem('pixelUser', JSON.stringify(this.user));
        localStorage.removeItem('pixelUserName');
        // Store token as Bearer fallback for browsers that block cross-site cookies (e.g. Safari ITP)
        if (data.access_token) localStorage.setItem('authToken', data.access_token);

        document.getElementById('auth-modal').style.display = 'none';
        this.updateAuthUI();
        this.loadUserPalettes();

        if (this.ws) this.ws.close();
        this.connectWebSocket();

        if (!localStorage.getItem('sp_tour_seen')) this.startTour();
    
};

window.PixelCanvas.prototype.getAuthHeaders = function() {
        const token = localStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    
};

window.PixelCanvas.prototype.logout = async function() {
        try {
            await fetch(`${this.getApiBaseUrl()}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getAuthHeaders(),
            });
        } catch (e) {
            console.warn('Logout request failed', e);
        }
        this.user = null;
        this.userName = '';
        localStorage.removeItem('pixelUser');
        localStorage.removeItem('pixelUserName');
        localStorage.removeItem('authToken');

        this.updateAuthUI();
        if (this.ws) this.ws.close();
        this.connectWebSocket();
        this.initAuthModal();
        if (this.user) {
            this.loadUserPalettes();
        }
    
};

window.PixelCanvas.prototype.updateAuthUI = function() {
        const profileContainer = document.getElementById('user-profile');
        if (this.user) {
            const avatarHtml = this.getAvatarHtml(this.user.name, this.user.pixelCount || 0, this.user.avatarStyle);
            profileContainer.innerHTML = `
                <div class="profile-info clickable" id="open-profile-btn" title="Open Dashboard">
                    <div style="width: 28px; height: 28px; flex-shrink: 0;">${avatarHtml}</div>
                    <span class="user-name-label">${this.user.name}</span>
                </div>
            `;
            document.getElementById('open-profile-btn').addEventListener('click', () => this.openProfilePage());
            
            // Hide "Login to Edit" messages
            const lockedMsg = document.querySelector('.edit-locked-message');
            if (lockedMsg) lockedMsg.classList.remove('visible');
        } else {
            profileContainer.innerHTML = `
                <button id="login-trigger-btn" class="header-icon-btn profile-btn">
                    <i class="fas fa-user-circle"></i>
                    <span>Login</span>
                </button>
            `;
            document.getElementById('login-trigger-btn').addEventListener('click', () => this.initAuthModal());
            
            // Show "Login to Edit" message if in guest mode
            this.updateEditLockedMessage();
        }
    
};

window.PixelCanvas.prototype.updateEditLockedMessage = function() {
        const container = document.querySelector('.mode-toggle-container');
        let msg = container.querySelector('.edit-locked-message');
        if (!msg) {
            msg = document.createElement('div');
            msg.className = 'edit-locked-message';
            msg.textContent = 'Login to enable editing';
            container.appendChild(msg);
        }
        
        if (!this.user) {
            msg.classList.add('visible');
        } else {
            msg.classList.remove('visible');
        }
    
};
