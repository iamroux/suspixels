'use strict';

// Pointer, touch, pan, zoom, and coordinate behavior. Methods are split from the original PixelCanvas class without behavior changes.

window.PixelCanvas.prototype.handleMouseDown = function(e) {
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
    
};

window.PixelCanvas.prototype.handleMouseMove = function(e) {
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
    
};

window.PixelCanvas.prototype.handleMouseUp = function(e) {
        if (e.button === 2) {
            this.endPan();
        }
    
};

window.PixelCanvas.prototype.handleMouseLeave = function() {
        this.cursorGridX = -1;
        this.cursorGridY = -1;
        if (this.isPanning) {
            this.endPan();
        }
        if (this.isEditMode) this.render();
    
};

window.PixelCanvas.prototype.handleWheel = function(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoomAt(mouseX, mouseY, delta);
    
};

window.PixelCanvas.prototype.handleTouchStart = function(e) {
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
    
};

window.PixelCanvas.prototype.handleTouchMove = function(e) {
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
    
};

window.PixelCanvas.prototype.handleTouchEnd = function(e) {
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
    
};

window.PixelCanvas.prototype.getTouchDistance = function() {
        if (this.touches.length < 2) return 0;
        const dx = this.touches[0].clientX - this.touches[1].clientX;
        const dy = this.touches[0].clientY - this.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    
};

window.PixelCanvas.prototype.startPan = function(x, y) {
        this.isPanning = true;
        this.lastPanX = x;
        this.lastPanY = y;
        this.container.classList.add('panning');
    
};

window.PixelCanvas.prototype.updatePan = function(x, y) {
        if (!this.isPanning) return;

        const dx = x - this.lastPanX;
        const dy = y - this.lastPanY;

        this.viewportX += dx;
        this.viewportY += dy;

        this.clampOffsets();

        this.lastPanX = x;
        this.lastPanY = y;

        this.render();
    
};

window.PixelCanvas.prototype.endPan = function() {
        this.isPanning = false;
        this.container.classList.remove('panning');
    
};

window.PixelCanvas.prototype.zoomAt = function(x, y, scale) {
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
    
};

window.PixelCanvas.prototype.screenToGrid = function(screenX, screenY) {
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
    
};

window.PixelCanvas.prototype.gridToScreen = function(gridX, gridY) {
        const canvasWidth = this.gridSize * this.pixelSize * this.zoom;
        const canvasHeight = this.gridSize * this.pixelSize * this.zoom;
        const centerX = (this.canvas.width - canvasWidth) / 2;
        const centerY = (this.canvas.height - canvasHeight) / 2;

        return {
            x: centerX + (gridX * this.pixelSize) * this.zoom + this.viewportX,
            y: centerY + (gridY * this.pixelSize) * this.zoom + this.viewportY
        };
    
};

window.PixelCanvas.prototype.clampOffsets = function() {
        const canvasWidth = this.gridSize * this.pixelSize * this.zoom;
        const canvasHeight = this.gridSize * this.pixelSize * this.zoom;

        const maxViewportX = canvasWidth / 2;
        const maxViewportY = canvasHeight / 2;

        this.viewportX = Math.max(-maxViewportX, Math.min(maxViewportX, this.viewportX));
        this.viewportY = Math.max(-maxViewportY, Math.min(maxViewportY, this.viewportY));
    
};

window.PixelCanvas.prototype.isValidGridPosition = function(x, y) {
        return x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize;
    
};
