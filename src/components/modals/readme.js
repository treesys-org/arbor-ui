
import { store } from '../../store.js';

class ArborModalReadme extends HTMLElement {
    constructor() {
        super();
        this.sourceId = null;
    }

    connectedCallback() {
        this.render();
    }

    close(skipFuture = false) {
        if (skipFuture && this.sourceId) {
            localStorage.setItem(`arbor-skip-readme-${this.sourceId}`, 'true');
        }
        store.setModal(null);
    }

    render() {
        const rootNode = store.value.data;
        const activeSource = store.value.activeSource;
        const ui = store.ui;
        
        if (!activeSource || !rootNode) {
            this.close();
            return;
        }

        // Base ID for preferences (strip version)
        this.sourceId = activeSource.id.split('-')[0];

        // Content Extraction
        const title = activeSource.name;
        const description = rootNode.description || "Welcome to this knowledge tree.";
        const icon = rootNode.icon || "🌳";
        
        // Try to get "Intro" content if available in root node metadata or description
        // For now, we stick to the basics to avoid complexity.
        
        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-500">
            <div class="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                
                <!-- Hero Image / Cover -->
                <div class="bg-gradient-to-br from-green-400 to-blue-500 h-32 relative flex items-center justify-center">
                    <div class="w-24 h-24 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-5xl shadow-xl border-4 border-white dark:border-slate-800 absolute -bottom-12">
                        ${icon}
                    </div>
                </div>

                <div class="px-8 pt-16 pb-8 text-center">
                    <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-2 leading-tight">${title}</h2>
                    <div class="w-12 h-1 bg-slate-200 dark:bg-slate-700 mx-auto rounded-full mb-6"></div>
                    
                    <p class="text-slate-600 dark:text-slate-300 leading-relaxed text-base mb-8">
                        ${description}
                    </p>

                    <button id="btn-start" class="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2 group">
                        <span>🚀</span> Start Exploring
                    </button>
                    
                    <div class="mt-6 flex justify-center">
                        <label class="flex items-center gap-2 cursor-pointer group text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors select-none">
                            <input type="checkbox" id="chk-skip" class="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer">
                            <span>Don't show again for this tree</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelector('#btn-start').onclick = () => {
            const skip = this.querySelector('#chk-skip').checked;
            this.close(skip);
        };
        
        // Also close on backdrop click
        this.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target === e.currentTarget) this.close(false);
        };
    }
}

customElements.define('arbor-modal-readme', ArborModalReadme);
