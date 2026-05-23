'use strict';

// ── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
    // Never fire when the user is typing
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;
    // Never fire with modifier keys
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const canvas = window.pixelCanvas;
    if (!canvas) return;

    switch (e.key.toLowerCase()) {
        case 'f':
            e.preventDefault();
            canvas.toggleEditMode();
            break;

        case 'e':
            if (!canvas.isEditMode) return;
            e.preventDefault();
            canvas.setErasing(!canvas.isErasing);
            break;

        case 'u':
            if (!canvas.isEditMode) return;
            e.preventDefault();
            document.getElementById('undo-btn')?.click();
            break;

        case 'a':
            if (!canvas.isEditMode) return;
            e.preventDefault();
            document.getElementById('apply-changes-btn')?.click();
            break;

        case 'd':
            if (!canvas.isEditMode) return;
            e.preventDefault();
            document.getElementById('discard-changes-btn')?.click();
            break;

        case 'p':
            e.preventDefault();
            document.getElementById('my-palettes-btn')?.click();
            break;

        case 'c':
            if (!canvas.isEditMode) return;
            e.preventDefault();
            document.getElementById('color-wheel-btn')?.click();
            break;

        case 'i':
            e.preventDefault();
            const chat = canvas.chatPanel;
            if (chat) chat.isOpen() ? chat.closePanel() : chat.openPanel();
            break;
    }
});

// ── Help panel ───────────────────────────────────────────────────────────────

(function () {
    const fab   = document.getElementById('help-fab');
    const panel = document.getElementById('help-panel');
    const close = document.getElementById('help-close');

    if (!fab || !panel) return;

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

    function openPanel()  { panel.style.display = 'flex'; fab.classList.add('active'); }
    function closePanel() { panel.style.display = 'none';  fab.classList.remove('active'); }
})();
