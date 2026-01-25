
import { store } from '../../store.js';

class ArborModalWelcome extends HTMLElement {
    constructor() {
        super();
        this.activeStep = 0;
        this.lastRenderKey = null;
        // Bind the render method for event listeners
        this.handleStateChange = () => this.render();
    }

    connectedCallback() {
        this.render();
        
        // Listen for store updates (Critical for language switching)
        store.addEventListener('state-change', this.handleStateChange);

        // Keyboard navigation support
        this.keyHandler = (e) => {
            if (e.key === 'ArrowRight') this.next();
            if (e.key === 'ArrowLeft') this.prev();
            if (e.key === 'Escape') this.close();
        };
        window.addEventListener('keydown', this.keyHandler);
    }

    disconnectedCallback() {
        store.removeEventListener('state-change', this.handleStateChange);
        window.removeEventListener('keydown', this.keyHandler);
    }

    close() {
        localStorage.setItem('arbor-welcome-seen', 'true');
        store.setModal(null);
    }

    next() {
        const steps = store.ui.welcomeSteps || [];
        if (this.activeStep < steps.length - 1) {
            this.activeStep++;
            this.lastRenderKey = null; // Force re-render
            this.render();
        } else {
            this.close();
        }
    }

    prev() {
        if (this.activeStep > 0) {
            this.activeStep--;
            this.lastRenderKey = null; // Force re-render
            this.render();
        }
    }

    goTo(index) {
        this.activeStep = index;
        this.lastRenderKey = null; // Force re-render
        this.render();
    }

    render() {
        const ui = store.ui;
        const steps = ui.welcomeSteps || [];
        const lang = store.value.lang;
        const theme = store.value.theme;
        
        // Key for preventing flickering
        const renderKey = `${lang}-${theme}-${this.activeStep}`;
        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;
        
        // Safety check if steps haven't loaded or language switch causes index out of bounds
        if (this.activeStep >= steps.length) this.activeStep = 0;
        
        const current = steps[this.activeStep] || {};
        const total = steps.length;
        const isLast = this.activeStep === total - 1;

        // Render Index Items (Desktop Sidebar)
        const sidebarItems = steps.map((step, idx) => {
            const isActive = idx === this.activeStep;
            const isCompleted = idx < this.activeStep;
            
            return `
            <button class="w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3 group
                ${isActive 
                    ? 'bg-white shadow-sm border border-slate-200 dark:bg-slate-800 dark:border-slate-700' 
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400'}"
                onclick="document.querySelector('arbor-modal-welcome').goTo(${idx})">
                
                <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                    ${isActive 
                        ? 'bg-blue-600 text-white' 
                        : (isCompleted ? 'bg-green-100 text-green-600 dark:bg-green-900/30' : 'bg-slate-200 text-slate-500 dark:bg-slate-700')}"
                >
                    ${isCompleted ? '✓' : idx + 1}
                </div>
                
                <span class="font-bold text-sm truncate ${isActive ? 'text-slate-800 dark:text-white' : ''}">
                    ${step.title}
                </span>
            </button>
            `;
        }).join('');

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in">
            
            <!-- Main Card: Uses specific desktop sizing classes fixed via CSS override -->
            <div class="bg-slate-50 dark:bg-slate-900 rounded-[24px] shadow-2xl w-full h-auto max-h-[90vh] relative overflow-hidden flex flex-col md:flex-row border border-slate-200 dark:border-slate-800 transition-all duration-300">
                
                <!-- Close Button -->
                <button class="btn-close absolute top-4 right-4 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-white/50 dark:bg-slate-800/50 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors backdrop-blur-sm" title="${ui.close}">✕</button>

                <!-- LEFT SIDEBAR (Index) - Hidden on Mobile -->
                <div class="hidden md:flex w-1/3 bg-slate-50/50 dark:bg-slate-950/50 border-r border-slate-200 dark:border-slate-800 flex-col p-6">
                    <div class="mb-6 pl-2">
                        <h2 class="font-black text-xl text-slate-800 dark:text-white tracking-tight uppercase">${ui.tutorialTitle}</h2>
                        <p class="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Table of Contents</p>
                    </div>
                    
                    <div class="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-2">
                        ${sidebarItems}
                    </div>

                    <div class="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
                        <p class="text-[10px] text-slate-400">Powered by Treesys</p>
                    </div>
                </div>

                <!-- RIGHT CONTENT (Page) -->
                <div class="flex-1 flex flex-col relative bg-white dark:bg-slate-900 h-full">
                    
                    <!-- Mobile Progress Bar -->
                    <div class="md:hidden flex gap-1 p-4 pb-0">
                        ${steps.map((_, i) => `
                            <div class="h-1 flex-1 rounded-full ${i === this.activeStep ? 'bg-blue-600' : (i < this.activeStep ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-800')}"></div>
                        `).join('')}
                    </div>

                    <!-- Page Content Area -->
                    <div class="flex-1 p-8 md:p-12 flex flex-col justify-center items-center text-center overflow-y-auto custom-scrollbar animate-in slide-in-from-right-4 fade-in duration-300" key="${this.activeStep}">
                        
                        <div class="w-24 h-24 md:w-32 md:h-32 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-6xl md:text-7xl mb-8 shadow-sm border border-slate-100 dark:border-slate-700 animate-in zoom-in duration-500">
                            ${current.icon}
                        </div>

                        <h1 class="text-2xl md:text-3xl font-black text-slate-800 dark:text-white mb-4 max-w-lg leading-tight">
                            ${current.title}
                        </h1>

                        <div class="prose prose-slate dark:prose-invert prose-p:text-slate-600 dark:prose-p:text-slate-300 prose-lg max-w-md">
                            <p>${current.text}</p>
                        </div>
                        
                        ${this.activeStep === 0 ? `
                            <div class="mt-8 text-center animate-in fade-in delay-300 duration-500">
                                <div class="flex justify-center gap-3">
                                    ${store.availableLanguages.map(l => `
                                        <button class="btn-lang-sel p-3 border-2 rounded-xl font-bold transition-all flex flex-col items-center gap-2 w-24
                                            ${store.value.lang === l.code 
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'}" 
                                            data-code="${l.code}">
                                            <span class="text-3xl">${l.flag}</span>
                                            <span class="text-xs ${store.value.lang === l.code ? 'text-blue-600 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}">${l.nativeName}</span>
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        ${current.isAiPitch ? `
                            <div class="mt-6 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800/50 flex items-center gap-3">
                                <span class="text-xl">🦉</span>
                                <div class="text-left">
                                    <p class="text-xs font-bold text-purple-700 dark:text-purple-300">${ui.aiPitchAction}</p>
                                    <p class="text-[10px] text-purple-600/70 dark:text-purple-400/70">${ui.aiPitchSub}</p>
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Footer Controls -->
                    <div class="p-6 md:p-8 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10 shrink-0">
                        
                        <!-- Previous / Skip -->
                        <div>
                            ${this.activeStep === 0 
                                ? `<button class="btn-close text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-4 py-2 transition-colors">${ui.tutorialSkip}</button>`
                                : `<button id="btn-prev" class="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                     <span>←</span> ${ui.tutorialPrev}
                                   </button>`
                            }
                        </div>

                        <!-- Page Indicator (Desktop Only) -->
                        <div class="hidden md:block text-xs font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest">
                            Page ${this.activeStep + 1} / ${total}
                        </div>

                        <!-- Next / Finish -->
                        <button id="btn-next" class="flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95 group
                            ${isLast 
                                ? 'bg-green-600 hover:bg-green-500 text-white' 
                                : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'}">
                            <span>${isLast ? ui.tutorialFinish : ui.tutorialNext}</span>
                            ${!isLast ? '<span class="group-hover:translate-x-1 transition-transform">→</span>' : ''}
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-close').forEach(b => b.onclick = () => this.close());
        
        const btnNext = this.querySelector('#btn-next');
        if (btnNext) btnNext.onclick = () => this.next();

        const btnPrev = this.querySelector('#btn-prev');
        if (btnPrev) btnPrev.onclick = () => this.prev();

        this.querySelectorAll('.btn-lang-sel').forEach(b => {
             b.onclick = (e) => {
                const code = e.currentTarget.dataset.code;
                if (store.value.lang !== code) {
                    store.setLanguage(code);
                }
             };
        });
    }
}
customElements.define('arbor-modal-welcome', ArborModalWelcome);
