'use strict';

// Server synchronization, WebSocket, and initial pixel loading. Methods are split from the original PixelCanvas class without behavior changes.

window.PixelCanvas.prototype.sendPixelToServer = async function(x, y, color) {
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
    
};

window.PixelCanvas.prototype.deletePixelFromServer = async function(x, y) {
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
    
};

window.PixelCanvas.prototype.connectWebSocket = function() {
        const wsUrl = this.getWsUrl();

        console.log('Connecting to WebSocket:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.connected = true;
            this.updateConnectionStatus();
            this.sendIdentify();
            this.startHeartbeat();
            if (this._hideColdStartBanner) this._hideColdStartBanner();
            if (this._wsEverConnected) {
                this.loadPixels();
            }
            this._wsEverConnected = true;
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.connected = false;
            this.stopHeartbeat();
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
    
};

window.PixelCanvas.prototype.handleWebSocketMessage = function(data) {
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
                // Server only counts identified presences; if I'm connected
                // but not yet identified (e.g. modal still up), make sure
                // the display still shows at least me.
                this.userCount = Math.max(data.count, this.connected ? 1 : 0);
                this.userNames = Array.isArray(data.names) ? data.names : [];
                document.getElementById('users-count').textContent = `${this.userCount} online`;
                this.renderUsersPopover();
                break;
        }
    
};

window.PixelCanvas.prototype.updateConnectionStatus = function() {
        const statusEl = document.querySelector('.status-indicator');
        const connectionText = document.getElementById('users-count');

        if (!statusEl || !connectionText) return;

        if (this.connected) {
            statusEl.className = 'status-indicator connected';
        } else {
            statusEl.className = 'status-indicator disconnected';
            connectionText.textContent = 'offline';
        }
    
};

window.PixelCanvas.prototype.sendIdentify = function() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (!this.userName) return;
        try {
            const msg = { type: 'identify', name: this.userName };
            const token = localStorage.getItem('authToken');
            if (token) msg.token = token;
            this.ws.send(JSON.stringify(msg));
        } catch (e) {
            console.warn('identify send failed', e);
        }
    
};

window.PixelCanvas.prototype.startHeartbeat = function() {
    this.stopHeartbeat();
    this._heartbeatInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 20000);
};

window.PixelCanvas.prototype.stopHeartbeat = function() {
    if (this._heartbeatInterval) {
        clearInterval(this._heartbeatInterval);
        this._heartbeatInterval = null;
    }
};

window.PixelCanvas.prototype.downloadSnapshot = async function() {
        const btn = document.getElementById('download-png-btn');
        const label = btn ? btn.querySelector('span') : null;
        const original = label ? label.textContent : null;
        if (label) label.textContent = 'Downloading…';
        if (btn) btn.disabled = true;
        try {
            // Fetch as a blob: the frontend and API are different origins, and
            // the <a download> attribute is ignored for cross-origin hrefs.
            const response = await fetch(`${this.getApiBaseUrl()}/api/pixels/snapshot`);
            if (!response.ok) throw new Error(`snapshot fetch failed: ${response.status}`);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `suspixels-${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.warn('Download failed', e);
        } finally {
            if (label && original !== null) label.textContent = original;
            if (btn) btn.disabled = false;
        }

};

window.PixelCanvas.prototype.loadPixels = async function() {
        const hideLoader = () => {
            if (this._hideColdStartBanner) this._hideColdStartBanner();
            const loader = document.getElementById('startup-loader');
            if (loader) {
                loader.classList.add('hidden');
                setTimeout(() => loader.style.display = 'none', 500);
            }
        };

        const showError = () => {
            const loader = document.getElementById('startup-loader');
            if (loader) {
                const text = loader.querySelector('.loader-text');
                if (text) text.textContent = 'Failed to connect. Please refresh.';
                const spinner = loader.querySelector('.loader-spinner');
                if (spinner) spinner.style.display = 'none';
            }
        };

        // PNG fires in background — renders as soon as it loads (typically before JSON)
        let pngRendered = false;
        fetch(`${this.getApiBaseUrl()}/api/pixels/snapshot`)
            .then(r => r.ok ? r.blob() : Promise.reject())
            .then(blob => new Promise((resolve, reject) => {
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    this.offCtx.fillStyle = '#FFFFFF';
                    this.offCtx.fillRect(0, 0, this.gridSize, this.gridSize);
                    this.offCtx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(url);
                    pngRendered = true;
                    this.render();
                    hideLoader();
                    resolve();
                };
                img.onerror = reject;
                img.src = url;
            }))
            .catch(() => {}); // PNG failure is non-fatal — JSON fallback below

        // Await compact JSON to populate interaction Map (click-to-inspect, pending changes)
        try {
            let response = await fetch(`${this.getApiBaseUrl()}/api/pixels/compact`);
            let pixels;
            let isCompact = true;
            if (response.ok) {
                pixels = await response.json();
            } else {
                response = await fetch(`${this.getApiBaseUrl()}/api/pixels`);
                pixels = await response.json();
                isCompact = false;
            }
            this.pixels.clear();
            this.pixelMetadata.clear();
            pixels.forEach(pixel => {
                const [x, y, color] = isCompact ? pixel : [pixel.x, pixel.y, pixel.color];
                this.pixels.set(`${x},${y}`, color);
            });
        } catch (e) {
            console.warn('Failed to populate pixel map — interaction degraded');
            showError();
            return;
        }

        // Fallback render from Map if PNG hasn't loaded yet
        if (!pngRendered) {
            this.offCtx.fillStyle = '#FFFFFF';
            this.offCtx.fillRect(0, 0, this.gridSize, this.gridSize);
            this.pixels.forEach((color, key) => {
                const [x, y] = key.split(',').map(Number);
                this.offCtx.fillStyle = color;
                this.offCtx.fillRect(x, y, 1, 1);
            });
            this.render();
            hideLoader();
        }

};
