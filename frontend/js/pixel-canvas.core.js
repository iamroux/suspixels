'use strict';

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

        // Offscreen canvas holds pixel state; render() uses drawImage for O(1) repaint
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = 3000;
        this.offscreenCanvas.height = 3000;
        this.offCtx = this.offscreenCanvas.getContext('2d');
        this.offCtx.imageSmoothingEnabled = false;
        this.offCtx.fillStyle = '#FFFFFF';
        this.offCtx.fillRect(0, 0, 3000, 3000);

        // Edit mode settings
        this.isEditMode = false;
        this.isContinuousDraw = false;
        this.pendingChanges = new Map(); // Stores pending pixel changes in edit mode
        this.originalPixels = new Map(); // Stores original pixel state before edit

        // WebSocket
        this.ws = null;
        this.connected = false;
        this._wsEverConnected = false;
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
        this._pixelInfoRequestId = 0;

        // Brush size (applies to draw and erase)
        this.brushSize = 1;

        // Cursor preview (grid hover)
        this.cursorGridX = -1;
        this.cursorGridY = -1;
        this._cursorRafPending = false;

        // Auth state (token lives in httpOnly cookie — never in JS)
        this.user = JSON.parse(localStorage.getItem('pixelUser') || 'null');
        this.palettes = [];
        if (this.user) {
            this.userName = this.user.name;
        } else {
            // Guests only ever legitimately have a "Guest_xxx" name. Ignore (and
            // clear) any stale pixelUserName left by older builds that stored the
            // account name there — otherwise a logged-out profile masquerades as
            // that account's guest (e.g. shows up as "iamroux (Guest)").
            const storedGuest = localStorage.getItem('pixelUserName') || '';
            if (storedGuest && !storedGuest.startsWith('Guest_')) {
                localStorage.removeItem('pixelUserName');
                this.userName = '';
            } else {
                this.userName = storedGuest;
            }
        }

        if (!this.user && !this.userName) {
            this.initAuthModal();
        }

        this.init();
    
    }
}

window.PixelCanvas = PixelCanvas;

'use strict';

// Core lifecycle, configuration, and canvas setup. Methods are split from the original PixelCanvas class without behavior changes.

window.PixelCanvas.prototype.init = function() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupColorPicker();
        this.setupBrushSize();
        this.initUsersPopover();
        this.initProfilePage();
        this.initColdStartBanner();
        this.updateAuthUI();
        this.refreshSession();
        this.connectWebSocket();
        this.loadPixels();
        this.centerCanvas();
        this.render();
    
};

window.PixelCanvas.prototype.initColdStartBanner = function() {
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
    
};

window.PixelCanvas.prototype.getApiBaseUrl = function() {
        // Change this once you have your Render backend URL (e.g., 'https://suspixels-api.onrender.com')
        const prodApiUrl = 'https://suspixels-api-ysve.onrender.com';
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
    
};

window.PixelCanvas.prototype.getWsUrl = function() {
        // Change this once you have your Render backend URL (e.g., 'wss://suspixels-api.onrender.com')
        const prodWsUrl = 'wss://suspixels-api-ysve.onrender.com';
        if (prodWsUrl) return prodWsUrl;

        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocal) {
            return 'ws://localhost:3002';
        }

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const backendHost = host.replace(/:8000$/, ':3002');
        return `${wsProtocol}//${backendHost}`;
    
};

window.PixelCanvas.prototype.setupCanvas = function() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    
};

window.PixelCanvas.prototype.resizeCanvas = function() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    
};

window.PixelCanvas.prototype.centerCanvas = function() {
        this.viewportX = 0;
        this.viewportY = 0;
        this.render();
    
};

window.PixelCanvas.prototype.getPrestigeClass = function(pixelCount) {
        if (!pixelCount || pixelCount < 100) return 'prestige-basic';
        if (pixelCount < 500) return 'prestige-bronze';
        if (pixelCount < 1000) return 'prestige-silver';
        if (pixelCount < 5000) return 'prestige-gold';
        if (pixelCount < 10000) return 'prestige-platinum';
        if (pixelCount < 50000) return 'prestige-amethyst';
        if (pixelCount < 100000) return 'prestige-ruby';
        return 'prestige-diamond';
};

window.PixelCanvas.prototype.getAvatarHtml = function(userName, pixelCount, style) {
        const seed = encodeURIComponent(userName || 'Anonymous');
        const prestigeClass = this.getPrestigeClass(pixelCount);
        const avatarStyle = style || 'bottts';
        const avatarUrl = `https://api.dicebear.com/9.x/${avatarStyle}/svg?seed=${seed}`;
        
        return `
            <div class="avatar-container ${prestigeClass}">
                <img src="${avatarUrl}" alt="${userName}" class="avatar-image">
            </div>
        `;
};
