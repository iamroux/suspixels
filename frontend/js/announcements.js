'use strict';

// ── Markdown renderer (subset: paragraphs, bullet lists, **bold**) ──────────
// Syntax reference — supported in announcements.json:
//
//   Plain paragraph text.
//
//   Second paragraph (blank line separates paragraphs).
//
//   - Bullet item one
//   - Bullet item two
//
//   Mix freely — a paragraph followed by a list:
//   **Bold text** works anywhere inline.
//   [Link text](https://example.com) — opens in a new tab.
//
// Not supported (and not needed): headings, inline code, nested lists.

function renderMarkdown(str) {
    const escape = s => String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const inline = s => escape(s)
        // [text](https://url) — links open in a new tab; http/https only
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    const lines  = str.split('\n');
    const out    = [];
    let listBuf  = [];
    let paraBuf  = [];

    const flushList = () => {
        if (!listBuf.length) return;
        out.push(`<ul>${listBuf.map(t => `<li>${t}</li>`).join('')}</ul>`);
        listBuf = [];
    };
    const flushPara = () => {
        if (!paraBuf.length) return;
        out.push(`<p>${paraBuf.join('<br>')}</p>`);
        paraBuf = [];
    };

    for (const line of lines) {
        if (line === '') {
            flushList();
            flushPara();
        } else if (line.startsWith('- ')) {
            flushPara();
            listBuf.push(inline(line.slice(2)));
        } else {
            flushList();
            paraBuf.push(inline(line));
        }
    }
    flushList();
    flushPara();

    return out.join('');
}

// ── Panel ────────────────────────────────────────────────────────────────────

(function () {
    const fab   = document.getElementById('announcements-fab');
    const panel = document.getElementById('announcements-panel');
    const list  = document.getElementById('announcements-list');
    const close = document.getElementById('announcements-close');

    if (!fab || !panel) return;

    let loaded = false;

    function openPanel() {
        panel.style.display = 'flex';
        fab.classList.add('active');
        if (!loaded) loadAnnouncements();
    }

    function closePanel() {
        panel.style.display = 'none';
        fab.classList.remove('active');
    }

    fab.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.style.display === 'none' ? openPanel() : closePanel();
    });

    close.addEventListener('click', closePanel);

    document.addEventListener('click', (e) => {
        if (panel.style.display !== 'none'
            && !panel.contains(e.target)
            && e.target !== fab) {
            closePanel();
        }
    });

    async function loadAnnouncements() {
        list.innerHTML = '<div class="ann-loading">Loading…</div>';
        try {
            const res  = await fetch('data/announcements.json?v=' + Date.now());
            const data = await res.json();
            loaded = true;
            renderList(data);
        } catch {
            list.innerHTML = '<div class="ann-loading">Failed to load.</div>';
        }
    }

    function renderList(items) {
        if (!items || items.length === 0) {
            list.innerHTML = '<div class="ann-loading">No announcements yet.</div>';
            return;
        }
        list.innerHTML = items.map(item => `
            <div class="ann-item">
                <div class="ann-meta">
                    <span class="ann-title">${escapeHtml(item.title)}</span>
                    <span class="ann-date">${escapeHtml(item.date)}</span>
                </div>
                <div class="ann-body">${renderMarkdown(item.body || '')}</div>
            </div>
        `).join('<div class="ann-divider"></div>');
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
})();
