
import { store } from '../../store.js';

class ArborModalWelcome extends HTMLElement {
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
                
                <div class="p-8 md:p-10 relative overflow-hidden overflow-y-auto custom-scrollbar">
                    <div class="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-green-50 dark:bg-green-900/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div class="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-blue-50 dark:bg-blue-900/10 rounded-full blur-3xl pointer-events-none"></div>

                    <div class="text-center mb-8 relative z-10">
                        <div class="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-600 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-xl shadow-green-500/20 mb-4 transform -rotate-3">🦉</div>
                        <h2 class="text-3xl font-black text-slate-800 dark:text-white tracking-tight">${ui.tutorialTitle}</h2>
                        <div class="w-12 h-1 bg-slate-200 dark:bg-slate-700 mx-auto mt-4 rounded-full"></div>
                    </div>

                    <div class="space-y-6 relative z-10 mb-10">
                        ${ui.welcomeSteps.map(step => `
                            <div class="flex gap-5 items-start p-4 rounded-2xl hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700/50">
                                <div class="text-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl w-14 h-14 flex items-center justify-center shrink-0 shadow-sm text-slate-700 dark:text-slate-200">${step.icon}</div>
                                <div>
                                    <h3 class="font-bold text-lg text-slate-800 dark:text-white mb-1">${step.title}</h3>
                                    <p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">${step.text}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <button id="btn-tutorial-finish" class="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 relative z-10 group">
                        <span>${ui.tutorialFinish}</span>
                        <span class="group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
        this.querySelector('#btn-tutorial-finish').onclick = () => this.close();
    }
}
customElements.define('arbor-modal-welcome', ArborModalWelcome);
