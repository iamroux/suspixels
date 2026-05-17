'use strict';

// Toolbar, color controls, users popover, and leaderboard UI. Methods are split from the original PixelCanvas class without behavior changes.

window.PixelCanvas.prototype.setupEventListeners = function() {
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
            this.setErasing(!this.isErasing);
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

                    const avatarHtml = this.getAvatarHtml(entry.name, entry.pixelCount, entry.avatarStyle);
                    
                    nameCell.style.display = 'flex';
                    nameCell.style.alignItems = 'center';
                    nameCell.style.gap = '10px';

                    nameCell.innerHTML = `
                        ${rankPrefix}
                        <div style="width: 28px; height: 28px; flex-shrink: 0;">${avatarHtml}</div>
                        <span class="player-name">${entry.name}</span>
                    `;
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

        document.getElementById('download-png-btn').addEventListener('click', () => this.downloadSnapshot());

};

window.PixelCanvas.prototype.setupColorPicker = function() {
        // Palettes button
        const palettesBtn = document.getElementById('my-palettes-btn');
        const palettePopover = document.getElementById('palette-popover');
        
        palettesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.user) {
                const isHidden = palettePopover.style.display === 'none' || palettePopover.style.display === '';
                if (isHidden) {
                    palettePopover.style.display = 'block';
                    const btnRect = palettesBtn.getBoundingClientRect();
                    const popWidth = palettePopover.offsetWidth || 250;
                    palettePopover.style.position = 'fixed';
                    palettePopover.style.left = `${btnRect.left + btnRect.width / 2 - popWidth / 2}px`;
                    palettePopover.style.bottom = `${window.innerHeight - btnRect.top + 10}px`;
                    palettePopover.style.transform = 'none'; // Prevents CSS animation transform conflict
                    this.loadUserPalettes(); // Refresh when opening
                } else {
                    palettePopover.style.display = 'none';
                }
            } else {
                alert('Login to use palettes!');
            }
        });

        // Close popover when clicking outside
        document.addEventListener('click', (e) => {
            if (!palettesBtn.contains(e.target) && !palettePopover.contains(e.target)) {
                palettePopover.style.display = 'none';
            }
        });

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
                    this.setErasing(false);
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
    
};

window.PixelCanvas.prototype.setupBrushSize = function() {
        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.brushSize = parseInt(btn.dataset.size);
                document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    
};

window.PixelCanvas.prototype.setErasing = function(state) {
        this.isErasing = state;
        document.getElementById('eraser-btn').classList.toggle('active', state);
        document.getElementById('selected-color').style.backgroundColor = state ? '#FFFFFF' : this.selectedColor;
        document.getElementById('brush-size-picker').style.display = state ? 'flex' : 'none';
        
        // Hide color tools when erasing to keep toolbar clean
        const colorTools = [
            document.getElementById('color-picker-btn'),
            document.getElementById('color-wheel-btn'),
            document.querySelector('.selected-color-display')
        ];
        colorTools.forEach(el => {
            if (el) el.style.display = state ? 'none' : '';
        });
    
};

window.PixelCanvas.prototype.toggleColorPickerMode = function() {
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
    
};

window.PixelCanvas.prototype.handlePixelColorPick = function(x, y) {
        const pixelKey = `${x},${y}`;
        if (this.pixels.has(pixelKey)) {
            const color = this.pixels.get(pixelKey);
            this.selectedColor = color;
            document.getElementById('selected-color').style.backgroundColor = color;
            this.setErasing(false);

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
    
};

window.PixelCanvas.prototype.renderUsersPopover = function() {
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
        popover.innerHTML = `<div class="users-popover-title">Online (${this.userCount})</div><ul class="users-popover-list">${items}</ul>`;
    
};

window.PixelCanvas.prototype.initUsersPopover = function() {
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
    
};

window.PixelCanvas.prototype.renderRemoteCursor = function(userId, x, y, name, avatarStyle) {
    if (!this.remoteCursors) this.remoteCursors = new Map();
    
    // x and y are exact grid coordinates (floats)
    this.remoteCursors.set(userId, { x, y, name, avatarStyle, lastSeen: Date.now() });
    
    // We update immediately in case the render loop isn't active
    this.updateRemoteCursorsPositions();
};

window.PixelCanvas.prototype.updateRemoteCursorsPositions = function() {
    if (!this.remoteCursors) return;
    
    const container = document.getElementById('multiplayer-cursors');
    if (!container) return;
    
    const now = Date.now();
    const TIMEOUT = 5000; // 5 seconds
    
    this.remoteCursors.forEach((cursor, userId) => {
        // If inactive for a while, fade out and remove
        if (now - cursor.lastSeen > TIMEOUT) {
            const el = document.getElementById(`cursor-${userId}`);
            if (el) {
                el.classList.add('fade-out');
                setTimeout(() => {
                    if (el.parentElement) el.parentElement.removeChild(el);
                }, 300);
            }
            this.remoteCursors.delete(userId);
            return;
        }
        
        let el = document.getElementById(`cursor-${userId}`);
        if (!el) {
            el = document.createElement('div');
            el.id = `cursor-${userId}`;
            el.className = 'remote-cursor';
            
            // Generate avatar HTML (fallback to bottts if missing)
            const style = cursor.avatarStyle || 'bottts';
            const avatarHtml = this.getAvatarHtml(cursor.name, 0, style);
            
            // Ensure safe name for HTML injection
            const safeName = String(cursor.name).replace(/[&<>"']/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[c]);
            
            el.innerHTML = `
                <svg class="remote-cursor-pointer" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1.378 0.697003C0.840003 -0.106997 0 0.163003 0 1.135V15.021C0 15.938 1.05 16.452 1.777 15.894L5.617 12.936C5.836 12.767 6.113 12.678 6.398 12.678H14.862C15.806 12.678 16.14 11.472 15.421 10.93L1.378 0.697003Z" fill="#ff6b6b" stroke="white" stroke-width="1.5"/>
                </svg>
                <div class="remote-cursor-info">
                    <div class="remote-cursor-avatar">${avatarHtml}</div>
                    <span class="remote-cursor-name">${safeName}</span>
                </div>
            `;
            container.appendChild(el);
            // Trigger reflow for transition
            el.offsetHeight; 
        }
        
        // Remove fade out if they moved again while fading
        el.classList.remove('fade-out');
        
        // Calculate screen position based on current zoom/pan
        const screenPos = this.gridToScreen(cursor.x, cursor.y);
        el.style.transform = `translate(${screenPos.x}px, ${screenPos.y}px)`;
    });
};
