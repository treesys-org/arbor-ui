
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
            <!-- Reduced max-width to max-w-sm and changed height to auto with a reasonable max-height -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto" style="max-height: 85vh;">
                
                <!-- Header with Title and Close Button -->
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 shrink-0">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">🌍</span>
                        <h3 class="font-black text-xl text-slate-800 dark:text-white">${store.ui.languageTitle}</h3>
                    </div>
                    <button class="btn-close w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors">✕</button>
                </div>

                <!-- Language Grid -->
                <div class="p-6 grid grid-cols-1 gap-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    ${store.availableLanguages.map(l => `
                        <button class="btn-lang-sel p-4 border-2 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-4 group ${store.value.lang === l.code ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-100 dark:border-slate-700'}" data-code="${l.code}">
                            <span class="text-4xl drop-shadow-sm group-hover:scale-110 transition-transform">${l.flag}</span>
                            <div class="text-left flex-1">
                                <span class="font-bold text-slate-700 dark:text-slate-200 block text-lg">${l.nativeName}</span>
                                <span class="text-xs text-slate-400 dark:text-slate-500">${l.name}</span>
                            </div>
                            ${store.value.lang === l.code ? '<span class="text-xl text-green-500">✓</span>' : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
        
        this.querySelectorAll('.btn-lang-sel').forEach(b => {
             b.onclick = (e) => {
                const code = e.currentTarget.dataset.code;
                this.close();
                // Ensure the stack clears for UI repaint before freezing with data processing
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        store.setLanguage(code);
                    });
                });
             };
        });
    }
}
customElements.define('arbor-modal-language', ArborModalLanguage);
