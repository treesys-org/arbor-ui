
import { store } from '../../store.js';

class ArborModalWelcome extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        // Mark as seen so it doesn't pop up again unless requested via Help
        localStorage.setItem('arbor-welcome-seen', 'true');
        store.setModal(null);
    }

    render() {
        const ui = store.ui;
        
        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4 animate-in fade-in">
            <div class="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-4xl relative overflow-hidden flex flex-col md:flex-row max-h-[90vh] md:h-[600px] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                
                <!-- Global Close Button (Top Right) -->
                <button class="btn-close absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center rounded-full transition-colors text-white bg-black/20 hover:bg-black/30 md:text-slate-400 md:bg-transparent md:hover:bg-slate-100 md:dark:hover:bg-slate-800">✕</button>

                <!-- Left: Hero -->
                <div class="md:w-5/12 bg-gradient-to-br from-green-500 to-emerald-700 p-8 md:p-12 flex flex-col justify-between text-white relative overflow-hidden shrink-0">
                    <div class="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div class="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-black/10 rounded-full blur-3xl pointer-events-none"></div>

                    <div class="relative z-10">
                         <h1 class="font-black text-4xl md:text-5xl mb-2 tracking-tight">ARBOR</h1>
                         <p class="text-green-100 font-medium text-lg border-l-2 border-white/30 pl-3">Open University</p>
                    </div>

                    <div class="relative z-10 my-8 md:my-0 text-center">
                         <div class="text-8xl md:text-9xl filter drop-shadow-2xl animate-in zoom-in duration-500 delay-100">🦉</div>
                    </div>

                    <div class="relative z-10">
                         <p class="text-sm text-green-50 font-medium opacity-90 leading-relaxed">
                            "${ui.welcomeSteps[0].text}"
                         </p>
                    </div>
                </div>

                <!-- Right: Content -->
                <div class="md:w-7/12 p-8 md:p-10 bg-white dark:bg-slate-900 flex flex-col overflow-y-auto custom-scrollbar relative">
                    <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-6 md:mb-8 mt-4 md:mt-0">${ui.tutorialTitle}</h2>

                    <div class="grid grid-cols-1 gap-4 mb-8">
                        
                        <!-- Step 1: Explore -->
                        <div class="group p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-blue-200 dark:hover:border-blue-800 transition-all">
                             <div class="flex items-start gap-4">
                                 <div class="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-2xl flex items-center justify-center shadow-sm text-blue-600 dark:text-blue-400">✨</div>
                                 <div>
                                     <h3 class="font-bold text-slate-800 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${ui.welcomeSteps[1].title}</h3>
                                     <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">${ui.welcomeSteps[1].text}</p>
                                 </div>
                             </div>
                        </div>

                        <!-- Step 2: Seeds -->
                        <div class="group p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-orange-200 dark:hover:border-orange-800 transition-all">
                             <div class="flex items-start gap-4">
                                 <div class="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-2xl flex items-center justify-center shadow-sm text-orange-600 dark:text-orange-400">🌰</div>
                                 <div>
                                     <h3 class="font-bold text-slate-800 dark:text-white mb-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">${ui.welcomeSteps[2].title}</h3>
                                     <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">${ui.welcomeSteps[2].text}</p>
                                 </div>
                             </div>
                        </div>

                        <!-- Step 3: AI -->
                        <div class="group p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-purple-200 dark:hover:border-purple-800 transition-all">
                             <div class="flex items-start gap-4">
                                 <div class="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-2xl flex items-center justify-center shadow-sm text-purple-600 dark:text-purple-400">🧠</div>
                                 <div>
                                     <h3 class="font-bold text-slate-800 dark:text-white mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">${ui.welcomeSteps[3].title}</h3>
                                     <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">${ui.welcomeSteps[3].text}</p>
                                 </div>
                             </div>
                        </div>

                         <!-- Step 4: Offline Privacy (New) -->
                        <div class="group p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600 transition-all">
                             <div class="flex items-start gap-4">
                                 <div class="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700/50 text-2xl flex items-center justify-center shadow-sm text-slate-600 dark:text-slate-300">🎒</div>
                                 <div>
                                     <h3 class="font-bold text-slate-800 dark:text-white mb-1 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">${ui.welcomeSteps[4].title}</h3>
                                     <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">${ui.welcomeSteps[4].text}</p>
                                 </div>
                             </div>
                        </div>

                    </div>
                    
                    <div class="mt-auto pt-4">
                        <button id="btn-tutorial-finish" class="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl shadow-xl hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group">
                            <span>${ui.tutorialFinish}</span>
                            <span class="group-hover:translate-x-1 transition-transform">→</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
        this.querySelector('#btn-tutorial-finish').onclick = () => this.close();
    }
}
customElements.define('arbor-modal-welcome', ArborModalWelcome);