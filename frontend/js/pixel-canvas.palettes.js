'use strict';

// Palette loading, popovers, dashboard cards, and editor behavior. Methods are split from the original PixelCanvas class without behavior changes.

window.PixelCanvas.prototype.loadUserPalettes = async function() {
        if (!this.user) return;
        
        const listContainer = document.getElementById('palettes-list');
        if (listContainer) {
            listContainer.innerHTML = Array(3).fill(0).map(() => `
                <div class="skeleton-dark palette-card" style="height: 100px;"></div>
            `).join('');
        }

        try {
            const response = await fetch(`${this.getApiBaseUrl()}/api/palettes`, {
                credentials: 'include',
                headers: this.getAuthHeaders(),
            });
            if (response.ok) {
                this.palettes = await response.json();
                this.renderPalettesPopover();
                this.renderDashboardPalettes();
            } else {
                throw new Error('Response not OK');
            }
        } catch (error) {
            console.error('Failed to load palettes:', error);
            if (listContainer) {
                listContainer.innerHTML = '<div style="color: #ef4444; padding: 1rem; text-align: center;">Failed to load palettes</div>';
            }
        }
    
};

window.PixelCanvas.prototype.renderPalettesPopover = function() {
        const container = document.getElementById('palette-popover-content');
        if (!container) return;
        
        if (!this.palettes || this.palettes.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); padding: 1rem;">No palettes found.<br>Create one in your Profile!</div>';
            return;
        }

        container.innerHTML = '';
        this.palettes.forEach(palette => {
            const item = document.createElement('div');
            item.className = 'popover-palette-item';
            
            const title = document.createElement('div');
            title.className = 'popover-palette-title';
            title.textContent = palette.name;
            item.appendChild(title);
            
            const colorsDiv = document.createElement('div');
            colorsDiv.className = 'palette-card-colors';
            
            if (palette.colors && palette.colors.length > 0) {
                palette.colors.forEach(color => {
                    const swatch = document.createElement('div');
                    swatch.className = 'popover-swatch';
                    swatch.style.backgroundColor = color;
                    swatch.title = color;
                    swatch.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.selectedColor = color;
                        document.getElementById('selected-color').style.backgroundColor = color;
                        document.getElementById('palette-popover').style.display = 'none';
                    });
                    colorsDiv.appendChild(swatch);
                });
            } else {
                colorsDiv.innerHTML = '<span style="color: var(--text-tertiary); font-size: 0.75rem;">Empty palette</span>';
            }
            
            item.appendChild(colorsDiv);
            container.appendChild(item);
        });
    
};

window.PixelCanvas.prototype.renderDashboardPalettes = function() {
        const container = document.getElementById('palettes-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!this.palettes || this.palettes.length === 0) {
            container.innerHTML = '<p style="color: var(--text-tertiary);">You have no palettes yet.</p>';
        } else {
            this.palettes.forEach(palette => {
                const card = document.createElement('div');
                card.className = 'palette-card';
                card.innerHTML = `
                    <div class="palette-card-header">
                        <div class="palette-card-title">${palette.name}</div>
                        <button class="secondary-btn small-btn edit-palette-btn"><i class="fas fa-edit"></i></button>
                    </div>
                    <div class="palette-card-colors">
                        ${(palette.colors && palette.colors.length > 0) 
                            ? palette.colors.map(c => `<div class="palette-color-swatch" style="background-color: ${c}" title="${c}"></div>`).join('') 
                            : '<span style="color: var(--text-tertiary); font-size: 0.8rem;">No colors assigned</span>'
                        }
                    </div>
                `;
                card.querySelector('.edit-palette-btn').addEventListener('click', () => this.openPaletteEditor(palette));
                container.appendChild(card);
            });
        }
        
        const createBtn = document.getElementById('create-palette-btn');
        if (createBtn) {
            createBtn.style.display = (this.palettes && this.palettes.length >= 3) ? 'none' : 'inline-flex';
            // ensure listener is not duplicated, we can do it here by replacing the node
            const newBtn = createBtn.cloneNode(true);
            createBtn.parentNode.replaceChild(newBtn, createBtn);
            newBtn.addEventListener('click', () => this.openPaletteEditor(null));
        }
    
};

window.PixelCanvas.prototype.openPaletteEditor = function(palette) {
        this.currentEditingPalette = palette;
        const modal = document.getElementById('palette-editor-modal');
        const nameInput = document.getElementById('palette-name-input');
        
        nameInput.value = palette ? palette.name : '';
        
        // Populate 10 slots
        this.currentEditingColors = palette && palette.colors ? [...palette.colors] : [];
        this.renderPaletteEditorSlots();
        
        modal.style.display = 'block';
        
        // Setup buttons
        const saveBtn = document.getElementById('save-palette-btn');
        const deleteBtn = document.getElementById('delete-palette-btn');
        const cancelBtn = document.getElementById('cancel-palette-btn');
        
        deleteBtn.style.display = palette ? 'block' : 'none';
        
        // clone to remove old listeners
        const newSaveBtn = saveBtn.cloneNode(true);
        const newDeleteBtn = deleteBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        saveBtn.replaceWith(newSaveBtn);
        deleteBtn.replaceWith(newDeleteBtn);
        cancelBtn.replaceWith(newCancelBtn);
        
        newSaveBtn.addEventListener('click', () => this.savePalette());
        newDeleteBtn.addEventListener('click', () => this.deletePalette());
        newCancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    
};

window.PixelCanvas.prototype.renderPaletteEditorSlots = function() {
        const grid = document.getElementById('palette-colors-grid');
        grid.innerHTML = '';
        
        for (let i = 0; i < 10; i++) {
            const slot = document.createElement('div');
            slot.className = 'palette-slot';
            
            const color = this.currentEditingColors[i];
            if (color) {
                slot.classList.add('filled');
                slot.style.backgroundColor = color;
            } else {
                slot.innerHTML = '+';
            }
            
            // Create transparent color input that covers the whole slot
            // This is the most reliable way for mobile (especially iOS Safari)
            const input = document.createElement('input');
            input.type = 'color';
            input.style.position = 'absolute';
            input.style.top = '0';
            input.style.left = '0';
            input.style.width = '100%';
            input.style.height = '100%';
            input.style.opacity = '0';
            input.style.cursor = 'pointer';
            input.value = color || '#ff0000';
            
            input.addEventListener('change', (e) => {
                this.currentEditingColors[i] = e.target.value;
                this.renderPaletteEditorSlots();
            });
            
            slot.appendChild(input);
            
            // Long press for mobile to remove color (attach to input since it's on top)
            let pressTimer;
            input.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => {
                    if (color) {
                        if (confirm('Remove this color?')) {
                            this.currentEditingColors.splice(i, 1);
                            this.renderPaletteEditorSlots();
                        }
                    }
                }, 600);
            });
            input.addEventListener('touchend', () => clearTimeout(pressTimer));
            input.addEventListener('touchmove', () => clearTimeout(pressTimer));
            
            slot.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (color) {
                    this.currentEditingColors.splice(i, 1);
                    this.renderPaletteEditorSlots();
                }
            });
            
            grid.appendChild(slot);
        }
    
};

window.PixelCanvas.prototype.savePalette = async function() {
        const name = document.getElementById('palette-name-input').value.trim();
        if (!name) return alert('Please enter a palette name.');
        
        const colors = this.currentEditingColors.filter(c => c); // remove empty slots
        const payload = { name, colors };
        const btn = document.getElementById('save-palette-btn');
        this.setLoading(btn, true);
        
        try {
            let url = `${this.getApiBaseUrl()}/api/palettes`;
            let method = 'POST';
            
            if (this.currentEditingPalette) {
                url += `/${this.currentEditingPalette.id}`;
                method = 'PATCH';
            }
            
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to save palette');
            }
            
            await this.loadUserPalettes();
            document.getElementById('palette-editor-modal').style.display = 'none';
        } catch (error) {
            alert(error.message);
        } finally {
            this.setLoading(btn, false);
        }
    
};

window.PixelCanvas.prototype.deletePalette = async function() {
        if (!this.currentEditingPalette || !confirm('Are you sure you want to delete this palette?')) return;
        
        const btn = document.getElementById('delete-palette-btn');
        this.setLoading(btn, true);
        try {
            const response = await fetch(`${this.getApiBaseUrl()}/api/palettes/${this.currentEditingPalette.id}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders(),
                credentials: 'include',
            });
            if (!response.ok) throw new Error('Failed to delete palette');
            
            await this.loadUserPalettes();
            document.getElementById('palette-editor-modal').style.display = 'none';
        } catch (error) {
            alert(error.message);
        } finally {
            this.setLoading(btn, false);
        }
    
};
