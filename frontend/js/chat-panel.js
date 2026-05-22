'use strict';

class ChatPanel {
    constructor() {
        this.widget = document.querySelector('.chat-widget');
        this.toggle = document.querySelector('.chat-toggle');
        this.container = document.querySelector('.chat-container');
        this.closeBtn = this.container.querySelector('.chat-close');
        this.muteBtn = this.container.querySelector('.chat-mute');
        this.messagesEl = document.getElementById('chat-messages');
        this.emptyEl = document.getElementById('chat-empty');
        this.inputEl = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('chat-send-btn');
        this.inputWrap = document.getElementById('chat-input-wrap');
        this.loginHint = document.getElementById('chat-login-hint');
        this.loginLink = document.getElementById('chat-login-link');
        this.toastEl = document.getElementById('chat-toast');
        this.unreadEl = document.querySelector('.chat-unread');
        this.loadingEl = document.getElementById('chat-loading');
        this.gifBtn = document.getElementById('chat-gif-btn');
        this.gifPicker = document.getElementById('chat-gif-picker');
        this.gifSearchEl = document.getElementById('chat-gif-input');
        this.gifGrid = document.getElementById('chat-gif-grid');

        this.historyLoaded = false;
        this.unreadCount = 0;
        this.muted = localStorage.getItem('chatMuted') === '1';
        this.lastSoundAt = 0;
        this.audioCtx = null;
        this.stickyBottom = true;
        this.toastTimer = null;
        this.recentIds = new Set();
        this.gifSearchTimer = null;
        this.gifTrendingLoaded = false;

        this.setupEventListeners();
        this.setupGifPicker();
        this.applyMuteUI();
        this.applyAuthUI();
        this.expose();
    }

    expose() {
        if (window.pixelCanvas) {
            window.pixelCanvas.chatPanel = this;
        } else {
            const tryAgain = () => {
                if (window.pixelCanvas) {
                    window.pixelCanvas.chatPanel = this;
                } else {
                    setTimeout(tryAgain, 50);
                }
            };
            tryAgain();
        }
    }

    setupEventListeners() {
        this.toggle.addEventListener('click', () => {
            if (this.isOpen()) {
                this.closePanel();
            } else {
                this.openPanel();
            }
        });

        this.closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closePanel();
        });

        document.addEventListener('click', (e) => {
            if (this.widget.classList.contains('expanded')
                && !this.container.contains(e.target)
                && !this.toggle.contains(e.target)) {
                this.closePanel();
            }
        });

        this.muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.muted = !this.muted;
            localStorage.setItem('chatMuted', this.muted ? '1' : '0');
            this.applyMuteUI();
        });

        this.inputEl.addEventListener('input', () => {
            this.sendBtn.disabled = this.inputEl.value.trim().length === 0;
            this.autoResize();
        });

        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.send();
            }
        });

        this.sendBtn.addEventListener('click', () => this.send());

        this.messagesEl.addEventListener('scroll', () => {
            const distFromBottom = this.messagesEl.scrollHeight
                - this.messagesEl.scrollTop
                - this.messagesEl.clientHeight;
            this.stickyBottom = distFromBottom < 100;
        });

        if (this.loginLink) {
            this.loginLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.closePanel();
                if (window.pixelCanvas && typeof window.pixelCanvas.initAuthModal === 'function') {
                    window.pixelCanvas.initAuthModal();
                }
            });
        }
    }

    autoResize() {
        const el = this.inputEl;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 96) + 'px';
    }

    applyMuteUI() {
        const icon = this.muteBtn.querySelector('i');
        if (this.muted) {
            icon.classList.remove('fa-volume-up');
            icon.classList.add('fa-volume-mute');
            this.muteBtn.title = 'Unmute sound';
        } else {
            icon.classList.remove('fa-volume-mute');
            icon.classList.add('fa-volume-up');
            this.muteBtn.title = 'Mute sound';
        }
    }

    applyAuthUI() {
        const loggedIn = !!(window.pixelCanvas && window.pixelCanvas.user);
        // Don't use the `hidden` HTML attribute — our CSS sets `display: flex`
        // which wins over it. Toggle inline style instead.
        this.inputWrap.style.display = loggedIn ? '' : 'none';
        this.loginHint.style.display = loggedIn ? 'none' : '';
    }

    openPanel() {
        this.widget.classList.add('expanded');
        this.clearUnread();
        this.applyAuthUI();
        // Double rAF: fires after the browser has painted the newly-visible
        // flex container, so scrollHeight is fully settled before we read it.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this.scrollToBottom(true);
            if (this.inputWrap.style.display !== 'none') this.inputEl.focus();
        }));
    }

    closePanel() {
        this.widget.classList.remove('expanded');
    }

    isOpen() {
        return this.widget.classList.contains('expanded');
    }

    incrementUnread() {
        if (this.isOpen()) return;
        this.unreadCount++;
        this.unreadEl.hidden = false;
        this.unreadEl.textContent = this.unreadCount > 99 ? '99+' : String(this.unreadCount);
    }

    clearUnread() {
        this.unreadCount = 0;
        this.unreadEl.hidden = true;
    }

    send() {
        const body = this.inputEl.value.trim();
        if (!body) return;
        const ws = window.pixelCanvas && window.pixelCanvas.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            this.showToast('Not connected — try again in a moment');
            return;
        }
        try {
            ws.send(JSON.stringify({ type: 'chat_send', body }));
            this.inputEl.value = '';
            this.sendBtn.disabled = true;
            this.autoResize();
        } catch (e) {
            this.showToast('Failed to send');
        }
    }

    handle(msg) {
        switch (msg.type) {
            case 'chat_history':
                this.renderHistory(msg.messages || []);
                break;
            case 'chat_message':
                this.appendMessage(msg, { isHistory: false });
                break;
            case 'chat_error':
                this.handleError(msg);
                break;
        }
    }

    handleError(msg) {
        switch (msg.code) {
            case 'rate_limited':
                this.showToast(`Slow down — try again in ${msg.retryAfter || 1}s`);
                break;
            case 'too_long':
                this.showToast('Message too long');
                break;
            case 'guests_cannot_send':
                this.showToast('Log in to chat');
                break;
            default:
                this.showToast('Something went wrong');
        }
    }

    showToast(text) {
        this.toastEl.textContent = text;
        this.toastEl.hidden = false;
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            this.toastEl.hidden = true;
        }, 3000);
    }

    renderHistory(messages) {
        this.historyLoaded = true;
        this.loadingEl.style.display = 'none';
        this.messagesEl.querySelectorAll('.chat-message').forEach((el) => el.remove());
        this.recentIds.clear();
        messages.forEach((m) => this.appendMessage(m, { isHistory: true }));
        this.scrollToBottom(true);
        this.updateEmptyState();
    }

    appendMessage(m, { isHistory }) {
        if (!m || !m.id || this.recentIds.has(m.id)) return;
        this.recentIds.add(m.id);
        if (this.recentIds.size > 400) {
            // Trim the dedup set so it doesn't grow forever
            const keep = Array.from(this.recentIds).slice(-300);
            this.recentIds = new Set(keep);
        }

        const ownName = window.pixelCanvas && (window.pixelCanvas.user
            ? window.pixelCanvas.user.name
            : window.pixelCanvas.userName);
        const isOwn = ownName && m.username === ownName;

        const el = document.createElement('div');
        el.className = 'chat-message' + (isOwn ? ' own' : '');
        el.dataset.id = m.id;

        const avatarHtml = (window.pixelCanvas && typeof window.pixelCanvas.getAvatarHtml === 'function')
            ? window.pixelCanvas.getAvatarHtml(m.username, m.prestigeCount || 0, m.avatarStyle || 'bottts')
            : '';

        const ts = m.createdAt ? new Date(m.createdAt) : new Date();
        el.innerHTML = `
            <div class="chat-avatar" data-name="${escapeHtml(m.username)}">${avatarHtml}</div>
            <div class="chat-bubble">
                <div class="chat-meta">
                    <span class="chat-name">${escapeHtml(m.username)}</span>
                    <span class="chat-time" title="${ts.toLocaleString()}">${formatRelative(ts)}</span>
                </div>
                <div class="chat-body">${renderBody(m.body)}</div>
            </div>
        `;
        // Click avatar/name → open public profile
        const avatarEl = el.querySelector('.chat-avatar');
        if (avatarEl && window.pixelCanvas && typeof window.pixelCanvas.openPublicProfilePage === 'function') {
            avatarEl.style.cursor = 'pointer';
            avatarEl.addEventListener('click', () => {
                window.pixelCanvas.openPublicProfilePage(m.username);
            });
        }

        this.messagesEl.appendChild(el);

        if (!isHistory) {
            if (this.stickyBottom || isOwn) this.scrollToBottom();
            if (!isOwn) {
                this.incrementUnread();
                this.playPop();
            }
        }
        this.updateEmptyState();
    }

    updateEmptyState() {
        if (!this.historyLoaded) return;
        const has = !!this.messagesEl.querySelector('.chat-message');
        this.emptyEl.style.display = has ? 'none' : 'block';
    }

    scrollToBottom(force = false) {
        if (force || this.stickyBottom) {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
            this.stickyBottom = true;
        }
    }

    // ── GIF picker ────────────────────────────────────────

    setupGifPicker() {
        this.gifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.gifPicker.style.display === 'none') {
                this.openGifPicker();
            } else {
                this.closeGifPicker();
            }
        });

        this.gifSearchEl.addEventListener('input', () => {
            clearTimeout(this.gifSearchTimer);
            this.gifSearchTimer = setTimeout(() => {
                const q = this.gifSearchEl.value.trim();
                if (q) {
                    this.searchGifs(q);
                } else {
                    this.loadTrending();
                }
            }, 400);
        });

        // Close picker on outside click
        document.addEventListener('click', (e) => {
            if (this.gifPicker.style.display !== 'none'
                && !this.gifPicker.contains(e.target)
                && e.target !== this.gifBtn) {
                this.closeGifPicker();
            }
        });
    }

    openGifPicker() {
        this.gifPicker.style.display = 'flex';
        this.gifSearchEl.focus();
        if (!this.gifTrendingLoaded) this.loadTrending();
    }

    closeGifPicker() {
        this.gifPicker.style.display = 'none';
    }

    async loadTrending() {
        this.gifGrid.innerHTML = '<div class="chat-gif-status">Trending…</div>';
        try {
            const res = await fetch(
                `https://api.giphy.com/v1/gifs/trending?api_key=62BHxuNYDstYFxj1JBODTT1X3JCK8Fd2&limit=24&rating=g`
            );
            const { data } = await res.json();
            this.gifTrendingLoaded = true;
            this.renderGifs(data);
        } catch {
            this.gifGrid.innerHTML = '<div class="chat-gif-status">Failed to load</div>';
        }
    }

    async searchGifs(q) {
        this.gifGrid.innerHTML = '<div class="chat-gif-status">Searching…</div>';
        try {
            const res = await fetch(
                `https://api.giphy.com/v1/gifs/search?api_key=62BHxuNYDstYFxj1JBODTT1X3JCK8Fd2&q=${encodeURIComponent(q)}&limit=24&rating=g`
            );
            const { data } = await res.json();
            this.renderGifs(data);
        } catch {
            this.gifGrid.innerHTML = '<div class="chat-gif-status">Search failed</div>';
        }
    }

    renderGifs(gifs) {
        if (!gifs || gifs.length === 0) {
            this.gifGrid.innerHTML = '<div class="chat-gif-status">No results</div>';
            return;
        }
        this.gifGrid.innerHTML = '';
        gifs.forEach((gif) => {
            const preview = gif.images.fixed_height_small;
            const full = gif.images.fixed_height;
            if (!preview || !full) return;

            // Strip tracking query params so the stored URL stays short + clean
            const sendUrl = stripQuery(full.url);

            const img = document.createElement('img');
            img.src = preview.url;
            img.className = 'chat-gif-item';
            img.loading = 'lazy';
            img.width = preview.width || 120;
            img.height = preview.height || 90;
            img.addEventListener('click', () => this.sendGif(sendUrl));
            this.gifGrid.appendChild(img);
        });
    }

    sendGif(url) {
        const ws = window.pixelCanvas && window.pixelCanvas.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            this.showToast('Not connected — try again in a moment');
            return;
        }
        ws.send(JSON.stringify({ type: 'chat_send', body: `[gif:${url}]` }));
        this.closeGifPicker();
    }

    playPop() {
        if (this.muted) return;
        const now = Date.now();
        if (now - this.lastSoundAt < 1500) return;
        this.lastSoundAt = now;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            if (!this.audioCtx) this.audioCtx = new AC();
            const ctx = this.audioCtx;
            const now2 = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now2);
            osc.frequency.exponentialRampToValueAtTime(440, now2 + 0.12);
            gain.gain.setValueAtTime(0.0001, now2);
            gain.gain.exponentialRampToValueAtTime(0.18, now2 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now2 + 0.18);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now2);
            osc.stop(now2 + 0.2);
        } catch (e) {
            // ignore — autoplay restrictions etc.
        }
    }
}

function renderBody(str) {
    // GIF token — entire body is [gif:https://media*.giphy.com/...]
    const gifMatch = str.match(/^\[gif:(https:\/\/media[0-9]*\.giphy\.com\/[^\]]+)\]$/);
    if (gifMatch) {
        const url = gifMatch[1];
        return `<img src="${url}" class="chat-gif" alt="GIF" loading="lazy">`;
    }
    // Escape HTML first (XSS safe), then highlight @mentions
    return escapeHtml(str).replace(
        /@([\w-]+)/g,
        '<span class="chat-mention">@$1</span>'
    );
}

function stripQuery(url) {
    try {
        const u = new URL(url);
        return u.origin + u.pathname;
    } catch {
        return url;
    }
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatRelative(date) {
    const diff = Math.max(0, Date.now() - date.getTime());
    const sec = Math.floor(diff / 1000);
    if (sec < 10) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return date.toLocaleDateString();
}

window.ChatPanel = ChatPanel;
