
import { store } from './store.js';
import './components/sidebar.js';
import './components/graph.js';
import './components/content.js';
import './components/modals.js';
import './components/progress-widget.js';
import './components/construction-panel.js'; // NEW
import './components/modals/editor.js';
import './components/modals/sage.js';

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Check local storage for theme, falling back to system preference
    let initialTheme = localStorage.getItem('arbor-theme');
    if (!initialTheme) {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            initialTheme = 'dark';
        } else {
            initialTheme = 'light';
        }
    }
    store.setTheme(initialTheme);

    // Store initializes itself in its constructor via this.initialize()
});