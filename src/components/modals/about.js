
import { store } from '../../store.js';

class ArborModalAbout extends HTMLElement {
    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
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

                <div class="p-8 text-center overflow-y-auto custom-scrollbar">
                    <h2 class="text-2xl font-black mb-4 dark:text-white flex items-center justify-center gap-2">
                        <span>ℹ️</span> ${ui.missionTitle}
                    </h2>
                    
                    <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl text-left mb-6 border border-slate-100 dark:border-slate-800">
                        <p class="text-slate-600 dark:text-slate-300 leading-relaxed mb-6 font-medium">${ui.missionText}</p>
                        
                        <a href="https://github.com/treesys-org/arbor-ui" target="_blank" class="flex items-center justify-center gap-2 w-full py-3.5 bg-slate-900 dark:bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-600 transition-all shadow-lg active:scale-95 group">
                            <svg class="w-5 h-5 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.164 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.322-3.369-1.322-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.597 1.028 2.688 0 3.848-2.339 4.685-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" /></svg>
                            ${ui.viewOnGithub}
                        </a>
                    </div>
                    
                    <div class="pt-6 border-t border-slate-100 dark:border-slate-800">
                        <h3 class="font-bold text-slate-400 dark:text-slate-500 mb-2 text-xs uppercase tracking-widest">${ui.metaphorTitle}</h3>
                        <blockquote class="text-slate-500 dark:text-slate-400 italic text-sm font-serif">"${ui.metaphorText}"</blockquote>
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
    }
}
customElements.define('arbor-modal-about', ArborModalAbout);
