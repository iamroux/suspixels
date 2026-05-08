class PixelCanvas {
    constructor() {
        this.canvas = document.getElementById('pixel-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('canvas-container');

        // Canvas settings
        this.gridSize = 3000;
        this.pixelSize = 1;
        this.zoom = 0.3;
        this.minZoom = 0.1;
        this.maxZoom = 40;

        // Pan settings
        this.viewportX = 0;
        this.viewportY = 0;
        this.isPanning = false;
        this.lastPanX = 0;
        this.lastPanY = 0;

        // Drawing settings
        this.selectedColor = '#000000';
        this.isErasing = false;
        this.isColorPickerMode = false;
        this.pixels = new Map();
        this.pixelMetadata = new Map();
        this.recentColors = JSON.parse(localStorage.getItem('recentColors') || JSON.stringify(['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF']));

        // Edit mode settings
        this.isEditMode = false;
        this.isContinuousDraw = false;
        this.pendingChanges = new Map(); // Stores pending pixel changes in edit mode
        this.originalPixels = new Map(); // Stores original pixel state before edit

        // WebSocket
        this.ws = null;
        this.connected = false;
        this.userCount = 0;
        this.userNames = [];

        // Touch handling
        this.touches = [];
        this.lastTouchDistance = 0;
        this.touchStartTime = 0;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchMoved = false;

        // Pixel info hover
        this.pixelInfoTimeout = null;

        // Brush size (applies to draw and erase)
        this.brushSize = 1;

        // Cursor preview (grid hover)
        this.cursorGridX = -1;
        this.cursorGridY = -1;
        this._cursorRafPending = false;

        // Auth state (token lives in httpOnly cookie — never in JS)
        this.user = JSON.parse(localStorage.getItem('pixelUser') || 'null');
        this.userName = this.user ? this.user.name : (localStorage.getItem('pixelUserName') || '');

        if (!this.user && !this.userName) {
            this.initAuthModal();
        }

        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupColorPicker();
        this.setupBrushSize();
        this.initUsersPopover();
        this.initDashboardModal();
        this.initColdStartBanner();
        this.updateAuthUI();
        this.connectWebSocket();
        this.loadPixels();
        this.centerCanvas();
        this.render();
    }

    initColdStartBanner() {
        const banner = document.getElementById('cold-start-banner');
        const dismiss = document.getElementById('cold-start-dismiss');
        if (!banner || !dismiss) return;
        this._coldStartHidden = false;
        const hide = () => {
            if (this._coldStartHidden) return;
            this._coldStartHidden = true;
            banner.hidden = true;
        };
        this._hideColdStartBanner = hide;
        dismiss.addEventListener('click', hide);
        // Show only if backend hasn't responded within 1.5s.
        this._coldStartTimer = setTimeout(() => {
            if (!this._coldStartHidden) banner.hidden = false;
        }, 1500);
    }

    getApiBaseUrl() {
        // Change this once you have your Render backend URL (e.g., 'https://suspixels-api.onrender.com')
        const prodApiUrl = 'https://suspixels-api.onrender.com'; 
        if (prodApiUrl) return prodApiUrl;

        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocal) {
            return 'http://localhost:3002';
        }

        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const host = window.location.host;
        // If frontend is served on 8000 (Dockerfile), backend is on 3002 on same host
        const backendHost = host.replace(/:8000$/, ':3002');
        return `${protocol}//${backendHost}`;
    }

    getWsUrl() {
        // Change this once you have your Render backend URL (e.g., 'wss://suspixels-api.onrender.com')
        const prodWsUrl = 'wss://suspixels-api.onrender.com'; 
        if (prodWsUrl) return prodWsUrl;

        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocal) {
            return 'ws://localhost:3002';
        }

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const backendHost = host.replace(/:8000$/, ':3002');
        return `${wsProtocol}//${backendHost}`;
    }

    initAuthModal() {
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
    }

    initDashboardModal() {
        const modal = document.getElementById('dashboard-modal');
        const closeBtn = document.getElementById('dashboard-modal-close');
        const logoutBtn = document.getElementById('dash-logout-btn');
        const profileForm = document.getElementById('profile-form');

        const closeModal = () => {
            modal.style.display = 'none';
        };

        closeBtn.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') closeModal();
        });

        logoutBtn.addEventListener('click', () => {
            this.logout();
            closeModal();
        });

        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('save-profile-btn');
            const name = document.getElementById('profile-name').value;
            const password = document.getElementById('profile-password').value;
            
            const updateData = { name };
            if (password) updateData.password = password;

            this.setLoading(submitBtn, true);
            try {
                const response = await fetch(`${this.getApiBaseUrl()}/users/me`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
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
    }

    setLoading(button, isLoading) {
        if (!button) return;
        if (isLoading) {
            button.classList.add('btn-loading');
            button.disabled = true;
        } else {
            button.classList.remove('btn-loading');
            button.disabled = false;
        }
    }

    async openDashboard() {
        if (!this.user) return;

        const modal = document.getElementById('dashboard-modal');
        const pixelCountEl = document.getElementById('dash-pixel-count');
        const nameInput = document.getElementById('profile-name');
        const emailInput = document.getElementById('profile-email');

        // Show modal and skeletons
        modal.style.display = 'block';
        pixelCountEl.innerHTML = '<div class="skeleton-dark dash-stat-skeleton"></div>';
        nameInput.value = 'Loading...';
        emailInput.value = 'Loading...';

        try {
            const response = await fetch(`${this.getApiBaseUrl()}/users/me`, {
                credentials: 'include',
            });

            if (!response.ok) {
                if (response.status === 401) {
                    this.user = null;
                    localStorage.removeItem('pixelUser');
                    modal.style.display = 'none';
                    this.updateAuthUI();
                    this.initAuthModal();
                    return;
                }
                throw new Error('Failed to fetch profile');
            }

            const data = await response.json();

            // Populate modal
            pixelCountEl.textContent = data.pixelCount.toLocaleString();
            nameInput.value = data.name;
            emailInput.value = data.email;
        } catch (error) {
            console.error('Dashboard error:', error);
            modal.style.display = 'none';
        }
    }

    async login(email, password) {
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
    }

    async register(name, email, password) {
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
    }

    handleAuthSuccess(data) {
        // Token is set as httpOnly cookie by the server — not stored in JS
        this.user = data.user;
        this.userName = data.user.name;

        localStorage.setItem('pixelUser', JSON.stringify(this.user));
        localStorage.removeItem('pixelUserName');

        document.getElementById('auth-modal').style.display = 'none';
        this.updateAuthUI();

        // Reconnect WebSocket — server reads auth from cookie on upgrade request
        if (this.ws) this.ws.close();
        this.connectWebSocket();
    }

    async logout() {
        try {
            await fetch(`${this.getApiBaseUrl()}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch (e) {
            console.warn('Logout request failed', e);
        }
        this.user = null;
        this.userName = '';
        localStorage.removeItem('pixelUser');
        localStorage.removeItem('pixelUserName');

        this.updateAuthUI();
        if (this.ws) this.ws.close();
        this.connectWebSocket();
        this.initAuthModal();
    }

    updateAuthUI() {
        const profileContainer = document.getElementById('user-profile');
        if (this.user) {
            const initial = this.user.name.charAt(0).toUpperCase();
            profileContainer.innerHTML = `
                <div class="profile-info clickable" id="open-profile-btn" title="Open Dashboard">
                    <div class="user-avatar">${initial}</div>
                    <span class="user-name-label">${this.user.name}</span>
                </div>
            `;
            document.getElementById('open-profile-btn').addEventListener('click', () => this.openDashboard());
            
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
    }

    updateEditLockedMessage() {
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
    }

    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }

    centerCanvas() {
        this.viewportX = 0;
        this.viewportY = 0;
        this.render();
    }

    setupEventListeners() {
        // Mode toggle button
        document.getElementById('mode-toggle-btn').addEventListener('click', () => {
            this.toggleEditMode();
        });

        // Apply changes button
        document.getElementById('apply-changes-btn').addEventListener('click', async () => {
            await this.applyPendingChanges();
        });

        // Discard changes button
        document.getElementById('discard-changes-btn').addEventListener('click', () => {
            this.discardPendingChanges();
        });

        // Undo last change button
        document.getElementById('undo-btn').addEventListener('click', () => {
            this.undoPendingChange();
        });

        // Eraser tool
        document.getElementById('eraser-btn').addEventListener('click', () => {
            if (!this.isEditMode) return;
            this.isErasing = !this.isErasing;
            document.getElementById('eraser-btn').classList.toggle('active', this.isErasing);
            document.getElementById('selected-color').style.backgroundColor = this.isErasing ? 'transparent' : this.selectedColor;
        });

        // Continuous Draw tool (Mobile)
        document.getElementById('continuous-draw-btn').addEventListener('click', () => {
            if (!this.isEditMode) return;
            this.isContinuousDraw = !this.isContinuousDraw;
            document.getElementById('continuous-draw-btn').classList.toggle('active', this.isContinuousDraw);
        });

        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        // Leaderboard button
        document.getElementById('leaderboard-btn').addEventListener('click', async () => {
            const modal = document.getElementById('leaderboard-modal');
            const tableBody = document.getElementById('leaderboard-table').querySelector('tbody');
            
            // Show modal and skeleton loading immediately
            modal.style.display = 'block';
            tableBody.innerHTML = Array(5).fill(0).map(() => `
                <tr>
                    <td><div class="skeleton-dark leaderboard-skeleton-row"></div></td>
                    <td><div class="skeleton-dark leaderboard-skeleton-row"></div></td>
                </tr>
            `).join('');

            try {
                const response = await fetch(`${this.getApiBaseUrl()}/api/pixels/leaderboard`);
                if (!response.ok) throw new Error('Failed to fetch leaderboard');
                const leaderboard = await response.json();

                tableBody.innerHTML = ''; // Clear skeletons
                leaderboard.forEach((entry, index) => {
                    const row = document.createElement('tr');
                    
                    if (index === 0) row.classList.add('rank-gold');
                    else if (index === 1) row.classList.add('rank-silver');
                    else if (index === 2) row.classList.add('rank-bronze');
                    
                    const nameCell = document.createElement('td');
                    const countCell = document.createElement('td');

                    let rankPrefix = `<span class="rank-number">${index + 1}.</span>`;
                    if (index === 0) rankPrefix = `<i class="fas fa-trophy rank-icon rank-gold-icon"></i> ${rankPrefix}`;
                    else if (index === 1) rankPrefix = `<i class="fas fa-medal rank-icon rank-silver-icon"></i> ${rankPrefix}`;
                    else if (index === 2) rankPrefix = `<i class="fas fa-medal rank-icon rank-bronze-icon"></i> ${rankPrefix}`;

                    nameCell.innerHTML = `${rankPrefix}<span class="player-name">${entry.name}</span>`;
                    countCell.innerHTML = `<span class="pixel-count">${entry.pixelCount.toLocaleString()}</span>`;

                    row.appendChild(nameCell);
                    row.appendChild(countCell);
                    tableBody.appendChild(row);
                });
            } catch (error) {
                console.error('Leaderboard error:', error);
                tableBody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 2rem;">Failed to load leaderboard</td></tr>';
            }
        });

        document.getElementById('close-leaderboard').addEventListener('click', () => {
            document.getElementById('leaderboard-modal').style.display = 'none';
        });
    }

    setupColorPicker() {
        // Color picker button
        document.getElementById('color-wheel-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const modal = document.getElementById('color-picker-modal');
            const colorWheel = document.getElementById('color-wheel');
            const hexInput = document.getElementById('color-hex-input');
            
            colorWheel.value = this.selectedColor;
            hexInput.value = this.selectedColor;
            modal.style.display = 'block';
            
            colorWheel.addEventListener('input', () => {
                hexInput.value = colorWheel.value;
            });
            
            hexInput.addEventListener('input', (e) => {
                if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                    colorWheel.value = e.target.value;
                }
            });

            const confirmHandler = () => {
                if (/^#[0-9A-F]{6}$/i.test(hexInput.value)) {
                    this.selectedColor = hexInput.value.toUpperCase();
                    document.getElementById('selected-color').style.backgroundColor = this.selectedColor;
                    this.isErasing = false;
                    document.getElementById('eraser-btn').classList.remove('active');
                    this.addRecentColor(this.selectedColor);
                }
                modal.style.display = 'none';
                document.getElementById('confirm-color-btn').removeEventListener('click', confirmHandler);
            };

            document.getElementById('confirm-color-btn').addEventListener('click', confirmHandler);

            // Close modal when clicking outside
            const modalClickHandler = (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                    modal.removeEventListener('click', modalClickHandler);
                    document.getElementById('confirm-color-btn').removeEventListener('click', confirmHandler);
                }
            };
            modal.addEventListener('click', modalClickHandler);
        });

        // Color picker mode button
        document.getElementById('color-picker-btn').addEventListener('click', () => {
            this.toggleColorPickerMode();
        });
    }

    setupBrushSize() {
        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.brushSize = parseInt(btn.dataset.size);
                document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    addRecentColor(color) {
        this.recentColors = this.recentColors.filter(c => c !== color);
        this.recentColors.unshift(color);
        if (this.recentColors.length > 10) {
            this.recentColors = this.recentColors.slice(0, 10);
        }
        localStorage.setItem('recentColors', JSON.stringify(this.recentColors));
    }

    toggleColorPickerMode() {
        this.isColorPickerMode = !this.isColorPickerMode;
        const pickerBtn = document.getElementById('color-picker-btn');
        pickerBtn.classList.toggle('active', this.isColorPickerMode);
        this.canvas.style.cursor = this.isColorPickerMode ? 'crosshair' : '';

        if (this.isColorPickerMode) {
            const indicator = document.createElement('div');
            indicator.className = 'color-picker-mode';
            indicator.textContent = 'Click on a pixel to pick its color';
            indicator.id = 'color-picker-indicator';
            document.body.appendChild(indicator);
        } else {
            const indicator = document.getElementById('color-picker-indicator');
            if (indicator) {
                indicator.remove();
            }
        }
    }

    handlePixelColorPick(x, y) {
        const pixelKey = `${x},${y}`;
        if (this.pixels.has(pixelKey)) {
            const color = this.pixels.get(pixelKey);
            this.selectedColor = color;
            document.getElementById('selected-color').style.backgroundColor = color;
            this.addRecentColor(color);
            this.isErasing = false;
            document.getElementById('eraser-btn').classList.remove('active');

            const indicator = document.getElementById('color-picker-indicator');
            if (indicator) {
                indicator.textContent = `Picked color: ${color}`;
                setTimeout(() => {
                    if (this.isColorPickerMode && indicator) {
                        indicator.textContent = 'Click on a pixel to pick its color';
                    }
                }, 1000);
            }
        }
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (e.button === 0) {
            const gridPos = this.screenToGrid(x, y);
            if (this.isValidGridPosition(gridPos.x, gridPos.y)) {
                if (this.isColorPickerMode) {
                    this.handlePixelColorPick(gridPos.x, gridPos.y);
                    this.toggleColorPickerMode();
                } else if (this.isEditMode) {
                    this.placePixel(gridPos.x, gridPos.y);
                } else {
                    // Explore mode: Show info on click
                    if (this.pixels.has(`${gridPos.x},${gridPos.y}`)) {
                        this.updatePixelInfoPosition(e.clientX, e.clientY);
                        this.showPixelInfo(gridPos.x, gridPos.y);
                    } else {
                        this.hidePixelInfo();
                    }
                }
            }
        } else if (e.button === 2) {
            this.startPan(x, y);
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const gridPos = this.screenToGrid(x, y);
        document.getElementById('coordinates').textContent = `${gridPos.x}, ${gridPos.y}`;

        if (this.isPanning) {
            this.updatePan(x, y);
        }

        if (this.isEditMode) {
            this.cursorGridX = gridPos.x;
            this.cursorGridY = gridPos.y;
            if (!this._cursorRafPending) {
                this._cursorRafPending = true;
                requestAnimationFrame(() => {
                    this._cursorRafPending = false;
                    this.render();
                });
            }
        }
    }

    handleMouseUp(e) {
        if (e.button === 2) {
            this.endPan();
        }
    }

    handleMouseLeave() {
        this.hidePixelInfo();
        this.cursorGridX = -1;
        this.cursorGridY = -1;
        if (this.isPanning) {
            this.endPan();
        }
        if (this.isEditMode) this.render();
    }

    handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoomAt(mouseX, mouseY, delta);
    }

    handleTouchStart(e) {
        e.preventDefault();
        this.touches = Array.from(e.touches);

        if (this.touches.length === 1) {
            const touch = this.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            this.touchStartTime = Date.now();
            this.touchStartX = x;
            this.touchStartY = y;
            this.touchMoved = false;

            if (this.isColorPickerMode) {
                const gridPos = this.screenToGrid(x, y);
                if (this.isValidGridPosition(gridPos.x, gridPos.y)) {
                    this.handlePixelColorPick(gridPos.x, gridPos.y);
                    this.toggleColorPickerMode();
                }
                return;
            }
        } else if (this.touches.length === 2) {
            this.lastTouchDistance = this.getTouchDistance();
            this.touchStartTime = null;
            const centerX = (this.touches[0].clientX + this.touches[1].clientX) / 2;
            const centerY = (this.touches[0].clientY + this.touches[1].clientY) / 2;
            const rect = this.canvas.getBoundingClientRect();
            this.startPan(centerX - rect.left, centerY - rect.top);
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (this.isColorPickerMode) return;

        this.touches = Array.from(e.touches);

        if (this.touches.length === 1) {
            const touch = this.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            const moveDistance = Math.sqrt(
                Math.pow(x - this.touchStartX, 2) +
                Math.pow(y - this.touchStartY, 2)
            );

            if (moveDistance > 5) {
                this.touchMoved = true;

                if (this.isEditMode && this.isContinuousDraw) {
                    const gridPos = this.screenToGrid(x, y);
                    if (this.isValidGridPosition(gridPos.x, gridPos.y)) {
                        this.placePixel(gridPos.x, gridPos.y);
                    }
                } else {
                    if (!this.isPanning) {
                        this.startPan(this.touchStartX, this.touchStartY);
                    }
                    this.updatePan(x, y);
                }
            }
        } else if (this.touches.length === 2) {
            const currentDistance = this.getTouchDistance();
            const centerX = (this.touches[0].clientX + this.touches[1].clientX) / 2;
            const centerY = (this.touches[0].clientY + this.touches[1].clientY) / 2;
            const rect = this.canvas.getBoundingClientRect();

            if (this.lastTouchDistance > 0) {
                const scale = currentDistance / this.lastTouchDistance;
                this.zoomAt(centerX - rect.left, centerY - rect.top, scale);
            }
            
            if (!this.isPanning) {
                this.startPan(centerX - rect.left, centerY - rect.top);
            } else {
                this.updatePan(centerX - rect.left, centerY - rect.top);
            }
            
            this.lastTouchDistance = currentDistance;
            this.touchMoved = true;
        }
    }

    handleTouchEnd(e) {
        e.preventDefault();
        if (this.isColorPickerMode) return;

        this.touches = Array.from(e.touches);

        if (this.touches.length === 0) {
            if (this.isPanning) {
                this.endPan();
            }
            
            if (!this.touchMoved && this.touchStartTime) {
                const timeDiff = Date.now() - this.touchStartTime;
                if (timeDiff < 500) { // Increased tap tolerance for mobile
                    const gridPos = this.screenToGrid(this.touchStartX, this.touchStartY);
                    if (this.isValidGridPosition(gridPos.x, gridPos.y)) {
                        if (this.isEditMode) {
                            this.placePixel(gridPos.x, gridPos.y);
                        } else {
                            // Explore mode: Show info on touch
                            if (this.pixels.has(`${gridPos.x},${gridPos.y}`)) {
                                const touch = e.changedTouches[0];
                                this.updatePixelInfoPosition(touch.clientX, touch.clientY);
                                this.showPixelInfo(gridPos.x, gridPos.y);
                            } else {
                                this.hidePixelInfo();
                            }
                        }
                    }
                }
            }

            this.touchStartTime = null;
            this.touchMoved = false;
            this.lastTouchDistance = 0;
        } else if (this.touches.length < 2) {
            this.lastTouchDistance = 0;
            if (this.isPanning) {
                this.endPan();
            }
            // If dropping from 2 fingers to 1, reset touch start for the remaining finger
            if (this.touches.length === 1) {
                const touch = this.touches[0];
                const rect = this.canvas.getBoundingClientRect();
                this.touchStartX = touch.clientX - rect.left;
                this.touchStartY = touch.clientY - rect.top;
            }
        }
    }

    getTouchDistance() {
        if (this.touches.length < 2) return 0;
        const dx = this.touches[0].clientX - this.touches[1].clientX;
        const dy = this.touches[0].clientY - this.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    startPan(x, y) {
        this.isPanning = true;
        this.lastPanX = x;
        this.lastPanY = y;
        this.container.classList.add('panning');
    }

    updatePan(x, y) {
        if (!this.isPanning) return;

        const dx = x - this.lastPanX;
        const dy = y - this.lastPanY;

        this.viewportX += dx;
        this.viewportY += dy;

        this.clampOffsets();

        this.lastPanX = x;
        this.lastPanY = y;

        this.render();
    }

    endPan() {
        this.isPanning = false;
        this.container.classList.remove('panning');
    }

    zoomAt(x, y, scale) {
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * scale));

        if (newZoom !== this.zoom) {
            // Get exact continuous world coordinates to avoid snapping/drifting
            const canvasWidth1 = this.gridSize * this.pixelSize * this.zoom;
            const canvasHeight1 = this.gridSize * this.pixelSize * this.zoom;
            const centerX1 = (this.canvas.width - canvasWidth1) / 2;
            const centerY1 = (this.canvas.height - canvasHeight1) / 2;
            
            const worldX = (x - centerX1 - this.viewportX) / this.zoom;
            const worldY = (y - centerY1 - this.viewportY) / this.zoom;

            this.zoom = newZoom;

            const canvasWidth2 = this.gridSize * this.pixelSize * this.zoom;
            const canvasHeight2 = this.gridSize * this.pixelSize * this.zoom;
            const centerX2 = (this.canvas.width - canvasWidth2) / 2;
            const centerY2 = (this.canvas.height - canvasHeight2) / 2;

            const newScreenX = centerX2 + (worldX * this.zoom) + this.viewportX;
            const newScreenY = centerY2 + (worldY * this.zoom) + this.viewportY;

            this.viewportX += (x - newScreenX);
            this.viewportY += (y - newScreenY);

            this.clampOffsets();

            document.getElementById('zoom-level').textContent = `${Math.round(this.zoom * 100)}%`;
            this.render();
        }
    }

    screenToGrid(screenX, screenY) {
        const canvasWidth = this.gridSize * this.pixelSize * this.zoom;
        const canvasHeight = this.gridSize * this.pixelSize * this.zoom;
        const centerX = (this.canvas.width - canvasWidth) / 2;
        const centerY = (this.canvas.height - canvasHeight) / 2;

        const worldX = (screenX - centerX - this.viewportX) / this.zoom;
        const worldY = (screenY - centerY - this.viewportY) / this.zoom;

        return {
            x: Math.floor(worldX / this.pixelSize),
            y: Math.floor(worldY / this.pixelSize)
        };
    }

    gridToScreen(gridX, gridY) {
        const canvasWidth = this.gridSize * this.pixelSize * this.zoom;
        const canvasHeight = this.gridSize * this.pixelSize * this.zoom;
        const centerX = (this.canvas.width - canvasWidth) / 2;
        const centerY = (this.canvas.height - canvasHeight) / 2;

        return {
            x: centerX + (gridX * this.pixelSize) * this.zoom + this.viewportX,
            y: centerY + (gridY * this.pixelSize) * this.zoom + this.viewportY
        };
    }

    clampOffsets() {
        const canvasWidth = this.gridSize * this.pixelSize * this.zoom;
        const canvasHeight = this.gridSize * this.pixelSize * this.zoom;

        const maxViewportX = canvasWidth / 2;
        const maxViewportY = canvasHeight / 2;

        this.viewportX = Math.max(-maxViewportX, Math.min(maxViewportX, this.viewportX));
        this.viewportY = Math.max(-maxViewportY, Math.min(maxViewportY, this.viewportY));
    }

    isValidGridPosition(x, y) {
        return x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize;
    }

    toggleEditMode() {
        if (!this.user) {
            this.initAuthModal();
            return;
        }
        this.isEditMode = !this.isEditMode;
        const modeBtn = document.getElementById('mode-toggle-btn');
        const editActions = document.getElementById('edit-mode-actions');
        const toolButtons = document.querySelectorAll('.tool-btn');

        if (this.isEditMode) {
            modeBtn.classList.remove('explore-mode');
            modeBtn.classList.add('edit-mode');
            modeBtn.querySelector('i').className = 'fas fa-edit';
            modeBtn.querySelector('span').textContent = 'Edit Mode';
            editActions.style.display = 'flex';
            
            // Enable tool buttons
            toolButtons.forEach(btn => btn.removeAttribute('disabled'));
        } else {
            modeBtn.classList.remove('edit-mode');
            modeBtn.classList.add('explore-mode');
            modeBtn.querySelector('i').className = 'fas fa-eye';
            modeBtn.querySelector('span').textContent = 'Explore Mode';
            editActions.style.display = 'none';
            
            // Disable tool buttons
            toolButtons.forEach(btn => btn.setAttribute('disabled', 'true'));
            
            // Clear any pending changes when exiting edit mode
            if (this.pendingChanges.size > 0) {
                const confirmed = confirm('You have unsaved changes. Do you want to discard them?');
                if (!confirmed) {
                    // Revert back to edit mode
                    this.isEditMode = true;
                    modeBtn.classList.remove('explore-mode');
                    modeBtn.classList.add('edit-mode');
                    modeBtn.querySelector('i').className = 'fas fa-edit';
                    modeBtn.querySelector('span').textContent = 'Edit Mode';
                    editActions.style.display = 'flex';
                    toolButtons.forEach(btn => btn.removeAttribute('disabled'));
                    return;
                }
                this.discardPendingChanges();
            }
        }
    }

    async placePixel(x, y) {
        if (!this.isEditMode) return;
        try {
            const offset = Math.floor((this.brushSize - 1) / 2);
            for (let dy = 0; dy < this.brushSize; dy++) {
                for (let dx = 0; dx < this.brushSize; dx++) {
                    const px = x - offset + dx;
                    const py = y - offset + dy;
                    if (this.isValidGridPosition(px, py)) {
                        this.placeSinglePixel(px, py);
                    }
                }
            }
            this.updatePendingChangesCount();
        } catch (error) {
            console.error('Failed to place pixel:', error);
        }
    }

    placeSinglePixel(x, y) {
        const pixelKey = `${x},${y}`;
        if (this.isErasing) {
            if (!this.originalPixels.has(pixelKey) && this.pixels.has(pixelKey)) {
                this.originalPixels.set(pixelKey, {
                    color: this.pixels.get(pixelKey),
                    metadata: this.pixelMetadata.get(pixelKey)
                });
            }
            this.pendingChanges.set(pixelKey, { action: 'delete' });
            this.deletePixelLocally(x, y);
        } else {
            if (!this.originalPixels.has(pixelKey)) {
                this.originalPixels.set(pixelKey, this.pixels.has(pixelKey) ? {
                    color: this.pixels.get(pixelKey),
                    metadata: this.pixelMetadata.get(pixelKey)
                } : null);
            }
            this.pendingChanges.set(pixelKey, { action: 'set', color: this.selectedColor, x, y });
            this.updatePixelLocally(x, y, this.selectedColor);
        }
    }

    updatePendingChangesCount() {
        const count = this.pendingChanges.size;
        const countElement = document.getElementById('pending-count');
        countElement.textContent = count === 1 ? '1 change' : `${count} changes`;
        
        // Enable/disable apply, discard, and undo buttons based on pending changes
        const applyBtn = document.getElementById('apply-changes-btn');
        const discardBtn = document.getElementById('discard-changes-btn');
        const undoBtn = document.getElementById('undo-btn');
        applyBtn.disabled = count === 0;
        discardBtn.disabled = count === 0;
        undoBtn.disabled = count === 0;
    }

    undoPendingChange() {
        if (this.pendingChanges.size === 0) return;

        // Get the last inserted key in the Map
        const keys = Array.from(this.pendingChanges.keys());
        const lastKey = keys[keys.length - 1];
        
        // Remove from pending changes
        this.pendingChanges.delete(lastKey);

        // Revert visually
        const [x, y] = lastKey.split(',').map(Number);
        const original = this.originalPixels.get(lastKey);

        if (original === null) {
            // Pixel didn't exist before, so delete it locally
            this.deletePixelLocally(x, y);
        } else if (original) {
            // Restore original pixel
            this.updatePixelLocally(x, y, original.color, original.metadata);
        }

        // We don't need to remove it from originalPixels, because if they edit it again, 
        // originalPixels already correctly stores what it was originally.
        // However, to keep memory clean, if they reverted the ONLY change to this pixel,
        // we could delete it, but leaving it is harmless and safer.

        this.updatePendingChangesCount();
    }

    async applyPendingChanges() {
        if (this.pendingChanges.size === 0) return;

        const applyBtn = document.getElementById('apply-changes-btn');
        applyBtn.disabled = true;
        applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Applying...</span>';

        try {
            // Build batch operations array
            const operations = [];
            for (const [pixelKey, change] of this.pendingChanges) {
                if (change.action === 'set') {
                    operations.push({
                        action: 'set',
                        data: {
                            x: change.x,
                            y: change.y,
                            color: change.color,
                            insertedBy: this.userName
                        }
                    });
                } else if (change.action === 'delete') {
                    const [x, y] = pixelKey.split(',').map(Number);
                    operations.push({
                        action: 'delete',
                        data: { x, y }
                    });
                }
            }

            console.log(`🚀 Batch applying ${operations.length} changes in ONE request`);

            // Send single batch request
            const response = await fetch(`${this.getApiBaseUrl()}/api/pixels/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ operations })
            });

            if (!response.ok) {
                throw new Error('Batch operation failed');
            }

            const result = await response.json();
            console.log(`✅ Batch complete: ${result.success} successful, ${result.failed} failed`);

            // Clear pending changes
            this.pendingChanges.clear();
            this.originalPixels.clear();
            this.updatePendingChangesCount();

            applyBtn.innerHTML = '<i class="fas fa-check"></i><span>Applied!</span>';
            setTimeout(() => {
                applyBtn.innerHTML = '<i class="fas fa-check"></i><span>Apply</span>';
            }, 2000);
        } catch (error) {
            console.error('Failed to apply changes:', error);
            alert('Failed to apply some changes. Please try again.');
            applyBtn.innerHTML = '<i class="fas fa-check"></i><span>Apply</span>';
            applyBtn.disabled = false;
        }
    }

    discardPendingChanges() {
        // Restore original pixels
        for (const [pixelKey, original] of this.originalPixels) {
            const [x, y] = pixelKey.split(',').map(Number);
            if (original === null) {
                // Pixel didn't exist before, remove it
                this.deletePixelLocally(x, y);
            } else {
                // Restore original pixel
                this.updatePixelLocally(x, y, original.color, original.metadata);
            }
        }

        this.pendingChanges.clear();
        this.originalPixels.clear();
        this.updatePendingChangesCount();
        this.render();
    }

    updatePixelLocally(x, y, color, metadata = null) {
        this.pixels.set(`${x},${y}`, color);

        if (metadata) {
            this.pixelMetadata.set(`${x},${y}`, metadata);
        } else if (this.pixelMetadata.has(`${x},${y}`)) {
            const existing = this.pixelMetadata.get(`${x},${y}`);
            existing.color = color;
            this.pixelMetadata.set(`${x},${y}`, existing);
        }

        this.renderPixel(x, y, color);
    }

    deletePixelLocally(x, y) {
        this.pixels.delete(`${x},${y}`);
        this.pixelMetadata.delete(`${x},${y}`);
        this.clearPixel(x, y);
    }

    async sendPixelToServer(x, y, color) {
        const response = await fetch(`${this.getApiBaseUrl()}/api/pixels`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                x,
                y,
                color,
                insertedBy: this.userName
            })
        });

        if (!response.ok) {
            throw new Error('Failed to place pixel');
        }
    }

    async deletePixelFromServer(x, y) {
        const response = await fetch(`${this.getApiBaseUrl()}/api/pixels`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ x, y })
        });

        if (!response.ok) {
            throw new Error('Failed to delete pixel');
        }
    }

    updatePixel(x, y, color, metadata = null) {
        // Only update from WebSocket if not in edit mode or if not a pending change
        const pixelKey = `${x},${y}`;
        if (this.isEditMode && this.pendingChanges.has(pixelKey)) {
            return; // Don't override pending changes
        }

        this.pixels.set(pixelKey, color);

        if (metadata) {
            this.pixelMetadata.set(pixelKey, metadata);
        } else if (this.pixelMetadata.has(pixelKey)) {
            const existing = this.pixelMetadata.get(pixelKey);
            existing.color = color;
            this.pixelMetadata.set(pixelKey, existing);
        }

        this.renderPixel(x, y, color);
    }

    deletePixel(x, y) {
        // Only update from WebSocket if not in edit mode or if not a pending change
        const pixelKey = `${x},${y}`;
        if (this.isEditMode && this.pendingChanges.has(pixelKey)) {
            return; // Don't override pending changes
        }

        this.pixels.delete(pixelKey);
        this.pixelMetadata.delete(pixelKey);
        this.clearPixel(x, y);
    }

    async showPixelInfo(x, y) {
        if (this.pixelInfoTimeout) {
            clearTimeout(this.pixelInfoTimeout);
            this.pixelInfoTimeout = null;
        }

        const pixelKey = `${x},${y}`;
        const pixelInfo = document.getElementById('pixel-info');

        // Stop clicks inside the info box from affecting the canvas
        if (!pixelInfo.onclick) {
            pixelInfo.onclick = (e) => e.stopPropagation();
            pixelInfo.onmousedown = (e) => e.stopPropagation();
        }

        if (this.pixels.has(pixelKey)) {
            let data;
            if (this.pixelMetadata.has(pixelKey)) {
                data = this.pixelMetadata.get(pixelKey);
            } else {
                try {
                    const response = await fetch(`${this.getApiBaseUrl()}/api/pixels/info/${x}/${y}`);
                    if (response.ok) {
                        data = await response.json();
                        if (data) {
                            this.pixelMetadata.set(pixelKey, data);
                        }
                    }
                } catch (error) {
                    console.error('Failed to fetch pixel info:', error);
                }
            }

            if (data) {
                pixelInfo.innerHTML = `
                    <div class="pixel-info-header">
                        <div class="pixel-color" style="background-color: ${data.color};"></div>
                        <span class="pixel-coords">${x}, ${y}</span>
                        <button class="pixel-info-close" onclick="event.stopPropagation(); window.pixelCanvas.hidePixelInfo()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="pixel-details">
                        <div class="pixel-author"><strong>By:</strong> ${data.insertedBy || 'Anonymous'}</div>
                        <div class="pixel-time"><strong>At:</strong> ${new Date(data.updatedAt).toLocaleString()}</div>
                    </div>
                `;
                pixelInfo.style.display = 'block';
            }
        } else {
            this.hidePixelInfo();
        }
    }

    hidePixelInfo() {
        if (this.pixelInfoTimeout) {
            clearTimeout(this.pixelInfoTimeout);
            this.pixelInfoTimeout = null;
        }

        const pixelInfo = document.getElementById('pixel-info');
        pixelInfo.style.display = 'none';
    }

    updatePixelInfoPosition(x, y) {
        const pixelInfo = document.getElementById('pixel-info');
        const rect = pixelInfo.getBoundingClientRect();
        
        let posX = x + 10;
        let posY = y + 10;
        
        if (posX + rect.width > window.innerWidth) {
            posX = window.innerWidth - rect.width - 10;
        }
        
        if (posY + rect.height > window.innerHeight) {
            posY = window.innerHeight - rect.height - 10;
        }
        
        pixelInfo.style.left = `${posX}px`;
        pixelInfo.style.top = `${posY}px`;
    }

    drawGrid() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // --- Outside-canvas area: subtle checkerboard ---
        const tileSize = 24;
        for (let tx = 0; tx < Math.ceil(w / tileSize); tx++) {
            for (let ty = 0; ty < Math.ceil(h / tileSize); ty++) {
                this.ctx.fillStyle = (tx + ty) % 2 === 0 ? '#f0f0f0' : '#e4e4e4';
                this.ctx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
            }
        }

        // --- Actual canvas area: white background ---
        const canvasPixelW = this.gridSize * this.pixelSize * this.zoom;
        const canvasPixelH = this.gridSize * this.pixelSize * this.zoom;
        const originX = (w - canvasPixelW) / 2 + this.viewportX;
        const originY = (h - canvasPixelH) / 2 + this.viewportY;

        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(originX, originY, canvasPixelW, canvasPixelH);

        // --- Canvas boundary border ---
        const borderWidth = Math.max(2, Math.min(6, this.zoom * 4));
        this.ctx.strokeStyle = '#c0c0c0';
        this.ctx.lineWidth = borderWidth;
        this.ctx.strokeRect(
            originX + borderWidth / 2,
            originY + borderWidth / 2,
            canvasPixelW - borderWidth,
            canvasPixelH - borderWidth
        );

        // --- Corner accent markers for extra orientation cues ---
        const markerLen = Math.max(12, Math.min(40, canvasPixelW * 0.015));
        const markerW = borderWidth * 2;
        this.ctx.strokeStyle = '#999999';
        this.ctx.lineWidth = markerW;
        this.ctx.lineCap = 'round';

        // Top-left corner
        this.ctx.beginPath();
        this.ctx.moveTo(originX + markerLen, originY);
        this.ctx.lineTo(originX, originY);
        this.ctx.lineTo(originX, originY + markerLen);
        this.ctx.stroke();

        // Top-right corner
        this.ctx.beginPath();
        this.ctx.moveTo(originX + canvasPixelW - markerLen, originY);
        this.ctx.lineTo(originX + canvasPixelW, originY);
        this.ctx.lineTo(originX + canvasPixelW, originY + markerLen);
        this.ctx.stroke();

        // Bottom-left corner
        this.ctx.beginPath();
        this.ctx.moveTo(originX, originY + canvasPixelH - markerLen);
        this.ctx.lineTo(originX, originY + canvasPixelH);
        this.ctx.lineTo(originX + markerLen, originY + canvasPixelH);
        this.ctx.stroke();

        // Bottom-right corner
        this.ctx.beginPath();
        this.ctx.moveTo(originX + canvasPixelW - markerLen, originY + canvasPixelH);
        this.ctx.lineTo(originX + canvasPixelW, originY + canvasPixelH);
        this.ctx.lineTo(originX + canvasPixelW, originY + canvasPixelH - markerLen);
        this.ctx.stroke();

        this.ctx.lineCap = 'butt'; // reset
    }

    render() {
        this.drawGrid();
        this.pixels.forEach((color, key) => {
            const [x, y] = key.split(',').map(Number);
            this.renderPixel(x, y, color);
        });
        if (this.zoom >= 8) this.drawGridLines();
        this.drawCursorPreview();
    }

    renderPixel(gridX, gridY, color) {
        const screenPos = this.gridToScreen(gridX, gridY);
        const size = this.pixelSize * this.zoom;
        const pixelKey = `${gridX},${gridY}`;
        
        // Draw the pixel
        this.ctx.fillStyle = color;
        this.ctx.fillRect(screenPos.x, screenPos.y, size, size);

        // Add a border for pending changes in edit mode
        if (this.isEditMode && this.pendingChanges.has(pixelKey)) {
            this.ctx.strokeStyle = '#FFD700'; // Gold border for pending changes
            this.ctx.lineWidth = Math.max(1, size * 0.1);
            this.ctx.strokeRect(screenPos.x, screenPos.y, size, size);
        }
    }

    clearPixel(gridX, gridY) {
        const screenPos = this.gridToScreen(gridX, gridY);
        const size = this.pixelSize * this.zoom;
        this.ctx.clearRect(screenPos.x, screenPos.y, size, size);
    }

    drawGridLines() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const canvasPixelW = this.gridSize * this.pixelSize * this.zoom;
        const canvasPixelH = this.gridSize * this.pixelSize * this.zoom;
        const originX = (w - canvasPixelW) / 2 + this.viewportX;
        const originY = (h - canvasPixelH) / 2 + this.viewportY;
        const cellSize = this.pixelSize * this.zoom;

        const opacity = Math.min(0.15, 0.04 + (this.zoom - 8) / 32 * 0.11);

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(originX, originY, canvasPixelW, canvasPixelH);
        this.ctx.clip();
        this.ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
        this.ctx.lineWidth = 0.5;

        const startGX = Math.max(0, Math.floor(-originX / cellSize));
        const endGX = Math.min(this.gridSize, Math.ceil((w - originX) / cellSize));
        const startGY = Math.max(0, Math.floor(-originY / cellSize));
        const endGY = Math.min(this.gridSize, Math.ceil((h - originY) / cellSize));

        this.ctx.beginPath();
        for (let gx = startGX; gx <= endGX; gx++) {
            const sx = originX + gx * cellSize;
            this.ctx.moveTo(sx, originY);
            this.ctx.lineTo(sx, originY + canvasPixelH);
        }
        for (let gy = startGY; gy <= endGY; gy++) {
            const sy = originY + gy * cellSize;
            this.ctx.moveTo(originX, sy);
            this.ctx.lineTo(originX + canvasPixelW, sy);
        }
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawCursorPreview() {
        if (!this.isEditMode || !this.isValidGridPosition(this.cursorGridX, this.cursorGridY)) return;

        const offset = Math.floor((this.brushSize - 1) / 2);
        const size = this.pixelSize * this.zoom;

        this.ctx.save();
        if (this.isErasing) {
            this.ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
            this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        } else {
            const r = parseInt(this.selectedColor.slice(1, 3), 16);
            const g = parseInt(this.selectedColor.slice(3, 5), 16);
            const b = parseInt(this.selectedColor.slice(5, 7), 16);
            this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.45)`;
            this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
        }

        for (let dy = 0; dy < this.brushSize; dy++) {
            for (let dx = 0; dx < this.brushSize; dx++) {
                const px = this.cursorGridX - offset + dx;
                const py = this.cursorGridY - offset + dy;
                if (this.isValidGridPosition(px, py)) {
                    const sp = this.gridToScreen(px, py);
                    this.ctx.fillRect(sp.x, sp.y, size, size);
                }
            }
        }

        const topLeft = this.gridToScreen(this.cursorGridX - offset, this.cursorGridY - offset);
        this.ctx.lineWidth = Math.max(1, size * 0.06);
        this.ctx.strokeRect(topLeft.x, topLeft.y, size * this.brushSize, size * this.brushSize);
        this.ctx.restore();
    }

    connectWebSocket() {
        const wsUrl = this.getWsUrl();

        console.log('Connecting to WebSocket:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.connected = true;
            this.updateConnectionStatus();
            this.sendIdentify();
            if (this._hideColdStartBanner) this._hideColdStartBanner();
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.connected = false;
            this.updateConnectionStatus();
            setTimeout(() => this.connectWebSocket(), 3000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.connected = false;
            this.updateConnectionStatus();
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            // Fix 16: backend now batches updates; handle them all at once
            case 'batch_update':
                if (data.updates?.length) {
                    data.updates.forEach(p => this.updatePixel(p.x, p.y, p.color, {
                        color: p.color,
                        insertedBy: p.insertedBy,
                        updatedAt: p.updatedAt,
                    }));
                }
                if (data.deletes?.length) {
                    data.deletes.forEach(d => this.deletePixel(d.x, d.y));
                }
                break;
            // Keep individual cases for backward compatibility
            case 'pixel_update':
                this.updatePixel(data.x, data.y, data.color, {
                    color: data.color,
                    insertedBy: data.insertedBy,
                    updatedAt: data.updatedAt
                });
                break;
            case 'pixel_delete':
                this.deletePixel(data.x, data.y);
                break;
            case 'user_count':
                this.userCount = data.count;
                this.userNames = Array.isArray(data.names) ? data.names : [];
                document.getElementById('users-count').textContent = `${data.count} online`;
                this.renderUsersPopover();
                break;
        }
    }

    updateConnectionStatus() {
        const statusEl = document.querySelector('.status-indicator');
        const connectionText = document.getElementById('users-count');

        if (!statusEl || !connectionText) return;

        if (this.connected) {
            statusEl.className = 'status-indicator connected';
        } else {
            statusEl.className = 'status-indicator disconnected';
            connectionText.textContent = 'offline';
        }
    }

    sendIdentify() {
        // Authenticated users are identified via httpOnly cookie on WS upgrade.
        // Only guests need to send an identify message with their chosen name.
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (this.user) return; // auth already handled server-side via cookie
        if (!this.userName) return;
        try {
            this.ws.send(JSON.stringify({
                type: 'identify',
                name: this.userName,
            }));
        } catch (e) {
            console.warn('identify send failed', e);
        }
    }

    renderUsersPopover() {
        const popover = document.getElementById('users-popover');
        if (!popover) return;
        const names = this.userNames || [];
        if (names.length === 0) {
            popover.innerHTML = '<div class="users-popover-empty">No one identified yet</div>';
            return;
        }
        const me = this.userName;
        const items = names.map((n) => {
            const isMe = n === me;
            const safe = String(n).replace(/[&<>"']/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[c]);
            return `<li class="users-popover-item${isMe ? ' is-me' : ''}">${safe}${isMe ? ' <span class="me-tag">(you)</span>' : ''}</li>`;
        }).join('');
        popover.innerHTML = `<div class="users-popover-title">Online (${names.length})</div><ul class="users-popover-list">${items}</ul>`;
    }

    initUsersPopover() {
        const trigger = document.getElementById('users-count');
        const popover = document.getElementById('users-popover');
        if (!trigger || !popover) return;

        if (popover.parentElement !== document.body) {
            document.body.appendChild(popover);
        }

        const isMobile = () => window.matchMedia('(max-width: 600px)').matches;

        const positionPopover = () => {
            if (isMobile()) {
                popover.style.top = '';
                popover.style.left = '';
                popover.style.right = '';
                return;
            }
            const r = trigger.getBoundingClientRect();
            popover.style.top = `${r.bottom + 8}px`;
            popover.style.left = `${r.left}px`;
            popover.style.right = 'auto';
        };

        const close = () => {
            popover.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
            document.removeEventListener('pointerdown', onDocPointer, true);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('resize', positionPopover);
            window.removeEventListener('scroll', positionPopover, true);
        };
        const onDocPointer = (e) => {
            if (popover.contains(e.target) || trigger.contains(e.target)) return;
            close();
        };
        const onKey = (e) => { if (e.key === 'Escape') close(); };

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = !popover.classList.contains('open');
            if (willOpen) {
                this.renderUsersPopover();
                positionPopover();
                popover.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                setTimeout(() => {
                    document.addEventListener('pointerdown', onDocPointer, true);
                    document.addEventListener('keydown', onKey, true);
                    window.addEventListener('resize', positionPopover);
                    window.addEventListener('scroll', positionPopover, true);
                }, 0);
            } else {
                close();
            }
        });
    }

    async loadPixels() {
        try {
            const response = await fetch(`${this.getApiBaseUrl()}/api/pixels`);
            const pixels = await response.json();

            this.pixels.clear();
            this.pixelMetadata.clear();

            pixels.forEach(pixel => {
                this.pixels.set(`${pixel.x},${pixel.y}`, pixel.color);
            });

            this.render();
            if (this._hideColdStartBanner) this._hideColdStartBanner();
        } catch (error) {
            console.error('Failed to load pixels:', error);
        }
    }
}

class ChatWidget {
    constructor() {
        this.widget = document.querySelector('.chat-widget');
        this.toggle = document.querySelector('.chat-toggle');
        this.container = document.querySelector('.chat-container');
        this.closeBtn = document.querySelector('.chat-close');
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.toggle.addEventListener('click', () => {
            this.widget.classList.toggle('expanded');
        });
        
        this.closeBtn.addEventListener('click', () => {
            this.widget.classList.remove('expanded');
        });
        
        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (this.widget.classList.contains('expanded') && 
                !this.container.contains(e.target) && 
                !this.toggle.contains(e.target)) {
                this.widget.classList.remove('expanded');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.pixelCanvas = new PixelCanvas();
    new ChatWidget();

    // Ensure leaderboard modal is hidden on page load
    const leaderboardModal = document.getElementById('leaderboard-modal');
    leaderboardModal.style.display = 'none';
});