
import { store } from '../../store.js';

class ArborModalImpressum extends HTMLElement {
    constructor() {
        super();
        this.showDetails = false;
    }

    connectedCallback() {
        this.render();
    }

    close() {
        store.setModal(null);
    }

    render() {
        const ui = store.ui;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[95vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <button class="btn-close absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>

                <div class="p-8 overflow-y-auto custom-scrollbar">
                    <h2 class="text-2xl font-black mb-6 dark:text-white flex items-center gap-2">
                        <span>⚖️</span> ${ui.impressumTitle}
                    </h2>
                    
                    <div class="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <p class="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">${ui.impressumText}</p>
                        
                        <button id="btn-show-imp" class="${this.showDetails ? 'hidden' : 'block'} text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300 font-bold text-sm flex items-center gap-1 transition-colors">
                            <span>${ui.showImpressumDetails}</span>
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        <div class="${this.showDetails ? 'block' : 'hidden'} mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-2 fade-in">
                             <div class="flex flex-col items-center mb-6">
                                 <div class="w-16 h-16 bg-white dark:bg-slate-900 rounded-xl shadow-sm flex items-center justify-center text-2xl border border-slate-100 dark:border-slate-800 mb-2">🌲</div>
                                 <p class="font-black text-slate-800 dark:text-white">treesys.org</p>
                             </div>
                             <pre class="whitespace-pre-wrap font-mono text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">${ui.impressumDetails}</pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
        
        const btnShow = this.querySelector('#btn-show-imp');
        if (btnShow) {
            btnShow.onclick = () => {
                this.showDetails = true;
                this.render();
            };
        }
    }
}
customElements.define('arbor-modal-impressum', ArborModalImpressum);
