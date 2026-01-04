
import { store } from '../store.js';

class ArborBreadcrumbs extends HTMLElement {
    constructor() { super(); }
    connectedCallback() {
        store.addEventListener('state-change', () => this.render());
        this.render();
    }
    render() {
        const path = store.value.path || [];
        this.innerHTML = `
            <nav class="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400 overflow-x-auto p-4">
                ${path.map((node, i) => `
                    <span>${node.name}</span>
                    ${i < path.length - 1 ? '<span class="text-slate-300">/</span>' : ''}
                `).join('')}
            </nav>
        `;
    }
}
customElements.define('arbor-breadcrumbs', ArborBreadcrumbs);
     