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

window.PixelCanvas.prototype.addRecentColor = function(color) {
        this.recentColors = this.recentColors.filter(c => c !== color);
        this.recentColors.unshift(color);
        if (this.recentColors.length > 10) {
            this.recentColors = this.recentColors.slice(0, 10);
        }
        localStorage.setItem('recentColors', JSON.stringify(this.recentColors));
    
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
            this.addRecentColor(color);
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
        popover.innerHTML = `<div class="users-popover-title">Online (${names.length})</div><ul class="users-popover-list">${items}</ul>`;
    
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
