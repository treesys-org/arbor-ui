
import { store } from '../../store.js';

class ArborModalLoadWarning extends HTMLElement {
    
    connectedCallback() {
        this.render();
    }

    cancel() {
        store.cancelUntrustedLoad();
    }

    confirm() {
        store.proceedWithUntrustedLoad();
    }

    render() {
        const ui = store.ui;
        const url = store.value.pendingUntrustedSource?.url;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <!-- Increased width to max-w-lg -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[95vh] border border-red-500/50 dark:border-red-500/30 cursor-auto transition-all duration-300">
                
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-red-50 dark:bg-red-900/10 shrink-0">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">⚠️</span>
                        <h3 class="font-black text-xl text-red-800 dark:text-red-300">${ui.secLoadWarningTitle || "Load Unverified Tree?"}</h3>
                    </div>
                </div>

                <div class="p-8">
                    <p class="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">${ui.secLoadWarningBody}</p>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">${ui.secWarningCheck}</p>
                    
                    <div class="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm text-slate-700 dark:text-slate-300 font-mono break-all border border-slate-200 dark:border-slate-700">
                        ${url || 'N/A'}
                    </div>
                </div>
                
                <div class="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex flex-col md:flex-row gap-3">
                    <button class="btn-cancel w-full md:w-1/2 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-colors">
                        ${ui.secLoadCancel || "No, take me to safety"}
                    </button>
                    <button class="btn-confirm w-full md:w-1/2 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-transform active:scale-95">
                        ${ui.secLoadConfirm || "Yes, load this tree"}
                    </button>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-cancel').onclick = () => this.cancel();
        this.querySelector('.btn-confirm').onclick = () => this.confirm();
    }
}

customElements.define('arbor-modal-load-warning', ArborModalLoadWarning);
