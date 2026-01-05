

import { store } from './store.js';
import './components/sidebar.js';
import './components/graph.js';
import './components/content.js';
import './components/breadcrumbs.js';
import './components/modals.js';
import './components/progress-widget.js';
import './components/editor-modal.js';

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Check local storage for theme
    const savedTheme = localStorage.getItem('arbor-theme') || 'light';
    store.setTheme(savedTheme);

    // Initial Load
    store.loadSources();
});