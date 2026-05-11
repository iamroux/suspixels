'use strict';

document.addEventListener('DOMContentLoaded', () => {
    window.pixelCanvas = new window.PixelCanvas();
    new window.ChatWidget();

    // Ensure leaderboard modal is hidden on page load
    const leaderboardModal = document.getElementById('leaderboard-modal');
    leaderboardModal.style.display = 'none';

    // Show tour for users who are already logged in but haven't seen it yet.
    // (New users get it triggered inside handleAuthSuccess / guest handler instead.)
    const alreadyLoggedIn = !!localStorage.getItem('pixelUser');
    if (alreadyLoggedIn && !localStorage.getItem('sp_tour_seen')) {
        window.pixelCanvas.startTour();
    }
});
