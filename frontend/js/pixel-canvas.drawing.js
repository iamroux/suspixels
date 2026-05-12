'use strict';

// Drawing, edit mode, pixel info, and rendering behavior. Methods are split from the original PixelCanvas class without behavior changes.

window.PixelCanvas.prototype.toggleEditMode = function() {
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
            document.getElementById('floating-action-bar').style.display = 'flex';
            
            // Enable tool buttons
            toolButtons.forEach(btn => {
                if (btn.id !== 'my-palettes-btn') btn.removeAttribute('disabled');
            });
        } else {
            modeBtn.classList.remove('edit-mode');
            modeBtn.classList.add('explore-mode');
            modeBtn.querySelector('i').className = 'fas fa-eye';
            modeBtn.querySelector('span').textContent = 'Explore Mode';
            editActions.style.display = 'none';
            document.getElementById('floating-action-bar').style.display = 'none';
            
            // Disable tool buttons
            toolButtons.forEach(btn => {
                if (btn.id !== 'my-palettes-btn') btn.setAttribute('disabled', 'true');
            });
            
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
    
};

window.PixelCanvas.prototype.placePixel = async function(x, y) {
        if (!this.isEditMode) return;
        try {
            const size = this.isErasing ? this.brushSize : 1;
            const offset = Math.floor((size - 1) / 2);
            for (let dy = 0; dy < size; dy++) {
                for (let dx = 0; dx < size; dx++) {
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
    
};

window.PixelCanvas.prototype.placeSinglePixel = function(x, y) {
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
    
};

window.PixelCanvas.prototype.updatePendingChangesCount = function() {
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
        
        if (count > 0) {
            applyBtn.classList.add('glow');
        } else {
            applyBtn.classList.remove('glow');
        }
    
};

window.PixelCanvas.prototype.undoPendingChange = function() {
        if (this.pendingChanges.size === 0) return;

        const keys = Array.from(this.pendingChanges.keys());
        const lastKey = keys[keys.length - 1];

        this.pendingChanges.delete(lastKey);

        const [x, y] = lastKey.split(',').map(Number);
        const original = this.originalPixels.get(lastKey);

        if (original === null) {
            this.deletePixelLocally(x, y);
        } else if (original) {
            this.updatePixelLocally(x, y, original.color, original.metadata);
        }

        this.updatePendingChangesCount();
        this.render();

};

window.PixelCanvas.prototype.applyPendingChanges = async function() {
        if (this.pendingChanges.size === 0) return;

        const applyBtn = document.getElementById('apply-changes-btn');
        applyBtn.disabled = true;
        applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Applying...</span>';

        try {
            const operations = [];
            for (const [pixelKey, change] of this.pendingChanges) {
                if (change.action === 'set') {
                    operations.push({
                        action: 'set',
                        data: { x: change.x, y: change.y, color: change.color }
                    });
                } else if (change.action === 'delete') {
                    const [x, y] = pixelKey.split(',').map(Number);
                    operations.push({ action: 'delete', data: { x, y } });
                }
            }

            const response = await fetch(`${this.getApiBaseUrl()}/api/pixels/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                credentials: 'include',
                body: JSON.stringify({ operations })
            });

            if (!response.ok) {
                const status = response.status;
                let body = '';
                try { body = await response.text(); } catch {}
                console.error(`Batch failed ${status}:`, body);

                if (status === 401) {
                    this.user = null;
                    localStorage.removeItem('pixelUser');
                    applyBtn.innerHTML = '<i class="fas fa-check"></i><span>Apply</span>';
                    applyBtn.disabled = false;
                    this.updateAuthUI();
                    this.initAuthModal();
                    return;
                }
                throw new Error(`Batch failed (${status}): ${body}`);
            }

            const result = await response.json();
            console.log(`Batch complete: ${result.success} ok, ${result.failed} failed`);

            // Play success sound
            this.playApplySound();

            this.pendingChanges.clear();
            this.originalPixels.clear();
            this.updatePendingChangesCount();

            applyBtn.innerHTML = '<i class="fas fa-check"></i><span>Applied!</span>';
            setTimeout(() => {
                applyBtn.innerHTML = '<i class="fas fa-check"></i><span>Apply</span>';
            }, 2000);
        } catch (error) {
            console.error('Failed to apply changes:', error);
            applyBtn.innerHTML = '<i class="fas fa-check"></i><span>Apply</span>';
            applyBtn.disabled = false;
        }
    
};

window.PixelCanvas.prototype.discardPendingChanges = function() {
        if (this.pendingChanges.size > 0) {
            this.playDiscardSound();
        }

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
    
};

window.PixelCanvas.prototype.updatePixelLocally = function(x, y, color, metadata = null) {
        this.pixels.set(`${x},${y}`, color);

        if (metadata) {
            this.pixelMetadata.set(`${x},${y}`, metadata);
        } else if (this.pixelMetadata.has(`${x},${y}`)) {
            const existing = this.pixelMetadata.get(`${x},${y}`);
            existing.color = color;
            this.pixelMetadata.set(`${x},${y}`, existing);
        }

        this.renderPixel(x, y, color);
        this.render();

};

window.PixelCanvas.prototype.deletePixelLocally = function(x, y) {
        this.pixels.delete(`${x},${y}`);
        this.pixelMetadata.delete(`${x},${y}`);
        this.clearPixel(x, y);
        this.render();

};

window.PixelCanvas.prototype.updatePixel = function(x, y, color, metadata = null) {
        const pixelKey = `${x},${y}`;
        if (this.isEditMode && this.pendingChanges.has(pixelKey)) {
            return;
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
        this.render();

};

window.PixelCanvas.prototype.deletePixel = function(x, y) {
        const pixelKey = `${x},${y}`;
        if (this.isEditMode && this.pendingChanges.has(pixelKey)) {
            return;
        }

        this.pixels.delete(pixelKey);
        this.pixelMetadata.delete(pixelKey);
        this.clearPixel(x, y);
        this.render();

};

window.PixelCanvas.prototype.playPopSound = function() {
        if (!this.audioCtx) {
            // Lazy-init AudioContext on first user interaction
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioCtx = new AudioContext();
            }
        }

        if (!this.audioCtx) return;

        // Resume if suspended (browser auto-play policy)
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const oscillator = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        // A quick sine wave pop
        oscillator.type = 'sine';
        // Start high, quickly drop low
        oscillator.frequency.setValueAtTime(800, this.audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, this.audioCtx.currentTime + 0.05);

        // Sharp volume envelope
        gainNode.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.05);

        oscillator.start(this.audioCtx.currentTime);
        oscillator.stop(this.audioCtx.currentTime + 0.05);
};

window.PixelCanvas.prototype.playApplySound = function() {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

        // Two fast rising notes for success/apply
        const playNote = (freq, startTime, duration) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.3, startTime + duration * 0.2);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            
            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        const now = this.audioCtx.currentTime;
        playNote(440, now, 0.1);       // A4
        playNote(880, now + 0.1, 0.2); // A5 (octave higher)
};

window.PixelCanvas.prototype.playDiscardSound = function() {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

        // A dull, descending low frequency sweep for discard
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.audioCtx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.4, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.15);

        osc.start(this.audioCtx.currentTime);
        osc.stop(this.audioCtx.currentTime + 0.15);
};

window.PixelCanvas.prototype.showPixelInfo = async function(x, y) {
        // Play the pop sound immediately on click
        this.playPopSound();

        if (this.pixelInfoTimeout) {
            clearTimeout(this.pixelInfoTimeout);
            this.pixelInfoTimeout = null;
        }

        // Tag this request so stale async responses don't stomp newer clicks
        const requestId = ++this._pixelInfoRequestId;

        const pixelKey = `${x},${y}`;
        const pixelInfo = document.getElementById('pixel-info');

        // Stop clicks inside the info box from affecting the canvas
        pixelInfo.onclick = (e) => e.stopPropagation();
        pixelInfo.onmousedown = (e) => e.stopPropagation();

        if (!this.pixels.has(pixelKey)) {
            this.hidePixelInfo();
            return;
        }

        // Grab the pixel's color from the local map immediately
        const knownColor = this.pixels.get(pixelKey) || '#888';

        // ── Show skeleton card right away ──
        pixelInfo.innerHTML = `
            <div class="pixel-info-header">
                <div class="pixel-info-swatch" style="background-color: ${knownColor};"></div>
                <div class="pixel-info-meta">
                    <span class="pixel-info-coords">${x}, ${y}</span>
                    <span class="pixel-info-hex">${knownColor.toUpperCase()}</span>
                </div>
                <button class="pixel-info-close" onclick="event.stopPropagation(); window.pixelCanvas.hidePixelInfo()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="pixel-info-body">
                <div class="pixel-info-row">
                    <span class="pixel-info-label"><i class="fas fa-user"></i> Placed by</span>
                    <span class="pixel-info-value skeleton-pulse" style="width:80px;height:14px;border-radius:6px;"></span>
                </div>
                <div class="pixel-info-row">
                    <span class="pixel-info-label"><i class="fas fa-clock"></i> When</span>
                    <span class="pixel-info-value skeleton-pulse" style="width:120px;height:14px;border-radius:6px;"></span>
                </div>
            </div>
        `;
        pixelInfo.style.display = 'block';
        pixelInfo.classList.remove('pixel-info-loaded');

        // Close when clicking outside the card
        this._attachPixelInfoOutsideHandler();

        // ── Fetch real data ──
        let data;
        if (this.pixelMetadata.has(pixelKey)) {
            data = this.pixelMetadata.get(pixelKey);
        } else {
            try {
                const response = await fetch(`${this.getApiBaseUrl()}/api/pixels/info/${x}/${y}`);
                if (response.ok) {
                    data = await response.json();
                    if (data) this.pixelMetadata.set(pixelKey, data);
                }
            } catch (error) {
                console.error('Failed to fetch pixel info:', error);
            }
        }

        // Bail if user clicked a different pixel while we were loading
        if (requestId !== this._pixelInfoRequestId) return;

        if (data) {
            const color = data.color || knownColor;
            const author = data.insertedBy || 'Anonymous';
            const dateStr = data.updatedAt
                ? new Date(data.updatedAt).toLocaleString(undefined, {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                  })
                : '—';

            const authorHtml = author !== 'Anonymous' 
                ? `<span class="pixel-info-author clickable-author" onclick="window.pixelCanvas.openPublicProfilePage('${author.replace(/'/g, "\\'")}')" title="View Profile">${author}</span>`
                : `<span class="pixel-info-author">${author}</span>`;

            pixelInfo.innerHTML = `
                <div class="pixel-info-header">
                    <div class="pixel-info-swatch" style="background-color: ${color};"></div>
                    <div class="pixel-info-meta">
                        <span class="pixel-info-coords">${x}, ${y}</span>
                        <span class="pixel-info-hex">${color.toUpperCase()}</span>
                    </div>
                    <button class="pixel-info-close" onclick="event.stopPropagation(); window.pixelCanvas.hidePixelInfo()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="pixel-info-body">
                    <div class="pixel-info-row">
                        <span class="pixel-info-label"><i class="fas fa-user"></i> Placed by</span>
                        <span class="pixel-info-value">${authorHtml}</span>
                    </div>
                    <div class="pixel-info-row">
                        <span class="pixel-info-label"><i class="fas fa-clock"></i> When</span>
                        <span class="pixel-info-value pixel-info-time">${dateStr}</span>
                    </div>
                </div>
            `;
            pixelInfo.classList.add('pixel-info-loaded');
        } else {
            // Data failed — show a subtle error state instead of blank
            const body = pixelInfo.querySelector('.pixel-info-body');
            if (body) body.innerHTML = '<div class="pixel-info-error">Could not load details</div>';
        }
    
};

window.PixelCanvas.prototype.hidePixelInfo = function() {
        if (this.pixelInfoTimeout) {
            clearTimeout(this.pixelInfoTimeout);
            this.pixelInfoTimeout = null;
        }

        this._removePixelInfoOutsideHandler();

        const pixelInfo = document.getElementById('pixel-info');
        pixelInfo.style.display = 'none';
    
};

window.PixelCanvas.prototype._attachPixelInfoOutsideHandler = function() {
        // Tear down any existing handler first to avoid duplicates
        this._removePixelInfoOutsideHandler();

        const pixelInfo = document.getElementById('pixel-info');

        this._pixelInfoOutsideHandler = (e) => {
            if (pixelInfo.contains(e.target)) return; // click inside card → ignore
            this.hidePixelInfo();
        };

        this._pixelInfoEscHandler = (e) => {
            if (e.key === 'Escape') this.hidePixelInfo();
        };

        // Use setTimeout so the current click event doesn't immediately fire the handler
        setTimeout(() => {
            document.addEventListener('pointerdown', this._pixelInfoOutsideHandler, true);
            document.addEventListener('keydown',     this._pixelInfoEscHandler,     true);
        }, 0);
};

window.PixelCanvas.prototype._removePixelInfoOutsideHandler = function() {
        if (this._pixelInfoOutsideHandler) {
            document.removeEventListener('pointerdown', this._pixelInfoOutsideHandler, true);
            this._pixelInfoOutsideHandler = null;
        }
        if (this._pixelInfoEscHandler) {
            document.removeEventListener('keydown', this._pixelInfoEscHandler, true);
            this._pixelInfoEscHandler = null;
        }
};

window.PixelCanvas.prototype.updatePixelInfoPosition = function(x, y) {
        const pixelInfo = document.getElementById('pixel-info');
        // Card is fixed-width 230px; use that directly since the card may be hidden
        const cardW = 230;
        const cardH = pixelInfo.offsetHeight || 110; // approx height when hidden

        const MARGIN = 12;
        let posX = x + MARGIN;
        let posY = y + MARGIN;

        if (posX + cardW > window.innerWidth - MARGIN) {
            posX = x - cardW - MARGIN;
        }
        if (posX < MARGIN) posX = MARGIN;

        if (posY + cardH > window.innerHeight - MARGIN) {
            posY = y - cardH - MARGIN;
        }
        if (posY < MARGIN) posY = MARGIN;

        pixelInfo.style.left = `${posX}px`;
        pixelInfo.style.top  = `${posY}px`;
    
};

window.PixelCanvas.prototype.drawGrid = function() {
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
    
};

window.PixelCanvas.prototype.render = function() {
        this.drawGrid();

        const w = this.canvas.width;
        const h = this.canvas.height;
        const canvasPixelW = this.gridSize * this.pixelSize * this.zoom;
        const canvasPixelH = this.gridSize * this.pixelSize * this.zoom;
        const originX = (w - canvasPixelW) / 2 + this.viewportX;
        const originY = (h - canvasPixelH) / 2 + this.viewportY;

        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(
            this.offscreenCanvas,
            0, 0, this.gridSize, this.gridSize,
            originX, originY, canvasPixelW, canvasPixelH,
        );

        if (this.isEditMode && this.pendingChanges.size > 0) {
            const size = this.pixelSize * this.zoom;
            this.ctx.strokeStyle = '#FFD700';
            this.ctx.lineWidth = Math.max(1, size * 0.1);
            for (const [key] of this.pendingChanges) {
                const [x, y] = key.split(',').map(Number);
                const sp = this.gridToScreen(x, y);
                this.ctx.strokeRect(sp.x, sp.y, size, size);
            }
        }

        if (this.isEditMode && this.zoom >= 8) this.drawGridLines();
        this.drawCursorPreview();

};

window.PixelCanvas.prototype.renderPixel = function(gridX, gridY, color) {
        this.offCtx.fillStyle = color;
        this.offCtx.fillRect(gridX, gridY, 1, 1);

};

window.PixelCanvas.prototype.clearPixel = function(gridX, gridY) {
        this.offCtx.fillStyle = '#FFFFFF';
        this.offCtx.fillRect(gridX, gridY, 1, 1);

};

window.PixelCanvas.prototype.drawGridLines = function() {
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
    
};

window.PixelCanvas.prototype.drawCursorPreview = function() {
        if (!this.isEditMode || !this.isValidGridPosition(this.cursorGridX, this.cursorGridY)) return;

        const brushSize = this.isErasing ? this.brushSize : 1;
        const offset = Math.floor((brushSize - 1) / 2);
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

        for (let dy = 0; dy < brushSize; dy++) {
            for (let dx = 0; dx < brushSize; dx++) {
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
        this.ctx.strokeRect(topLeft.x, topLeft.y, size * brushSize, size * brushSize);
        this.ctx.restore();
    
};
