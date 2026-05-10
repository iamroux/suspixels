'use strict';

class ChatWidget {
    constructor() {
        this.widget = document.querySelector('.chat-widget');
        this.toggle = document.querySelector('.chat-toggle');
        this.container = document.querySelector('.chat-container');
        this.closeBtn = document.querySelector('.chat-close');
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.toggle.addEventListener('click', () => {
            this.widget.classList.toggle('expanded');
        });
        
        this.closeBtn.addEventListener('click', () => {
            this.widget.classList.remove('expanded');
        });
        
        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (this.widget.classList.contains('expanded') && 
                !this.container.contains(e.target) && 
                !this.toggle.contains(e.target)) {
                this.widget.classList.remove('expanded');
            }
        });
    }
}

window.ChatWidget = ChatWidget;
