
import { store } from '../store.js';

class ArborBreadcrumbs extends HTMLElement {
    constructor() { 
        super();
        this.isCollapsed = true;
        this.collapseThreshold = 3;
    }
    
    connectedCallback() {
        store.addEventListener('state-change', () => this.render());
        this.render();
    }
    
    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        this.render();
    }

    renderNode(node, isLast) {
        return `
            <button onclick="store.navigateTo('${node.id}')" title="${node.name}"
                class="px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 border-b-2 max-w-full transition-all active:translate-y-[2px]
                ${isLast 
                    ? 'bg-sky-500 border-sky-700 text-white shadow-sm' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}"
            >
                <span class="flex-shrink-0">${node.icon}</span>
                <span class="truncate max-w-[150px]">${node.name}</span>
            </button>
        `;
    }

    render() {
        const path = store.value.path || [];
        
        let html = '';
        if (!this.isCollapsed || path.length <= this.collapseThreshold) {
            html = path.map((node, i) => `
                <div class="flex items-center flex-shrink-0">
                    ${i > 0 ? `<svg class="w-4 h-4 text-slate-300 dark:text-slate-600 mx-1" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>` : ''}
                    ${this.renderNode(node, i === path.length - 1)}
                </div>
            `).join('');
        } else {
            const first = path[0];
            const last = path[path.length - 1];
            html = `
                <div class="flex items-center flex-shrink-0">${this.renderNode(first, false)}</div>
                <div class="flex items-center flex-shrink-0">
                     <svg class="w-4 h-4 text-slate-300 dark:text-slate-600 mx-1" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                     <button id="btn-collapse" class="px-3 py-1.5 rounded-lg text-sm font-bold bg-white dark:bg-slate-800 border-b-2 border-slate-200 dark:border-slate-700">...</button>
                </div>
                <div class="flex items-center flex-shrink-0">
                     <svg class="w-4 h-4 text-slate-300 dark:text-slate-600 mx-1" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                    ${this.renderNode(last, true)}
                </div>
            `;
        }

        this.innerHTML = `
            <nav class="flex items-center space-x-2 overflow-x-auto whitespace-nowrap py-2 w-full pr-4 custom-scrollbar">
                ${html}
            </nav>
        `;
        
        if (this.querySelector('#btn-collapse')) {
            this.querySelector('#btn-collapse').onclick = () => this.toggleCollapse();
        }
    }
}
customElements.define('arbor-breadcrumbs', ArborBreadcrumbs);
