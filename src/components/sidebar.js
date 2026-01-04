
import { store } from '../store.js';
import { googleDrive } from '../services/google-drive.js';

class ArborSidebar extends HTMLElement {
    constructor() { super(); }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
        // Listen to drive changes
        googleDrive.subscribe(() => this.render());
    }

    render() {
        const ui = store.ui;
        const user = googleDrive.userProfile;
        const isSyncing = googleDrive.isSyncing;
        const isLoggedIn = !!user;

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
        </style>
        <aside class="hidden md:flex flex-col w-[80px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30 h-full items-center py-6 shadow-xl justify-between">
            <!-- TOP SECTION -->
            <div class="flex flex-col items-center gap-6 w-full">
                <div class="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-green-400 to-green-600 text-white rounded-xl text-2xl mb-4 shadow-lg shadow-green-500/30">🌳</div>
                
                <div class="relative group"><button id="btn-search" class="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-sky-500 hover:text-white transition-colors"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg></button><span class="tooltip">${ui.navSearch}</span></div>
                
                <div class="relative group">
                    <button id="btn-certs" class="w-10 h-10 rounded-xl flex items-center justify-center transition-colors
                        ${store.value.viewMode === 'certificates' ? 'bg-yellow-500 text-white' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500 hover:text-white'}">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0V5.625a2.25 2.25 0 00-2.25-2.25h-1.5a2.25 2.25 0 00-2.25-2.25v7.875" /></svg>
                    </button>
                    <span class="tooltip">${ui.navCertificates}</span>
                </div>

                <div class="relative group"><button id="btn-sources" class="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-600 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h6M9 11.25h6M9 15.75h6" /></svg></button><span class="tooltip">${ui.navSources}</span></div>
            </div>

            <!-- BOTTOM SECTION -->
            <div class="flex flex-col gap-3 items-center w-full">
                <div class="relative group"><button id="btn-about" class="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 15" /></svg></button><span class="tooltip">${ui.navAbout}</span></div>
                <div class="w-8 h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                
                <div class="relative group"><button id="btn-lang" class="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xl flex items-center justify-center">${store.currentLangInfo.flag}</button><span class="tooltip">${ui.languageTitle}</span></div>
                <div class="relative group"><button id="btn-theme" class="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xl flex items-center justify-center">${store.value.theme === 'light' ? '🌙' : '☀️'}</button><span class="tooltip">Toggle Theme</span></div>
                
                <!-- User Profile / Login -->
                <div class="relative group">
                     ${isLoggedIn ? `
                        <button class="w-10 h-10 rounded-full border-2 border-slate-200 dark:border-slate-700 p-0.5 overflow-hidden relative">
                            <img src="${user.picture}" alt="${user.name}" class="w-full h-full rounded-full">
                            ${isSyncing ? `<div class="absolute inset-0 bg-black/50 flex items-center justify-center"><div class="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin"></div></div>` : ''}
                        </button>
                        <div class="absolute bottom-12 left-1/2 -translate-x-1/2 mb-2 w-52 bg-white dark:bg-slate-800 rounded-lg shadow-xl border dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto z-50">
                            <div class="p-3 border-b dark:border-slate-700"><p class="text-sm font-bold truncate text-slate-800 dark:text-white">${user.name}</p><p class="text-xs text-slate-500 truncate">${user.email}</p></div>
                            <div class="p-2"><button id="btn-sign-out" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300">${ui.signOut}</button></div>
                        </div>
                     ` : `
                        <button id="btn-sign-in" title="${ui.syncButton}" class="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-sky-500 transition-colors">
                            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632" /></svg>
                        </button>
                     `}
                </div>
                
                <div class="relative group"><button id="btn-help" class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-500">?</button><span class="tooltip">${ui.navHelp}</span></div>
                
                <div id="btn-impressum" class="text-[9px] text-slate-400 font-bold opacity-60 hover:opacity-100 transition-opacity cursor-pointer mt-2 text-center">
                    ${ui.createdBy}<br><span class="text-sky-500">Treesys</span>
                </div>
            </div>
        </aside>
        `;
        
        // Bind events
        this.querySelector('#btn-theme').onclick = () => store.toggleTheme();
        this.querySelector('#btn-search').onclick = () => store.setModal('search');
        this.querySelector('#btn-certs').onclick = () => store.setViewMode('certificates');
        this.querySelector('#btn-sources').onclick = () => store.setModal('sources');
        this.querySelector('#btn-about').onclick = () => store.setModal('about');
        this.querySelector('#btn-lang').onclick = () => store.setModal('language');
        this.querySelector('#btn-help').onclick = () => store.setModal('tutorial');
        this.querySelector('#btn-impressum').onclick = () => store.setModal('impressum');
        
        const btnSignIn = this.querySelector('#btn-sign-in');
        if (btnSignIn) btnSignIn.onclick = () => googleDrive.signIn();

        const btnSignOut = this.querySelector('#btn-sign-out');
        if (btnSignOut) btnSignOut.onclick = () => googleDrive.signOut();
    }
}
customElements.define('arbor-sidebar', ArborSidebar);
