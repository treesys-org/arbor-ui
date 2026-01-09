
import { store } from '../../store.js';

class ArborModalSources extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        store.setModal(null);
    }

    render() {
        const ui = store.ui;
        const sources = store.value.sources || [];
        const activeId = store.value.activeSource?.id;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[95vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <button class="btn-close absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>

                <div class="p-6 h-full flex flex-col">
                    <h2 class="text-2xl font-black mb-2 dark:text-white">${ui.sourceManagerTitle}</h2>
                    <p class="text-sm text-slate-500 mb-6">${ui.sourceManagerDesc}</p>

                    <div class="flex-1 overflow-y-auto custom-scrollbar space-y-3 mb-4 pr-1">
                        ${sources.map(s => `
                            <div class="p-4 rounded-xl border-2 transition-all group relative ${s.id === activeId ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900'}">
                                <div class="flex justify-between items-start mb-2">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xl">${s.isDefault ? '🌳' : '🌐'}</span>
                                        <h3 class="font-bold text-slate-800 dark:text-white">${s.name}</h3>
                                        ${s.id === activeId ? `<span class="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">${ui.sourceActive}</span>` : ''}
                                    </div>
                                    ${!s.isDefault ? `<button class="btn-remove-source text-slate-300 hover:text-red-500 transition-colors p-1" data-id="${s.id}">✕</button>` : ''}
                                </div>
                                <p class="text-xs text-slate-400 font-mono mb-3 truncate">${s.url}</p>
                                
                                ${s.id !== activeId ? `
                                <button class="btn-load-source w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-slate-600 dark:text-purple-300 font-bold rounded-lg text-xs transition-colors" data-id="${s.id}">
                                    ${ui.sourceLoad}
                                </button>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>

                    <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
                        <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sourceAdd}</label>
                        <div class="flex gap-2">
                            <input id="inp-source-url" type="text" placeholder="https://.../data.json" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 dark:text-white">
                            <button id="btn-add-source" class="bg-purple-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg hover:bg-purple-50 active:scale-95 transition-transform">
                                +
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();

        this.querySelectorAll('.btn-load-source').forEach(btn => {
            btn.onclick = () => {
                store.loadAndSmartMerge(btn.dataset.id);
                this.close();
            };
        });
        
        this.querySelectorAll('.btn-remove-source').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if(confirm('Delete tree?')) store.removeSource(btn.dataset.id);
                // Re-render handled by store update event in modal logic or just close
                // Better UX: Close to refresh state properly from top
                this.close();
            };
        });
        
        const btnAdd = this.querySelector('#btn-add-source');
        if (btnAdd) {
            btnAdd.onclick = () => {
                const url = this.querySelector('#inp-source-url').value.trim();
                if (url) {
                    store.addSource(url);
                    this.querySelector('#inp-source-url').value = ''; 
                    this.close(); // Close to refresh
                }
            };
        }
    }
}
customElements.define('arbor-modal-sources', ArborModalSources);
