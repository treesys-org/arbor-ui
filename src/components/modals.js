

import { store } from '../store.js';
import { github } from '../services/github.js';

class ArborModals extends HTMLElement {
    constructor() {
        super();
        this.tutorialStep = 0;
        this.certSearch = '';
        this.certShowAll = false;
        this.searchQuery = '';
        this.searchResults = [];
        this.pendingSourceUrl = null;
        this.showSecurityWarning = false;
        this.showImpressumDetails = false;
    }

    connectedCallback() {
        store.addEventListener('state-change', () => this.render());
    }

    close() { store.setModal(null); }
    
    render() {
        // 1. Preview Modal
        if (store.value.previewNode) {
            this.renderPreview(store.value.previewNode);
            return;
        }

        // 2. Fullscreen Certificates View (but not if a single cert is being viewed)
        if (store.value.viewMode === 'certificates' && store.value.modal?.type !== 'certificate') {
            this.renderCertificatesGallery();
            return;
        }

        // 3. Modals
        const modal = store.value.modal;
        if (!modal) {
            this.innerHTML = '';
            this.showImpressumDetails = false;
            return;
        }

        const type = typeof modal === 'string' ? modal : modal.type;
        const ui = store.ui;
        
        // Editor is handled by arbor-editor component
        if (type === 'editor') return;

        if (type === 'search') {
            this.renderSearch(ui);
            return;
        }

        // Common Modal Wrapper
        let content = '';
        if (type === 'tutorial') content = this.renderTutorial(ui);
        else if (type === 'sources') content = this.renderSources(ui);
        else if (type === 'about') content = this.renderAbout(ui);
        else if (type === 'language') content = this.renderLanguage(ui);
        else if (type === 'impressum') content = this.renderImpressum(ui);
        else if (type === 'contributor') content = this.renderContributor(ui);
        else if (type === 'certificate') {
            this.renderSingleCertificate(ui, modal.moduleId); 
            return; 
        }

        // FIX: Increased Z-Index to z-[70] to cover everything including content panel
        this.innerHTML = `
        <div class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[90vh]">
                <button class="btn-close absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-20">✕</button>
                ${content}
            </div>
        </div>`;

        // Bind events
        const closeBtn = this.querySelector('.btn-close');
        if(closeBtn) closeBtn.onclick = () => this.close();
        
        if (type === 'tutorial') this.bindTutorialEvents();
        if (type === 'sources') this.bindSourcesEvents();
        if (type === 'contributor') this.bindContributorEvents();
        if (type === 'impressum') {
            const btnImp = this.querySelector('#btn-show-impressum');
            if(btnImp) btnImp.onclick = () => {
                this.showImpressumDetails = true;
                this.render();
            };
        }
        if (type === 'language') {
            this.querySelectorAll('.btn-lang-sel').forEach(b => b.onclick = (e) => {
                store.setLanguage(e.currentTarget.dataset.code);
                this.close();
            });
        }
    }

    // --- SEARCH MODAL ---
    renderSearch(ui) {
         // FIX: Z-Index z-[70]
         this.innerHTML = `
         <div class="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] bg-slate-900/60 backdrop-blur-sm p-4 animate-in" id="search-overlay">
            <div class="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[60vh]">
                <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <svg class="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                    <input id="inp-search" type="text" placeholder="${ui.searchPlaceholder}" class="w-full bg-transparent text-xl font-bold text-slate-700 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600" autocomplete="off" value="${this.searchQuery}">
                    <button class="btn-close px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs font-bold text-slate-500">ESC</button>
                </div>
                <div class="overflow-y-auto p-2" id="search-results">
                    ${this.searchResults.length === 0 && this.searchQuery.length > 0 ? `<div class="p-8 text-center text-slate-400"><p>${ui.noResults}</p></div>` : ''}
                    ${this.searchResults.map(res => `
                        <button class="btn-res w-full text-left p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group flex items-center justify-between border-b border-slate-50 dark:border-slate-800/50 last:border-0" data-id="${res.id}">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 flex items-center justify-center text-xl">${res.icon || '📄'}</div>
                                <div><h3 class="font-bold text-slate-700 dark:text-slate-200">${res.name}</h3><p class="text-xs text-slate-400 line-clamp-1">${res.description || ''}</p></div>
                            </div>
                        </button>
                    `).join('')}
                </div>
            </div>
         </div>`;

         const overlay = this.querySelector('#search-overlay');
         overlay.onclick = (e) => { if(e.target === overlay) this.close(); };
         
         const inp = this.querySelector('#inp-search');
         inp.focus();
         inp.oninput = (e) => {
             this.searchQuery = e.target.value;
             this.searchResults = store.search(this.searchQuery);
             this.render();
             this.querySelector('#inp-search').focus();
             const el = this.querySelector('#inp-search');
             el.setSelectionRange(el.value.length, el.value.length);
         };

         this.querySelectorAll('.btn-res').forEach(b => b.onclick = (e) => {
             store.navigateTo(e.currentTarget.dataset.id);
             this.close();
         });
         this.querySelector('.btn-close').onclick = () => this.close();
    }

    // --- PREVIEW ---
    renderPreview(node) {
        const ui = store.ui;
        const isDone = store.isCompleted(node.id);
        
        // FIX: Z-Index z-[70]
        this.innerHTML = `
        <div id="preview-overlay" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative text-center">
                 <div class="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-white dark:bg-slate-800 rounded-2xl shadow-xl flex items-center justify-center text-4xl border-4 border-slate-50 dark:border-slate-700">
                    ${node.icon || '📄'}
                 </div>
                 <div class="mt-10">
                    <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-2 leading-tight">${node.name}</h2>
                    <p class="text-slate-500 dark:text-slate-400 font-medium mb-6 text-sm">${node.description || ui.noDescription}</p>
                    <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 mb-6">
                        <div class="flex justify-between text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">
                            <span>${ui.status}</span><span>${isDone ? '100%' : '0%'}</span>
                        </div>
                        <div class="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div class="h-full bg-green-500" style="width: ${isDone ? '100%' : '0%'}"></div>
                        </div>
                    </div>
                    <div class="flex gap-3">
                         <button id="btn-prev-cancel" class="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold rounded-xl">${ui.cancel}</button>
                         <button id="btn-prev-enter" class="flex-1 py-3 bg-sky-500 text-white font-bold rounded-xl shadow-lg">${ui.enter}</button>
                    </div>
                 </div>
            </div>
        </div>`;

        this.querySelector('#preview-overlay').onclick = (e) => {
            if(e.target.id === 'preview-overlay') store.closePreview();
        };
        this.querySelector('#btn-prev-cancel').onclick = () => store.closePreview();
        this.querySelector('#btn-prev-enter').onclick = () => store.enterLesson();
    }

    // --- TUTORIAL ---
    renderTutorial(ui) {
        const step = ui.tutorialSteps[this.tutorialStep];
        return `
        <div class="flex flex-col h-full">
            <div class="flex-1 p-10 flex flex-col items-center justify-center text-center">
                 <div class="flex gap-2 mb-8">
                    ${ui.tutorialSteps.map((_, i) => `<div class="h-1.5 rounded-full transition-all ${i === this.tutorialStep ? 'w-8 bg-sky-500' : 'w-2 bg-slate-200 dark:bg-slate-700'}"></div>`).join('')}
                 </div>
                 <div class="text-6xl mb-8">${step.icon}</div>
                 <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-4">${step.title}</h2>
                 <p class="text-slate-500 dark:text-slate-400 leading-relaxed">${step.text}</p>
            </div>
            <div class="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50">
                 <button class="btn-close text-xs font-bold text-slate-400 uppercase tracking-wider">${ui.tutorialSkip}</button>
                 <div class="flex gap-3">
                    ${this.tutorialStep > 0 ? `<button id="btn-tut-prev" class="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500">←</button>` : ''}
                    ${this.tutorialStep < ui.tutorialSteps.length - 1 
                        ? `<button id="btn-tut-next" class="px-6 h-10 bg-sky-500 text-white font-bold rounded-xl shadow-lg">${ui.tutorialNext} →</button>` 
                        : `<button id="btn-tut-finish" class="px-6 h-10 bg-green-500 text-white font-bold rounded-xl shadow-lg animate-pulse">${ui.tutorialFinish}</button>`}
                 </div>
            </div>
        </div>`;
    }
    
    bindTutorialEvents() {
        const btnNext = this.querySelector('#btn-tut-next');
        if(btnNext) btnNext.onclick = () => { this.tutorialStep++; this.render(); };
        const btnPrev = this.querySelector('#btn-tut-prev');
        if(btnPrev) btnPrev.onclick = () => { this.tutorialStep--; this.render(); };
        const btnFin = this.querySelector('#btn-tut-finish');
        if(btnFin) btnFin.onclick = () => this.close();
    }

    // --- CONTRIBUTOR ---
    renderContributor(ui) {
        const user = store.value.githubUser;
        const magicLink = 'https://github.com/settings/tokens/new?description=Arbor%20Studio%20Access&scopes=repo,workflow';

        return `
        <div class="p-8">
            <div class="w-16 h-16 bg-slate-800 text-white rounded-full flex items-center justify-center text-3xl mb-6 shadow-lg shadow-slate-500/30">🐙</div>
            <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-2">${ui.contribTitle}</h2>
            <p class="text-slate-500 dark:text-slate-400 mb-6 text-sm leading-relaxed">${ui.contribDesc}</p>

            ${!user ? `
            <div class="space-y-4">
                <!-- Magic Link -->
                <a href="${magicLink}" target="_blank" class="w-full py-3 px-4 border-2 border-dashed border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors">
                    <span>✨</span>
                    <span>Registro Inicial (Generar Token)</span>
                </a>

                <div class="relative py-2">
                    <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200 dark:border-slate-700"></div></div>
                    <div class="relative flex justify-center text-xs uppercase"><span class="bg-white dark:bg-slate-900 px-2 text-slate-400">O ingresa tu token existente</span></div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">${ui.contribToken}</label>
                    <input id="inp-gh-token" type="password" placeholder="${ui.contribTokenPlaceholder}" class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-slate-500">
                </div>
                
                <label class="flex items-center gap-3 p-2 cursor-pointer group">
                    <div class="relative flex items-center">
                        <input type="checkbox" id="chk-remember-me" class="peer sr-only" checked>
                        <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </div>
                    <span class="text-sm text-slate-600 dark:text-slate-400 font-medium group-hover:text-slate-900 dark:group-hover:text-slate-200">Recordarme (Guardar sesión)</span>
                </label>

                <button id="btn-gh-connect" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95">${ui.contribConnect}</button>
            </div>
            ` : `
            <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 rounded-xl flex items-center gap-4 mb-6">
                <img src="${user.avatar_url}" class="w-12 h-12 rounded-full border-2 border-white dark:border-slate-900">
                <div class="flex-1 min-w-0">
                    <p class="font-black text-slate-800 dark:text-white truncate">${user.name || user.login}</p>
                    <p class="text-xs text-green-600 dark:text-green-400 font-bold">Connected via GitHub</p>
                </div>
            </div>
            <button id="btn-gh-disconnect" class="w-full py-3 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold rounded-xl transition-colors">${ui.contribDisconnect}</button>
            `}
        </div>`;
    }

    bindContributorEvents() {
        const btnConnect = this.querySelector('#btn-gh-connect');
        if (btnConnect) {
            btnConnect.onclick = async () => {
                const token = this.querySelector('#inp-gh-token').value.trim();
                const rememberMe = this.querySelector('#chk-remember-me').checked;
                
                if (!token) return;
                
                btnConnect.disabled = true;
                btnConnect.textContent = "...";
                
                const user = await github.initialize(token);
                if (user) {
                    store.update({ githubUser: user });
                    
                    if (rememberMe) {
                        localStorage.setItem('arbor-gh-token', token);
                        sessionStorage.removeItem('arbor-gh-token'); // Clear opposing storage
                    } else {
                        sessionStorage.setItem('arbor-gh-token', token);
                        localStorage.removeItem('arbor-gh-token'); // Clear opposing storage
                    }
                    
                    this.render();
                } else {
                    alert('Authentication failed. Check your token.');
                    btnConnect.disabled = false;
                    btnConnect.textContent = store.ui.contribConnect;
                }
            };
        }

        const btnDisconnect = this.querySelector('#btn-gh-disconnect');
        if (btnDisconnect) {
            btnDisconnect.onclick = () => {
                github.disconnect();
                store.update({ githubUser: null });
                // Clear both to be safe
                localStorage.removeItem('arbor-gh-token');
                sessionStorage.removeItem('arbor-gh-token');
                this.render();
            };
        }
    }

    // --- SOURCES ---
    renderSources(ui) {
        if (this.showSecurityWarning) {
             return this.renderSecurityWarning(ui);
        }

        return `
        <div class="flex flex-col h-full">
            <div class="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-1">📚 ${ui.sourceManagerTitle}</h2>
                <p class="text-sm text-slate-500">${ui.sourceManagerDesc}</p>
            </div>
            ${store.value.lastActionMessage ? `<div class="bg-green-100 text-green-800 p-2 text-xs font-bold text-center">${store.value.lastActionMessage}</div>` : ''}
            <div class="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-950/50">
                ${store.value.sources.map(s => `
                    <div class="p-4 rounded-xl flex items-center justify-between border ${store.value.activeSource?.id === s.id ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}">
                        <div class="min-w-0 flex-1 mr-4">
                            <div class="flex items-center gap-2 mb-1">
                                <p class="font-bold text-slate-800 dark:text-white truncate">${s.name}</p>
                                ${store.value.activeSource?.id === s.id ? `<span class="text-[10px] bg-sky-500 text-white px-2 rounded-full font-bold uppercase">${ui.sourceActive}</span>` : ''}
                                ${s.isTrusted ? `<span class="text-[10px] bg-green-100 text-green-700 px-2 rounded font-bold border border-green-200">VERIFIED</span>` : `<span class="text-[10px] bg-orange-100 text-orange-700 px-2 rounded font-bold border border-orange-200">⚠️</span>`}
                            </div>
                            <p class="text-xs text-slate-400 font-mono truncate">${s.url}</p>
                        </div>
                        <div class="flex gap-2">
                             ${store.value.activeSource?.id !== s.id ? `<button class="btn-load px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-xs font-bold rounded hover:bg-sky-500 hover:text-white transition-colors" data-id="${s.id}">${ui.sourceLoad}</button>` : ''}
                             ${!s.isDefault ? `<button class="btn-del p-2 text-slate-400 hover:text-red-500" data-id="${s.id}">🗑</button>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                 <div class="flex gap-2">
                     <input id="inp-url" type="url" placeholder="${ui.sourceUrlPlaceholder}" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-4 py-2 text-sm font-bold">
                     <button id="btn-add" class="px-4 py-2 bg-purple-600 text-white font-bold rounded-lg shadow-lg hover:bg-purple-500">${ui.sourceAdd}</button>
                 </div>
            </div>
        </div>`;
    }

    renderSecurityWarning(ui) {
        return `
        <div class="p-8 text-center">
            <div class="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-3xl mb-4 mx-auto">🛡️</div>
            <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2">${ui.secWarningTitle}</h3>
            <p class="text-slate-600 dark:text-slate-300 mb-6 text-sm leading-relaxed">${ui.secWarningBody}</p>
            <div class="w-full bg-slate-100 dark:bg-slate-800 p-3 rounded-lg mb-6 border border-slate-200 dark:border-slate-700">
                <p class="text-xs font-mono break-all text-slate-700 dark:text-slate-200">${this.pendingSourceUrl}</p>
            </div>
            <div class="flex flex-col gap-3">
                 <button id="btn-sec-confirm" class="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg">${ui.secConfirm}</button>
                 <button id="btn-sec-cancel" class="w-full py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl">${ui.secCancel}</button>
            </div>
        </div>
        `;
    }

    bindSourcesEvents() {
        if (this.showSecurityWarning) {
            this.querySelector('#btn-sec-confirm').onclick = () => {
                store.addSource(this.pendingSourceUrl);
                this.pendingSourceUrl = null;
                this.showSecurityWarning = false;
                this.render();
            };
            this.querySelector('#btn-sec-cancel').onclick = () => {
                this.pendingSourceUrl = null;
                this.showSecurityWarning = false;
                this.render();
            };
            return;
        }

        this.querySelector('#btn-add').onclick = () => {
             const url = this.querySelector('#inp-url').value;
             if(!url) return;
             
             if (store.isUrlTrusted(url)) {
                 store.addSource(url);
             } else {
                 this.pendingSourceUrl = url;
                 this.showSecurityWarning = true;
                 this.render();
             }
        };
        this.querySelectorAll('.btn-del').forEach(b => b.onclick = (e) => store.removeSource(e.target.dataset.id));
        this.querySelectorAll('.btn-load').forEach(b => b.onclick = (e) => store.loadAndSmartMerge(e.target.dataset.id));
    }
    
    // --- OTHERS ---
    renderAbout(ui) {
        return `
        <div class="p-8">
            <div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center text-3xl mb-6">ℹ️</div>
            <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-4">${ui.aboutTitle}</h2>
            <div class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-left text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-4">
                <p><strong>${ui.missionTitle}</strong><br>${ui.missionText}</p>
                <p class="text-xs text-slate-400 font-mono pt-4 border-t border-slate-200 dark:border-slate-700">Version 0.1<br>${ui.lastUpdated} ${store.value.data?.generatedAt || 'N/A'}</p>
            </div>
            <a href="https://github.com/treesys-org/arbor-ui" target="_blank" rel="noopener noreferrer" class="mt-6 w-full flex items-center justify-center gap-3 py-3 px-4 bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-slate-300 text-white dark:text-slate-800 font-bold text-sm rounded-xl transition-all">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"></path></svg>
                ${ui.viewOnGithub}
            </a>
        </div>`;
    }

    renderImpressum(ui) {
        return `
        <div class="p-8">
             <h2 class="text-xl font-black text-slate-800 dark:text-white mb-4">${ui.impressumTitle}</h2>
             <div class="text-left bg-slate-50 dark:bg-slate-800 p-6 rounded-xl text-sm text-slate-600 dark:text-slate-300 space-y-4">
                 <p>${ui.impressumText}</p>
                 
                 ${!this.showImpressumDetails ? `
                    <button id="btn-show-impressum" class="text-sky-600 dark:text-sky-400 font-bold text-xs hover:underline">
                        ${ui.showImpressumDetails}
                    </button>
                 ` : `
                    <div class="font-mono pt-4 border-t border-slate-200 dark:border-slate-700 whitespace-pre-wrap animate-in fade-in duration-300 text-xs">
                        ${ui.impressumDetails}
                    </div>
                 `}
             </div>
        </div>`;
    }

    renderLanguage(ui) {
        return `
        <div class="p-8">
            <div class="text-4xl mb-6">🌍</div>
            <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-6">${ui.languageTitle}</h2>
            <div class="space-y-3">
                ${store.availableLanguages.map(l => `
                    <button class="btn-lang-sel w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${store.value.lang === l.code ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-100 dark:border-slate-800 hover:border-blue-300'}" data-code="${l.code}">
                        <div class="flex items-center gap-4">
                            <span class="text-3xl">${l.flag}</span>
                            <div class="text-left"><p class="font-bold text-slate-800 dark:text-white">${l.nativeName}</p></div>
                        </div>
                        ${store.value.lang === l.code ? '<span class="text-blue-500">✓</span>' : ''}
                    </button>
                `).join('')}
            </div>
        </div>`;
    }

    // --- CERTIFICATES ---

    getPct(m) {
        if(m.totalLeaves === 0) return 0;
        return Math.round((m.completedLeaves / m.totalLeaves) * 100);
    }

    renderSingleCertificate(ui, moduleId) {
        const module = store.getModulesStatus().find(m => m.id === moduleId);
        if(!module) return;

        // FIX: Z-Index z-[100]
        this.innerHTML = `
        <div id="cert-overlay" class="fixed inset-0 z-[100] flex items-center justify-center bg-white dark:bg-slate-950 p-6 overflow-y-auto animate-in">
          
          <button id="btn-cert-close" class="absolute top-4 right-4 z-[110] p-3 bg-white/50 dark:bg-slate-900/50 rounded-full hover:bg-red-500 hover:text-white transition-colors no-print">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          <div class="max-w-3xl w-full border-8 border-double border-stone-800 dark:border-stone-600 p-8 bg-stone-50 dark:bg-[#1a2e22] text-center shadow-2xl relative certificate-container">
              
              <!-- Ornamental Corners -->
              <div class="absolute top-2 left-2 w-12 md:w-16 h-12 md:h-16 border-t-4 border-l-4 border-stone-800 dark:border-stone-600"></div>
              <div class="absolute top-2 right-2 w-12 md:w-16 h-12 md:h-16 border-t-4 border-r-4 border-stone-800 dark:border-stone-600"></div>
              <div class="absolute bottom-2 left-2 w-12 md:w-16 h-12 md:h-16 border-b-4 border-l-4 border-stone-800 dark:border-stone-600"></div>
              <div class="absolute bottom-2 right-2 w-12 md:w-16 h-12 md:h-16 border-b-4 border-r-4 border-stone-800 dark:border-stone-600"></div>

              <div class="py-12 px-6 border-2 border-stone-800/20 dark:border-stone-600/20 flex flex-col items-center justify-center">
                  <div class="w-24 h-24 mb-6 bg-green-700 text-white rounded-full flex items-center justify-center text-5xl shadow-lg">🎓</div>

                  <h1 class="text-3xl md:text-5xl font-black text-slate-800 dark:text-green-400 mb-2 uppercase tracking-widest font-serif">${ui.certTitle}</h1>
                  
                  <div class="w-32 h-1 bg-stone-700 dark:bg-stone-500 mx-auto mb-8"></div>

                  <p class="text-xl text-slate-500 dark:text-slate-400 italic font-serif mb-6">${ui.certBody}</p>

                  <h2 class="text-2xl md:text-4xl font-bold text-slate-900 dark:text-white mb-12 font-serif border-b-2 border-slate-300 dark:border-slate-700 pb-2 px-6 md:px-12 inline-block min-w-[200px] w-full max-w-[500px] break-words">
                      ${module.name}
                  </h2>

                  <p class="text-md text-slate-600 dark:text-slate-300 mb-1">${ui.certSign}</p>
                  <p class="text-sm text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-12">${new Date().toLocaleDateString()}</p>

                  <button id="btn-cert-print" class="px-8 py-3 bg-stone-800 hover:bg-stone-700 text-white font-bold rounded-xl shadow-lg no-print">
                      ${ui.printCert}
                  </button>
              </div>
          </div>
        </div>`;
        
        const closeCert = () => {
             store.setModal(null);
             store.closeContent();
             store.setViewMode('explore');
        };

        this.querySelector('#cert-overlay').onclick = (e) => {
            if(e.target.id === 'cert-overlay') closeCert();
        };
        this.querySelector('#btn-cert-close').onclick = closeCert;
        this.querySelector('#btn-cert-print').onclick = () => window.print();
    }

    renderCertificatesGallery() {
        const modules = store.getModulesStatus();
        const ui = store.ui;

        // Filter Logic
        const filtered = modules.filter(m => {
            if (!this.certShowAll && !m.isComplete) return false;
            if (this.certSearch) {
                 const q = this.certSearch.toLowerCase();
                 return m.name.toLowerCase().includes(q) || (m.description && m.description.toLowerCase().includes(q));
            }
            return true;
        });

        // FIX: Z-Index z-[70]
        this.innerHTML = `
        <div class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-0 md:p-10 animate-in fade-in duration-300">
          
          <div class="bg-white dark:bg-slate-950 rounded-none md:rounded-3xl w-full max-w-6xl h-full md:max-h-[90vh] shadow-2xl relative border-0 md:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            
            <!-- Header -->
            <div class="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white dark:bg-slate-950 z-10 pt-16 md:pt-6">
               <div>
                   <h2 class="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                       <span class="text-green-600">🏆</span> ${ui.navCertificates}
                   </h2>
                   <p class="text-slate-500 dark:text-slate-400 mt-1">${ui.modulesProgress}</p>
               </div>
               
               <div class="flex items-center gap-4 w-full md:w-auto">
                   <!-- Search Bar -->
                   <div class="relative flex-1 md:w-64">
                       <input id="inp-cert-search" type="text" placeholder="${ui.searchCert}" value="${this.certSearch}"
                        class="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-2 pl-10 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-green-600 outline-none">
                       <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                   </div>

                   <!-- Filter Toggle -->
                   <button id="btn-cert-filter" class="whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-colors ${!this.certShowAll ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}">
                       ${this.certShowAll ? ui.showAll : ui.showEarned}
                   </button>

                   <button class="btn-close-certs w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors flex-shrink-0">
                       <svg class="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
               </div>
            </div>

            <!-- Scrollable Grid -->
            <div class="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50 dark:bg-slate-900/50">
                ${filtered.length === 0 ? `
                    <div class="flex flex-col items-center justify-center h-full text-slate-400">
                        <div class="text-4xl mb-4">🔍</div><p>${ui.noResults}</p>
                    </div>` : ''}
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20 md:pb-0">
                    ${filtered.map(module => `
                        <div class="relative group overflow-hidden rounded-2xl border-2 transition-all duration-300 bg-white dark:bg-slate-900
                             ${module.isComplete ? 'border-green-600 shadow-xl shadow-green-600/20' : 'border-slate-200 dark:border-slate-800 opacity-75'}">
                            
                            <div class="p-6 flex flex-col h-full relative z-10">
                                <div class="flex justify-between items-start mb-4">
                                    <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-inner border border-white dark:border-slate-700
                                         ${module.isComplete ? 'bg-gradient-to-br from-green-100 to-white dark:from-green-900/20 dark:to-slate-900' : 'bg-slate-100 dark:bg-slate-800 grayscale'}">
                                        ${module.icon || '📦'}
                                    </div>
                                    ${module.isComplete 
                                        ? `<div class="bg-green-600 text-white text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider shadow-sm">${ui.lessonFinished}</div>`
                                        : `<div class="text-slate-400"><svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg></div>`
                                    }
                                </div>

                                <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2 leading-tight">${module.name}</h3>
                                <p class="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 min-h-[2.5em]">${module.description || module.path}</p>

                                <div class="mt-auto">
                                    <div class="flex justify-between text-xs font-bold text-slate-400 mb-1">
                                        <span>${module.completedLeaves} / ${module.totalLeaves}</span>
                                        <span>${this.getPct(module)}%</span>
                                    </div>
                                    <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div class="h-full bg-green-600 transition-all duration-500" style="width: ${this.getPct(module)}%"></div>
                                    </div>
                                </div>

                                <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                                    ${module.isComplete 
                                        ? `<button class="btn-cert-view w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg shadow-green-600/30 transition-all active:scale-95 flex items-center justify-center gap-2" data-id="${module.id}">
                                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            ${ui.viewCert}
                                           </button>`
                                        : `<button disabled class="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold rounded-xl cursor-not-allowed border border-transparent">${ui.lockedCert}</button>`
                                    }
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
          </div>
        </div>`;

        this.querySelector('.btn-close-certs').onclick = () => store.setViewMode('explore');
        const searchInput = this.querySelector('#inp-cert-search');
        
        searchInput.oninput = (e) => {
            this.certSearch = e.target.value;
            this.render();
            const el = this.querySelector('#inp-cert-search');
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        };
        
        this.querySelector('#btn-cert-filter').onclick = () => {
            this.certShowAll = !this.certShowAll;
            this.render();
        };

        this.querySelectorAll('.btn-cert-view').forEach(b => {
            b.onclick = (e) => store.setModal({ type: 'certificate', moduleId: e.currentTarget.dataset.id });
        });
    }
}
customElements.define('arbor-modals', ArborModals);
