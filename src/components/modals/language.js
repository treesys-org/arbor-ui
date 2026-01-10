

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
                
                <!-- Header with Title and Close Button -->
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 shrink-0">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">🌍</span>
                        <h3 class="font-black text-xl text-slate-800 dark:text-white">${store.ui.languageTitle}</h3>
                    </div>
                    <button class="btn-close w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors">✕</button>
                </div>

                <!-- Language Grid -->
                <div class="p-8 grid grid-cols-2 gap-4 overflow-y-auto">
                    ${store.availableLanguages.map(l => `
                        <button class="btn-lang-sel p-4 border-2 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex flex-col items-center gap-3 group ${store.value.lang === l.code ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-100 dark:border-slate-700'}" data-code="${l.code}">
                            <span class="text-5xl drop-shadow-sm group-hover:scale-110 transition-transform">${l.flag}</span>
                            <span class="font-bold text-slate-700 dark:text-slate-200">${l.nativeName}</span>
                            ${store.value.lang === l.code ? '<span class="text-[10px] uppercase font-black text-green-600 dark:text-green-400 bg-green-200 dark:bg-green-900/50 px-2 py-0.5 rounded-full">Active</span>' : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
        
        this.querySelectorAll('.btn-lang-sel').forEach(b => b.onclick = (e) => {
            // Close first to make UI feel responsive, then trigger state change which activates global loader
            this.close();
            // Small timeout to allow modal close animation to start before heavy lifting
            setTimeout(() => {
                store.setLanguage(e.currentTarget.dataset.code);
            }, 50);
        });
    }
}
customElements.define('arbor-modal-language', ArborModalLanguage);