'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding Quick Tour
// Spotlight-driven, step-by-step guide for first-time users.
// Storage: localStorage key "sp_tour_seen" — set when tour ends or is skipped.
// ─────────────────────────────────────────────────────────────────────────────

const TOUR_STEPS = [
    {
        targetId: 'canvas-container',
        title: 'Welcome to Sus Pixels! 👋',
        body: 'A 3000×3000 collaborative canvas shared live with everyone. Every pixel you see was placed by a real person.',
    },
    {
        targetId: 'mode-toggle-btn',
        title: 'Edit Mode',
        body: 'Click here to switch into <strong>Edit Mode</strong> and start painting. You\'ll need to be logged in to place pixels.',
    },
    {
        targetId: 'selected-color',
        title: 'Your Active Color',
        body: 'Everything you paint uses this color. Change it anytime using the tools in the toolbar.',
    },
    {
        targetId: 'color-wheel-btn',
        title: 'Color Picker',
        body: 'Open the full color wheel to pick <em>any</em> color you want — millions of options.',
    },
    {
        targetId: 'eraser-btn',
        title: 'Eraser',
        body: 'Restore pixels back to white. Works at any brush size.',
    },
    {
        targetId: 'my-palettes-btn',
        title: 'Palettes',
        body: 'Save your favourite color combos as palettes. Switch colors in one tap while you\'re painting.',
    },
    {
        targetId: 'leaderboard-btn',
        title: 'Leaderboard 🏆',
        body: 'See who\'s placed the most pixels. Climb the ranks by painting more!',
    },
    {
        targetId: 'user-profile',
        title: 'Your Profile',
        body: 'Your profile lives here — stats, account settings, and your palettes. That\'s it — happy painting!',
    },
];

const STORAGE_KEY = 'sp_tour_seen';
const SPOTLIGHT_PADDING = 8; // px of breathing room around the target

// ── Public API ──────────────────────────────────────────────────────────────

window.PixelCanvas.prototype.startTour = function () {
    if (localStorage.getItem(STORAGE_KEY)) return; // already seen

    this._tourStep = 0;
    this._tourSpotlight = null;
    this._tourTooltip = null;

    this._buildTourDOM();
    this._showTourStep(0);
};

// Called by the "Take Tour Again" button in the profile page.
window.PixelCanvas.prototype.replayTour = function () {
    localStorage.removeItem(STORAGE_KEY);
    // Close profile page if open
    const profilePage = document.getElementById('profile-page');
    if (profilePage && profilePage.style.display !== 'none') {
        profilePage.style.display = 'none';
    }
    this.startTour();
};

// ── DOM construction ─────────────────────────────────────────────────────────

window.PixelCanvas.prototype._buildTourDOM = function () {
    // Spotlight
    const spotlight = document.createElement('div');
    spotlight.className = 'tour-spotlight';
    spotlight.id = 'tour-spotlight';
    document.body.appendChild(spotlight);
    this._tourSpotlight = spotlight;

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'tour-tooltip';
    tooltip.id = 'tour-tooltip';
    document.body.appendChild(tooltip);
    this._tourTooltip = tooltip;
};

// ── Step rendering ────────────────────────────────────────────────────────────

window.PixelCanvas.prototype._showTourStep = function (index) {
    const steps = TOUR_STEPS;
    const step = steps[index];
    const total = steps.length;
    const isLast = index === total - 1;

    this._tourStep = index;

    // ── Position spotlight ──
    const target = document.getElementById(step.targetId);
    if (target) {
        const rect = target.getBoundingClientRect();
        const s = this._tourSpotlight;
        s.style.top    = `${rect.top    - SPOTLIGHT_PADDING}px`;
        s.style.left   = `${rect.left   - SPOTLIGHT_PADDING}px`;
        s.style.width  = `${rect.width  + SPOTLIGHT_PADDING * 2}px`;
        s.style.height = `${rect.height + SPOTLIGHT_PADDING * 2}px`;

        // Tighter radius for small pill-shaped elements
        const minDim = Math.min(rect.width, rect.height);
        s.style.borderRadius = minDim < 40 ? '8px' : '10px';
    }

    // ── Build tooltip HTML ──
    const dots = steps
        .map((_, i) => `<div class="tour-dot${i === index ? ' active' : ''}"></div>`)
        .join('');

    this._tourTooltip.innerHTML = `
        <div class="tour-tooltip-header">
            <div class="tour-tooltip-title">${step.title}</div>
            <div class="tour-step-counter">${index + 1} / ${total}</div>
        </div>
        <div class="tour-tooltip-body">${step.body}</div>
        <div class="tour-actions">
            <button class="tour-btn-skip" id="tour-skip-btn">Skip tour</button>
            <div class="tour-progress-dots">${dots}</div>
            <button class="tour-btn-next" id="tour-next-btn">
                ${isLast ? 'Done <i class="fas fa-check"></i>' : 'Next <i class="fas fa-arrow-right"></i>'}
            </button>
        </div>
    `;

    // Trigger re-animation on re-render
    this._tourTooltip.classList.remove('tour-tooltip-reposition');
    void this._tourTooltip.offsetWidth; // reflow
    this._tourTooltip.classList.add('tour-tooltip-reposition');

    // ── Position tooltip relative to spotlight ──
    // Wait one frame so spotlight transition has started and tooltip has rendered size
    requestAnimationFrame(() => {
        this._positionTourTooltip(target);
    });

    // ── Wire buttons ──
    document.getElementById('tour-next-btn').addEventListener('click', () => {
        if (isLast) {
            this._endTour();
        } else {
            this._showTourStep(index + 1);
        }
    });

    document.getElementById('tour-skip-btn').addEventListener('click', () => {
        this._endTour();
    });
};

// ── Tooltip positioning ───────────────────────────────────────────────────────

window.PixelCanvas.prototype._positionTourTooltip = function (target) {
    const tooltip = this._tourTooltip;
    const MARGIN = 16; // gap between spotlight edge and tooltip

    const ttW = tooltip.offsetWidth;
    const ttH = tooltip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top, left, arrowClass;

    if (target) {
        const rect = target.getBoundingClientRect();
        const spotTop    = rect.top    - SPOTLIGHT_PADDING;
        const spotBottom = rect.bottom + SPOTLIGHT_PADDING;
        const spotLeft   = rect.left   - SPOTLIGHT_PADDING;
        const spotRight  = rect.right  + SPOTLIGHT_PADDING;
        const spotCenterX = (spotLeft + spotRight) / 2;

        const spaceBelow = vh - spotBottom;
        const spaceAbove = spotTop;

        if (spaceBelow >= ttH + MARGIN) {
            // Place below
            top = spotBottom + MARGIN;
            arrowClass = 'arrow-top';
        } else if (spaceAbove >= ttH + MARGIN) {
            // Place above
            top = spotTop - ttH - MARGIN;
            arrowClass = 'arrow-bottom';
        } else {
            // Not enough space either way — center vertically in viewport
            top = Math.max(MARGIN, (vh - ttH) / 2);
            arrowClass = null;
        }

        // Horizontally center on the spotlight, clamped to viewport
        left = spotCenterX - ttW / 2;
    } else {
        // No target found — center in viewport
        top  = (vh - ttH) / 2;
        left = (vw - ttW) / 2;
        arrowClass = null;
    }

    // Clamp to viewport bounds
    const clampedLeft = Math.max(MARGIN, Math.min(left, vw - ttW - MARGIN));
    const clampedTop  = Math.max(MARGIN, Math.min(top,  vh - ttH - MARGIN));

    tooltip.style.left = `${clampedLeft}px`;
    tooltip.style.top  = `${clampedTop}px`;

    // Arrow — remove existing, add new
    const existingArrow = tooltip.querySelector('.tour-arrow');
    if (existingArrow) existingArrow.remove();

    if (arrowClass) {
        const arrow = document.createElement('div');
        arrow.className = `tour-arrow ${arrowClass}`;

        // Offset arrow to actually point at the target center
        if (target) {
            const rect = target.getBoundingClientRect();
            const targetCenterX = rect.left + rect.width / 2;
            const relativeX = targetCenterX - clampedLeft;
            const clampedArrowX = Math.max(20, Math.min(relativeX, ttW - 20));
            arrow.style.left = `${clampedArrowX}px`;
            arrow.style.transform = 'translateX(-50%)';
        }

        tooltip.appendChild(arrow);
    }
};

// ── Teardown ──────────────────────────────────────────────────────────────────

window.PixelCanvas.prototype._endTour = function () {
    if (this._tourSpotlight) {
        this._tourSpotlight.remove();
        this._tourSpotlight = null;
    }
    if (this._tourTooltip) {
        this._tourTooltip.remove();
        this._tourTooltip = null;
    }
    localStorage.setItem(STORAGE_KEY, '1');
};

// ── Replay button wiring (called after profile page is set up) ─────────────────

window.PixelCanvas.prototype.initTourReplayBtn = function () {
    const btn = document.getElementById('replay-tour-btn');
    if (!btn) return;
    btn.addEventListener('click', () => this.replayTour());
};
