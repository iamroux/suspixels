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
                this.userCount = data.count;
                this.userNames = Array.isArray(data.names) ? data.names : [];
                document.getElementById('users-count').textContent = `${data.count} online`;
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

window.PixelCanvas.prototype.loadPixels = async function() {
        try {
            let response = await fetch(`${this.getApiBaseUrl()}/api/pixels/compact`);
            let pixels;
            let isCompactPayload = true;

            if (response.ok) {
                pixels = await response.json();
            } else {
                response = await fetch(`${this.getApiBaseUrl()}/api/pixels`);
                pixels = await response.json();
                isCompactPayload = false;
            }

            this.pixels.clear();
            this.pixelMetadata.clear();

            pixels.forEach(pixel => {
                const [x, y, color] = isCompactPayload ? pixel : [pixel.x, pixel.y, pixel.color];
                this.pixels.set(`${x},${y}`, color);
            });

            this.render();
            if (this._hideColdStartBanner) this._hideColdStartBanner();
            
            // Hide startup loader
            const loader = document.getElementById('startup-loader');
            if (loader) {
                loader.classList.add('hidden');
                setTimeout(() => loader.style.display = 'none', 500); // Remove from DOM flow after fade
            }
        } catch (error) {
            console.error('Failed to load pixels:', error);
            const loader = document.getElementById('startup-loader');
            if (loader) {
                const text = loader.querySelector('.loader-text');
                if (text) text.textContent = 'Failed to connect. Please refresh.';
                const spinner = loader.querySelector('.loader-spinner');
                if (spinner) spinner.style.display = 'none';
            }
        }
    
};
