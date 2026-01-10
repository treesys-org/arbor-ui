

import { store } from '../../store.js';

class ArborModalLanguage extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        store.setModal(null);
    }

    render() {
        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[95vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <button class="btn-close absolute top-5 right-5 w-10 h-10 flex items-center justify-center rounded-full bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors z-50 backdrop-blur-sm">✕</button>

                <div class="p-8 grid grid-cols-2 gap-4">
                    ${store.availableLanguages.map(l => `
                        <button class="btn-lang-sel p-4 border rounded-xl hover:bg-slate-50 flex flex-col items-center gap-2 ${store.value.lang === l.code ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-200 dark:border-slate-700'}" data-code="${l.code}">
                            <span class="text-4xl">${l.flag}</span>
                            <span class="font-bold text-slate-700 dark:text-slate-200">${l.nativeName}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
        
        this.querySelectorAll('.btn-lang-sel').forEach(b => b.onclick = (e) => {
            store.setLanguage(e.currentTarget.dataset.code);
            this.close();
        });
    }
}
customElements.define('arbor-modal-language', ArborModalLanguage);
