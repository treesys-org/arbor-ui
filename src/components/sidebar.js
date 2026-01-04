
import { store } from '../store.js';

class ArborSidebar extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
    }

    render() {
        const { theme } = store.value;
        const ui = store.ui;

        this.innerHTML = `
        <aside class="hidden md:flex flex-col w-[80px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30 h-full items-center py-6 shadow-xl justify-between">
            <div class="flex flex-col items-center gap-6">
                <div class="w-12 h-12 flex items-center justify-center bg-green-500 text-white rounded-xl text-2xl mb-4">🌳</div>
                
                <button id="btn-search" class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-sky-500 hover:text-white transition-colors flex items-center justify-center text-slate-500 dark:text-slate-400" title="${ui.navSearch}">
                   <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"></path></svg>
                </button>

                <button id="btn-sources" class="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-600 hover:text-white transition-colors flex items-center justify-center" title="${ui.navSources}">
                   <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                </button>
            </div>

            <div class="flex flex-col gap-4 items-center">
                <button id="btn-theme" class="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-xl">
                    ${theme === 'light' ? '🌙' : '☀️'}
                </button>
                <button id="btn-help" class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-500 hover:text-sky-500">?</button>
            </div>
        </aside>
        `;

        this.querySelector('#btn-theme').onclick = () => store.toggleTheme();
        this.querySelector('#btn-sources').onclick = () => store.setModal('sources');
        this.querySelector('#btn-help').onclick = () => store.setModal('tutorial');
    }
}
customElements.define('arbor-sidebar', ArborSidebar);
