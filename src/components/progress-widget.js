

import { store } from '../store.js';

class ArborProgressWidget extends HTMLElement {
    constructor() {
        super();
        this.isOpen = false;
    }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
        store.addEventListener('graph-update', () => this.render());
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.contains(e.target)) {
                this.isOpen = false;
                this.render();
            }
        });
    }

    toggle() {
        this.isOpen = !this.isOpen;
        this.render();
    }

    getStats() {
        const modules = store.getModulesStatus();
        const totalLeaves = modules.reduce((acc, m) => acc + m.totalLeaves, 0);
        const completedLeaves = modules.reduce((acc, m) => acc + m.completedLeaves, 0);
        const completedModules = modules.filter(m => m.isComplete).length;
        
        const percentage = totalLeaves === 0 ? 0 : Math.round((completedLeaves / totalLeaves) * 100);
        
        return {
            completedLeaves,
            completedModules,
            percentage,
            totalLeaves
        };
    }

    render() {
        const stats = this.getStats();
        const ui = store.ui;
        const g = store.value.gamification;
        const dailyProgress = Math.min(100, Math.round((g.dailyXP / store.dailyXpGoal) * 100));
        
        // Seeds logic
        const collectedItems = g.seeds || g.fruits || [];
        const itemCount = collectedItems.length;
        
        // SVG Math for Circle
        const radius = 45;
        const circumference = 2 * Math.PI * radius; // ~282.74
        const offset = circumference * (1 - stats.percentage / 100);

        this.innerHTML = `
        <div class="fixed top-4 right-4 z-30 flex-col items-end hidden md:flex">
            
            <!-- Trigger Button: Seed Bag -->
            <button id="btn-toggle" class="flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full shadow-sm hover:border-orange-400 dark:hover:border-orange-600 transition-colors">
                <span class="text-2xl">🎒</span>
                <span class="font-bold text-slate-600 dark:text-slate-300 text-sm">${itemCount}</span>
            </button>

            <!-- Dropdown -->
            ${this.isOpen ? `
            <div class="mt-2 w-80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-6 flex flex-col items-center animate-in fade-in slide-in-from-top-2 duration-200">
                
                <!-- Streak & Sun Row -->
                <div class="w-full flex gap-4 mb-6">
                    <!-- Streak -->
                    <div class="flex-1 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 flex flex-col items-center justify-center border border-blue-100 dark:border-blue-800/30">
                        <span class="text-2xl mb-1">💧</span>
                        <span class="text-lg font-black text-blue-600 dark:text-blue-400 leading-none">${g.streak}</span>
                        <span class="text-[10px] font-bold text-blue-400 dark:text-blue-500 uppercase mt-1">${ui.streak}</span>
                    </div>
                    
                    <!-- Photosynthesis (XP) -->
                    <div class="flex-1 bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 flex flex-col items-center justify-center border border-orange-100 dark:border-orange-800/30 relative overflow-hidden">
                        <div class="absolute bottom-0 left-0 right-0 bg-orange-200 dark:bg-orange-700/30 transition-all duration-500" style="height: ${dailyProgress}%"></div>
                        <span class="text-2xl mb-1 relative z-10">☀️</span>
                        <span class="text-lg font-black text-orange-600 dark:text-orange-400 leading-none relative z-10">${g.dailyXP}</span>
                        <span class="text-[10px] font-bold text-orange-400 dark:text-orange-500 uppercase mt-1 relative z-10">${ui.todayGoal}</span>
                    </div>
                </div>

                <div class="h-px w-full bg-slate-200 dark:bg-slate-700 mb-6"></div>

                <!-- Main Progress Circle -->
                <h3 class="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">${ui.progressTitle}</h3>
                
                <div class="relative w-32 h-32 mb-6">
                    <svg class="w-full h-full" viewBox="0 0 100 100">
                        <circle class="text-slate-200 dark:text-slate-700" stroke-width="10" stroke="currentColor" fill="transparent" r="45" cx="50" cy="50" />
                        <circle
                        class="text-green-500 transition-all duration-1000 ease-out"
                        stroke-width="10"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${offset}"
                        stroke-linecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r="45"
                        cx="50"
                        cy="50"
                        style="transform: rotate(-90deg); transform-origin: 50% 50%;"
                        />
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-3xl font-black text-slate-800 dark:text-white">${stats.percentage}%</span>
                    </div>
                </div>

                <div class="w-full grid grid-cols-2 gap-4 text-center mb-6">
                    <div>
                        <p class="text-xl font-bold text-sky-600 dark:text-sky-400">${stats.completedLeaves}</p>
                        <p class="text-[10px] uppercase font-bold text-slate-400">${ui.progressLessons}</p>
                    </div>
                    <div>
                        <p class="text-xl font-bold text-purple-600 dark:text-purple-400">${stats.completedModules}</p>
                        <p class="text-[10px] uppercase font-bold text-slate-400">${ui.progressModules}</p>
                    </div>
                </div>

                <button id="btn-view-certs" class="w-full py-3 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0V5.625a2.25 2.25 0 00-2.25-2.25h-1.5a2.25 2.25 0 00-2.25-2.25v7.875" /></svg>
                    ${ui.progressViewCerts}
                </button>
            </div>
            ` : ''}
        </div>
        `;

        this.querySelector('#btn-toggle').onclick = (e) => {
            e.stopPropagation();
            this.toggle();
        };

        if(this.isOpen) {
            const btnCerts = this.querySelector('#btn-view-certs');
            if(btnCerts) {
                btnCerts.onclick = () => {
                    store.setViewMode('certificates');
                    this.isOpen = false;
                    this.render();
                };
            }
        }
    }
}

customElements.define('arbor-progress-widget', ArborProgressWidget);
