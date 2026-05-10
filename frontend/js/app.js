'use strict';

document.addEventListener('DOMContentLoaded', () => {
    window.pixelCanvas = new window.PixelCanvas();
    new window.ChatWidget();

    // Ensure leaderboard modal is hidden on page load
    const leaderboardModal = document.getElementById('leaderboard-modal');
    leaderboardModal.style.display = 'none';
});
