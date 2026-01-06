

import { store } from '../store.js';

class ArborSidebar extends HTMLElement {
    constructor() { 
        super();
        this.isMobileMenuOpen = false;
    }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
    }

    toggleMobileMenu() {
        this.isMobileMenuOpen = !this.isMobileMenuOpen;
        this.render();
    }

    render() {
        const ui = store.ui;
        const g = store.value.gamification;

        let mobileMenuHtml = '';
        if (this.isMobileMenuOpen) {
            mobileMenuHtml = `
            <div id="mobile-menu-backdrop" class="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80]"></div>
            <div id="mobile-menu" class="md:hidden fixed top-16 right-4 w-[280px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-[90] p-2 animate-in fade-in slide-in-from-top-4 duration-200">
                <!-- User Profile -->
                <div class="p-2 border-b border-slate-100 dark:border-slate-700 mb-2">
                    <button class="js-btn-profile w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left">
                        <div class="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xl">👤</div>
                        <div>
                            <p class="text-sm font-bold text-slate-800 dark:text-white">${ui.navProfile}</p>
                            <p class="text-xs text-slate-500">${g.streak} ${ui.days} Streak 🔥</p>
                        </div>
                    </button>
                </div>

                <!-- Menu Items -->
                <nav class="flex flex-col">
                    <button class="js-btn-sage menu-item text-purple-600 dark:text-purple-400"><span>🦉</span> <span>Configurar IA</span></button>
                    <button class="js-btn-lang menu-item"><span>${store.currentLangInfo.flag}</span> <span>${ui.languageTitle}</span></button>
                    <button class="js-btn-theme menu-item"><span>${store.value.theme === 'light' ? '🌙' : '☀️'}</span> <span>Toggle Theme</span></button>
                    <button class="js-btn-help menu-item"><span>?</span> <span>${ui.navHelp}</span></button>
                    <div class="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2"></div>
                    <button class="js-btn-contrib menu-item"><span>🐙</span> <span>${ui.navContributor}</span></button>
                    <button class="js-btn-about menu-item"><span>ℹ️</span> <span>${ui.navAbout}</span></button>
                    <button class="js-btn-impressum menu-item"><span>©</span> <span>${ui.impressumTitle}</span></button>
                </nav>
            </div>
            `;
        }

        this.innerHTML = `
        <style>
            .tooltip {
                position: absolute; left: 80px; top: 50%; transform: translateY(-50%);
                background-color: #1e293b; color: white; font-size: 12px; font-weight: bold;
                padding: 4px 8px; border-radius: 4px;
                opacity: 0; transition: all 0.2s; pointer-events: none;
                white-space: nowrap; z-index: 100;
                transform: translateY(-50%) translateX(-10px);
            }
            .group:hover .tooltip { opacity: 1; transform: translateY(-50%) translateX(0); }
            .menu-item {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                width: 100%;
                text-align: left;
                padding: 0.75rem;
                border-radius: 0.5rem;
                font-size: 0.875rem;
                font-weight: 600;
                color: #475569;
                transition: background-color 0.2s, color 0.2s;
            }
            .dark .menu-item { color: #cbd5e1; }
            .menu-item:hover { background-color: #f1f5f9; }
            .dark .menu-item:hover { background-color: #334155; }
            .menu-item > span:first-child {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 1.25rem;
                font-weight: bold;
            }
        </style>

        <!-- MOBILE HEADER -->
        <header class="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-50 flex items-center justify-between px-4 shadow-sm transition-transform duration-300">
             <button class="js-btn-home flex items-center gap-2">
                 <span class="text-2xl">🌳</span>
                 <span class="font-black text-slate-800 dark:text-white tracking-tight">ARBOR</span>
             </button>
             
             <div class="flex items-center gap-2">
                <!-- Streak Mobile -->
                <div class="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <span class="text-sm">💧</span>
                    <span class="text-xs font-bold text-blue-600 dark:text-blue-400">${g.streak}</span>
                </div>

                <!-- Sage Config Mobile -->
                <button class="js-btn-sage w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 active:scale-95 transition-transform">🦉</button>
                
                <button class="js-btn-search w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 active:scale-95 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                </button>
                
                <button class="js-btn-menu-mobile w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 active:scale-95 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" /></svg>
                </button>
             </div>
        </header>

        <!-- DESKTOP SIDEBAR -->
        <aside class="hidden md:flex flex-col w-[80px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30 h-full items-center py-6 shadow-xl justify-between">
            <!-- TOP SECTION -->
            <div class="flex flex-col items-center gap-4 w-full">
                <div class="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-green-400 to-green-600 text-white rounded-xl text-2xl mb-2 shadow-lg shadow-green-500/30 cursor-pointer js-btn-home">🌳</div>
                
                <div class="w-8 h-px bg-slate-200 dark:bg-slate-700 my-1"></div>

                <div class="relative group"><button class="js-btn-search w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-sky-500 hover:text-white transition-colors"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg></button><span class="tooltip">${ui.navSearch}</span></div>
                
                <div class="relative group">
                    <button class="js-btn-certs w-10 h-10 rounded-xl flex items-center justify-center transition-colors
                        ${store.value.viewMode === 'certificates' ? 'bg-yellow-500 text-white' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500 hover:text-white'}">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0V5.625a2.25 2.25 0 00-2.25-2.25h-1.5a2.25 2.25 0 00-2.25-2.25v7.875" /></svg>
                    </button>
                    <span class="tooltip">${ui.navCertificates}</span>
                </div>

                <div class="relative group"><button class="js-btn-sources w-10 h-10 rounded-xl flex items-center justify-center bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-600 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18M13.5-18v18M9 6.75h6M9 11.25h6M9 15.75h6" /></svg></button><span class="tooltip">${ui.navSources}</span></div>
                
                <!-- THE SAGE CONFIG BUTTON (NOW SPECIFICALLY FOR SETTINGS) -->
                <div class="relative group">
                     <button class="js-btn-sage w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-purple-500 hover:text-white transition-all">🦉</button>
                     <span class="tooltip">Configurar IA</span>
                </div>
            </div>

            <!-- BOTTOM SECTION -->
            <div class="flex flex-col gap-3 items-center w-full">
                <div class="relative group"><button class="js-btn-contrib w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white">🐙</button><span class="tooltip">${ui.navContributor}</span></div>
                <div class="relative group"><button class="js-btn-about w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 15" /></svg></button><span class="tooltip">${ui.navAbout}</span></div>
                <div class="w-8 h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                
                <div class="relative group"><button class="js-btn-lang w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xl flex items-center justify-center">${store.currentLangInfo.flag}</button><span class="tooltip">${ui.languageTitle}</span></div>
                <div class="relative group"><button class="js-btn-theme w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xl flex items-center justify-center">${store.value.theme === 'light' ? '🌙' : '☀️'}</button><span class="tooltip">Toggle Theme</span></div>
                
                <!-- User Profile / Login / Sync -->
                <div class="relative group">
                    <button class="js-btn-profile w-10 h-10 rounded-full border-2 border-slate-200 dark:border-slate-700 p-0.5 overflow-hidden relative transition-transform hover:scale-105 active:scale-95">
                         <div class="w-full h-full rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">👤</div>
                    </button>
                    <span class="tooltip">${ui.navProfile}</span>
                </div>
                
                <div class="js-btn-impressum text-[9px] text-slate-400 font-bold opacity-60 hover:opacity-100 transition-opacity cursor-pointer mt-2 text-center">
                    ${ui.createdBy}<br><span class="text-sky-500">Treesys</span>
                </div>
            </div>
        </aside>
        ${mobileMenuHtml}
        `;
        
        const mobileMenuAction = (fn) => {
            return (e) => {
                if (this.isMobileMenuOpen) {
                    this.isMobileMenuOpen = false;
                }
                fn(e);
            };
        };
        
        this.querySelectorAll('.js-btn-theme').forEach(b => b.onclick = mobileMenuAction(() => store.toggleTheme()));
        this.querySelectorAll('.js-btn-search').forEach(b => b.onclick = mobileMenuAction(() => store.setModal('search')));
        this.querySelectorAll('.js-btn-certs').forEach(b => b.onclick = mobileMenuAction(() => store.setViewMode('certificates')));
        this.querySelectorAll('.js-btn-sources').forEach(b => b.onclick = mobileMenuAction(() => store.setModal('sources')));
        this.querySelectorAll('.js-btn-about').forEach(b => b.onclick = mobileMenuAction(() => store.setModal('about')));
        this.querySelectorAll('.js-btn-lang').forEach(b => b.onclick = mobileMenuAction(() => store.setModal('language')));
        this.querySelectorAll('.js-btn-help').forEach(b => b.onclick = mobileMenuAction(() => store.setModal('tutorial')));
        this.querySelectorAll('.js-btn-impressum').forEach(b => b.onclick = mobileMenuAction(() => store.setModal('impressum')));
        this.querySelectorAll('.js-btn-contrib').forEach(b => b.onclick = mobileMenuAction(() => store.setModal('contributor')));
        this.querySelectorAll('.js-btn-profile').forEach(b => b.onclick = mobileMenuAction(() => store.setModal('profile')));
        
        // SAGE AI Button Linked -> Opens Settings Mode
        this.querySelectorAll('.js-btn-sage').forEach(b => b.onclick = mobileMenuAction(() => {
            store.setModal({ type: 'sage', mode: 'settings' });
        }));

        const homeBtn = this.querySelector('.js-btn-home');
        if (homeBtn) homeBtn.onclick = () => store.goHome();
        
        const mobileMenuToggle = this.querySelector('.js-btn-menu-mobile');
        if (mobileMenuToggle) {
            mobileMenuToggle.onclick = (e) => {
                e.stopPropagation();
                this.toggleMobileMenu();
            };
        }
        if (this.isMobileMenuOpen) {
            const backdrop = this.querySelector('#mobile-menu-backdrop');
            if(backdrop) backdrop.onclick = () => this.toggleMobileMenu();
        }
    }
}
customElements.define('arbor-sidebar', ArborSidebar);