


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
        
        this.profileTab = 'garden'; // 'garden' | 'export' | 'import'
        
        // Search State
        this.isBroadSearchLoading = false;
        this.broadSearchMessage = null;

        this.currentRenderKey = null; // Cache to prevent re-rendering identical states
    }

    connectedCallback() {
        store.addEventListener('state-change', () => this.render());
    }

    close() { store.setModal(null); }
    
    render() {
        const modal = store.value.modal;
        const viewMode = store.value.viewMode;
        const previewNode = store.value.previewNode;

        // 1. Handle Sage Collision: If Sage is active, this component should stay out of the way
        // Sage is handled by its own component <arbor-sage>
        if (modal && (modal === 'sage' || modal.type === 'sage')) {
            if (this.innerHTML !== '') {
                this.innerHTML = '';
                this.currentRenderKey = 'sage-hidden';
            }
            return;
        }

        // 2. Generate a Unique Key for current state to prevent flickering (re-rendering same content)
        // We include: previewNode ID, ViewMode, Modal Type/Props
        const stateKey = JSON.stringify({
            p: previewNode ? previewNode.id : null,
            v: viewMode,
            m: modal,
            // Internal states that require re-render
            i: { 
                step: this.tutorialStep, 
                tab: this.profileTab, 
                sq: this.searchQuery, 
                sr: this.searchResults.length,
                sec: this.showSecurityWarning,
                imp: this.showImpressumDetails,
                certS: this.certSearch,
                certF: this.certShowAll
            }
        });

        if (stateKey === this.currentRenderKey) return; // STOP: Nothing changed visually
        this.currentRenderKey = stateKey;

        // --- RENDER LOGIC START ---

        if (previewNode) {
            this.renderPreview(previewNode);
            return;
        }

        if (viewMode === 'certificates' && modal?.type !== 'certificate') {
            this.renderCertificatesGallery();
            return;
        }

        if (!modal) {
            this.innerHTML = '';
            this.showImpressumDetails = false;
            return;
        }

        const type = typeof modal === 'string' ? modal : modal.type;
        const ui = store.ui;
        
        if (type === 'editor') return; // Handled by <arbor-editor>

        if (type === 'search') {
            this.renderSearch(ui);
            return;
        }

        let content = '';
        
        // FUSED WELCOME & TUTORIAL: Both map to the same narrative renderer
        if (type === 'welcome' || type === 'tutorial') content = this.renderWelcome(ui);
        
        else if (type === 'sources') content = this.renderSources(ui);
        else if (type === 'about') content = this.renderAbout(ui);
        else if (type === 'language') content = this.renderLanguage(ui);
        else if (type === 'impressum') content = this.renderImpressum(ui);
        else if (type === 'contributor') content = this.renderContributor(ui);
        else if (type === 'profile') content = this.renderProfile(ui);
        else if (type === 'certificate') {
            this.renderSingleCertificate(ui, modal.moduleId); 
            return; 
        }

        this.innerHTML = `
        <div class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[90vh]">
                <button class="btn-close absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-20">✕</button>
                ${content}
            </div>
        </div>`;

        const closeBtn = this.querySelector('.btn-close');
        if(closeBtn) closeBtn.onclick = () => this.close();
        
        // FUSED EVENTS
        if (type === 'welcome' || type === 'tutorial') this.bindWelcomeEvents(ui);
        
        if (type === 'sources') this.bindSourcesEvents();
        if (type === 'contributor') this.bindContributorEvents();
        if (type === 'profile') this.bindProfileEvents();
        
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

    renderWelcome(ui) {
        // Build language buttons
        const langButtons = store.availableLanguages.map(l => `
            <button class="btn-welcome-lang text-xl transition-all duration-200 p-1.5 rounded-lg ${store.value.lang === l.code ? 'bg-white dark:bg-slate-800 shadow-sm scale-110 ring-1 ring-slate-200 dark:ring-slate-700' : 'opacity-40 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800'}" data-code="${l.code}" title="${l.nativeName}">
                ${l.flag}
            </button>
        `).join('');

        const steps = ui.welcomeSteps;
        const currentStep = steps[this.tutorialStep];
        const isLast = this.tutorialStep === steps.length - 1;

        // Custom Visuals for the AI Pitch Step
        const isAiPitch = currentStep.isAiPitch;
        const iconClass = isAiPitch 
            ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 animate-pulse" 
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200";

        return `
        <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
            <!-- Header Image / Icon -->
            <div class="pt-8 pb-4 flex flex-col items-center justify-center bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 rounded-t-3xl relative">
                
                <!-- Language Switcher (Top Right) -->
                <div class="absolute top-4 right-12 md:right-14 flex gap-1 bg-slate-50 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-100 dark:border-slate-800 z-30">
                    ${langButtons}
                </div>

                <!-- Animated Owl Avatar -->
                <div class="w-24 h-24 rounded-full ${iconClass} flex items-center justify-center text-5xl mb-4 shadow-xl border-4 border-white dark:border-slate-800 transition-all duration-500">
                    ${currentStep.icon}
                </div>
                
                <h2 class="text-xl font-black text-slate-800 dark:text-white tracking-tight uppercase">${ui.tutorialTitle}</h2>
                <div class="flex gap-1 mt-2">
                    ${steps.map((_, i) => `
                        <div class="h-1.5 rounded-full transition-all duration-300 ${i === this.tutorialStep ? 'w-6 bg-slate-800 dark:bg-white' : 'w-2 bg-slate-200 dark:bg-slate-700'}"></div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Narrative Content -->
            <div class="flex-1 overflow-y-auto p-8 flex flex-col items-center text-center justify-center animate-in fade-in slide-in-from-right-4 duration-300">
                <h3 class="text-2xl font-black text-slate-900 dark:text-white mb-4 leading-tight">${currentStep.title}</h3>
                <p class="text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm">
                    ${currentStep.text}
                </p>

                ${isAiPitch ? `
                    <div class="mt-6 p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800/30 w-full text-left flex gap-3 items-center">
                        <div class="text-2xl animate-bounce">👈</div>
                        <div>
                            <p class="font-bold text-purple-700 dark:text-purple-300 text-xs uppercase">${ui.aiPitchAction}</p>
                            <p class="text-sm text-slate-600 dark:text-slate-400">${ui.aiPitchSub}</p>
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- Footer Actions -->
            <div class="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                 <button id="btn-tut-skip" class="px-4 py-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold uppercase tracking-wider">${ui.tutorialSkip}</button>
                 
                 <div class="flex gap-3">
                    ${this.tutorialStep > 0 ? `
                        <button id="btn-tut-prev" class="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-lg transition-colors">
                            ←
                        </button>
                    ` : ''}
                    
                    <button id="btn-tut-next" class="px-8 h-12 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2">
                        ${isLast ? ui.tutorialFinish : ui.tutorialNext + ' →'}
                    </button>
                 </div>
            </div>
        </div>
        `;
    }

    bindWelcomeEvents(ui) {
        const markSeen = () => localStorage.setItem('arbor-welcome-seen', 'true');

        // Navigation
        const nextBtn = this.querySelector('#btn-tut-next');
        if (nextBtn) {
            nextBtn.onclick = () => {
                if (this.tutorialStep < ui.welcomeSteps.length - 1) {
                    this.tutorialStep++;
                    this.render();
                } else {
                    markSeen();
                    this.close();
                }
            };
        }

        const prevBtn = this.querySelector('#btn-tut-prev');
        if (prevBtn) {
            prevBtn.onclick = () => {
                if (this.tutorialStep > 0) {
                    this.tutorialStep--;
                    this.render();
                }
            };
        }

        const skipBtn = this.querySelector('#btn-tut-skip');
        if (skipBtn) {
            skipBtn.onclick = () => {
                markSeen();
                this.close();
            };
        }

        // Language switcher events
        this.querySelectorAll('.btn-welcome-lang').forEach(btn => {
            btn.onclick = (e) => {
                const code = e.currentTarget.dataset.code;
                store.setLanguage(code);
                // Render triggered automatically by store event
            };
        });
    }

    // --- PROFILE & SYNC ---
    renderProfile(ui) {
        const exportCode = store.getExportData();
        const g = store.value.gamification;

        return `
        <div class="flex flex-col h-full">
            <!-- Header -->
            <div class="p-6 pb-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div class="flex items-center gap-4 mb-4">
                     <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-4xl overflow-hidden border-2 border-white dark:border-slate-700 shadow-lg">
                        👤
                     </div>
                     <div>
                        <h2 class="text-xl font-black text-slate-800 dark:text-white">${ui.profileTitle}</h2>
                        <div class="flex gap-4 mt-1">
                            <span class="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">Level ${Math.floor(g.xp / 100) + 1}</span>
                            <span class="text-xs font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">💧 ${g.streak} ${ui.streak}</span>
                        </div>
                     </div>
                </div>
            </div>

            <!-- TABS -->
            <div class="flex border-b border-slate-100 dark:border-slate-800">
                <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.profileTab === 'garden' ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}" id="tab-garden">
                    🍎 ${ui.gardenTitle}
                </button>
                <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.profileTab === 'export' ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}" id="tab-export">
                    📤 ${ui.exportTitle}
                </button>
                <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.profileTab === 'import' ? 'border-purple-500 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}" id="tab-import">
                    📥 ${ui.importTitle}
                </button>
            </div>

            <!-- CONTENT -->
            <div class="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950/50">
                
                ${this.profileTab === 'garden' ? `
                    <div class="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        ${g.fruits.length === 0 ? `
                            <div class="text-center py-10 text-slate-400">
                                <div class="text-5xl mb-4 grayscale opacity-50">🧺</div>
                                <p>${ui.gardenEmpty}</p>
                            </div>
                        ` : `
                            <div class="grid grid-cols-4 sm:grid-cols-5 gap-4">
                                ${g.fruits.map(f => `
                                    <div class="aspect-square bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center text-3xl hover:scale-110 transition-transform cursor-help" title="Harvested on ${new Date(f.date).toLocaleDateString()}">
                                        ${f.icon}
                                    </div>
                                `).join('')}
                            </div>
                        `}
                        
                        <div class="mt-8 p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-200 dark:border-yellow-800/30">
                            <h4 class="font-bold text-yellow-800 dark:text-yellow-500 text-xs uppercase mb-2">Total Stats</h4>
                            <div class="flex justify-between text-sm">
                                <span>Lifetime XP:</span>
                                <span class="font-bold">${g.xp} ${ui.xpUnit}</span>
                            </div>
                             <div class="flex justify-between text-sm mt-1">
                                <span>Fruits Harvested:</span>
                                <span class="font-bold">${g.fruits.length}</span>
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${this.profileTab === 'export' ? `
                    <div class="animate-in fade-in slide-in-from-right-4 duration-300">
                        <p class="text-sm text-slate-500 mb-4">${ui.exportDesc}</p>
                        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-4">
                            <textarea readonly class="w-full h-24 bg-transparent text-xs font-mono text-slate-600 dark:text-slate-300 outline-none resize-none" id="export-textarea">${exportCode}</textarea>
                            <button id="btn-copy-code" class="w-full mt-2 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-lg transition-colors">
                                📋 ${ui.copyCode}
                            </button>
                        </div>
                        <button id="btn-download-file" class="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                             💾 ${ui.downloadFile} (.json)
                        </button>
                    </div>
                ` : ''}

                ${this.profileTab === 'import' ? `
                    <div class="animate-in fade-in slide-in-from-left-4 duration-300">
                        <p class="text-sm text-slate-500 mb-4">${ui.importDesc}</p>
                         <textarea class="w-full h-24 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl mb-4 text-xs font-mono outline-none focus:ring-2 focus:ring-purple-500" id="import-textarea" placeholder="${ui.pasteCodePlaceholder}"></textarea>
                        <div class="relative">
                            <input type="file" id="import-file" class="hidden" accept=".json">
                            <button onclick="document.getElementById('import-file').click()" class="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-400 hover:border-purple-500 hover:text-purple-500 font-bold rounded-xl transition-colors">
                                📂 Select File
                            </button>
                        </div>
                        <button id="btn-run-import" class="w-full mt-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95">
                            ${ui.importBtn}
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>`;
    }

    bindProfileEvents() {
        const setTab = (t) => {
            this.profileTab = t;
            this.render();
        };
        this.querySelector('#tab-garden').onclick = () => setTab('garden');
        this.querySelector('#tab-export').onclick = () => setTab('export');
        this.querySelector('#tab-import').onclick = () => setTab('import');
        
        if (this.profileTab === 'export') {
            this.querySelector('#btn-copy-code').onclick = (e) => {
                const txt = this.querySelector('#export-textarea');
                txt.select();
                document.execCommand('copy');
                const originalText = e.target.textContent;
                e.target.textContent = '✅ Copied!';
                setTimeout(() => e.target.textContent = originalText, 2000);
            };
            this.querySelector('#btn-download-file').onclick = () => store.downloadProgressFile();
        }

        if (this.profileTab === 'import') {
            const runImport = (val) => {
                 if(store.importProgress(val)) {
                     alert(store.ui.importSuccess);
                     this.close();
                 } else {
                     alert(store.ui.importError);
                 }
            };
            this.querySelector('#btn-run-import').onclick = () => {
                const val = this.querySelector('#import-textarea').value;
                if(val) runImport(val);
            };
            const fileInp = this.querySelector('#import-file');
            fileInp.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => runImport(ev.target.result);
                reader.readAsText(file);
            };
        }
    }

    renderSearchLabel(type) {
        if (type === 'branch') {
            return `<span class="flex-shrink-0 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 tracking-wider">MÓDULO</span>`;
        }
        if (type === 'leaf') {
            return `<span class="flex-shrink-0 text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 px-2 py-0.5 rounded border border-sky-100 dark:border-sky-800/30 tracking-wider">LECCIÓN</span>`;
        }
        if (type === 'exam') {
            return `<span class="flex-shrink-0 text-[10px] uppercase font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded border border-red-100 dark:border-red-800/30 tracking-wider">EXAMEN</span>`;
        }
        return '';
    }

    // --- SEARCH MODAL ---
    renderSearch(ui) {
         let resultsHtml = '';
         
         if (this.isBroadSearchLoading) {
             resultsHtml = `<div class="p-8 text-center text-slate-400 animate-pulse"><p>${ui.searchBroadLoading}</p></div>`;
         } else if (this.broadSearchMessage) {
             resultsHtml = `<div class="p-8 text-center text-sky-500 font-bold animate-pulse"><p>${this.broadSearchMessage}</p></div>`;
         } else if (this.searchResults.length === 0 && this.searchQuery.length >= 2) {
             resultsHtml = `<div class="p-8 text-center text-slate-400"><p>${ui.noResults}</p></div>`;
         } else {
             // SORTING & FILTERING
             const q = this.searchQuery.toLowerCase();
             
             let displayResults = [...this.searchResults];

             // STRICT FILTER for short queries (1-2 chars)
             // This prevents "Linux" (desc "apps") showing up for query "ap"
             if (q.length < 3) {
                 displayResults = displayResults.filter(r => r.name.toLowerCase().includes(q));
             }

             displayResults.sort((a, b) => {
                const nameA = a.name.toLowerCase();
                const nameB = b.name.toLowerCase();
                const startsA = nameA.startsWith(q);
                const startsB = nameB.startsWith(q);
                
                // Exact start match gets top priority
                if (startsA && !startsB) return -1;
                if (!startsA && startsB) return 1;
                
                // Then name includes
                const inNameA = nameA.includes(q);
                const inNameB = nameB.includes(q);
                
                if (inNameA && !inNameB) return -1;
                if (!inNameA && inNameB) return 1;
                
                return 0;
             });

             resultsHtml = displayResults.map((res, index) => {
                // CLEAN PATH LOGIC
                let pathParts = (res.path || '').split(' / ');
                if (pathParts.length > 0 && pathParts[0].includes('Arbor')) pathParts.shift();
                if (pathParts.length > 0 && pathParts[pathParts.length-1] === res.name) pathParts.pop();

                const displayPath = pathParts.length > 0
                    ? pathParts.join(' <span class="text-slate-300 dark:text-slate-600 px-0.5">›</span> ')
                    : '';

                const borderClass = index !== displayResults.length - 1 ? 'border-b border-slate-50 dark:border-slate-800/50' : '';

                return `
                <button class="btn-res w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group flex items-start gap-3 ${borderClass}" data-id="${res.id}">
                    <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg flex-shrink-0 mt-0.5 shadow-sm border border-slate-200 dark:border-slate-700">${res.icon || '📄'}</div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 mb-0.5">
                            <h3 class="font-bold text-slate-700 dark:text-slate-200 truncate text-sm">${res.name}</h3>
                            ${this.renderSearchLabel(res.type)}
                        </div>
                        <p class="text-xs text-slate-400 dark:text-slate-500 truncate flex items-center leading-tight">
                           ${displayPath}
                        </p>
                    </div>
                </button>
            `}).join('');
         }

         this.innerHTML = `
         <div class="fixed inset-0 z-[70] flex items-start justify-center pt-4 md:pt-[15vh] bg-slate-900/60 backdrop-blur-sm p-4 animate-in" id="search-overlay">
            <div class="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[60vh] md:max-h-[60vh]">
                <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <svg class="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                    <input id="inp-search" type="text" placeholder="${ui.searchPlaceholder}" class="w-full bg-transparent text-xl font-bold text-slate-700 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600" autocomplete="off" value="${this.searchQuery}">
                    <button class="btn-close px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs font-bold text-slate-500">ESC</button>
                </div>
                <div class="overflow-y-auto custom-scrollbar" id="search-results">
                    ${resultsHtml}
                </div>
            </div>
         </div>`;

         const overlay = this.querySelector('#search-overlay');
         overlay.onclick = (e) => { if(e.target === overlay) this.close(); };
         
         const inp = this.querySelector('#inp-search');
         inp.focus();
         inp.setSelectionRange(inp.value.length, inp.value.length);
         
         let debounceTimeout = null;
         let singleLetterTimeout = null;

         inp.oninput = (e) => {
             const val = e.target.value;
             this.searchQuery = val;
             
             clearTimeout(debounceTimeout);
             clearTimeout(singleLetterTimeout);
             
             this.broadSearchMessage = null;
             this.isBroadSearchLoading = false;

             if (val.length === 0) {
                 this.searchResults = [];
                 this.render();
                 return;
             }

             if (val.length === 1) {
                 this.broadSearchMessage = ui.searchKeepTyping;
                 this.searchResults = [];
                 this.render();
                 
                 singleLetterTimeout = setTimeout(async () => {
                     if (this.searchQuery.length === 1) {
                         this.broadSearchMessage = null;
                         this.isBroadSearchLoading = true;
                         this.render();
                         
                         this.searchResults = await store.searchBroad(val);
                         this.isBroadSearchLoading = false;
                         this.render();
                         this.querySelector('#inp-search').focus();
                     }
                 }, 1500);
             } else {
                 debounceTimeout = setTimeout(async () => {
                     this.searchResults = await store.search(val);
                     this.render();
                     this.querySelector('#inp-search').focus();
                 }, 300);
             }
         };

         this.querySelectorAll('.btn-res').forEach(b => b.onclick = async (e) => {
             const id = e.currentTarget.dataset.id;
             const nodeInfo = this.searchResults.find(n => n.id === id);
             await store.navigateTo(id, nodeInfo);
             this.close();
         });
         this.querySelector('.btn-close').onclick = () => this.close();
    }

    renderPreview(node) {
        const ui = store.ui;
        const isDone = store.isCompleted(node.id);
        
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
                        sessionStorage.removeItem('arbor-gh-token'); 
                    } else {
                        sessionStorage.setItem('arbor-gh-token', token);
                        localStorage.removeItem('arbor-gh-token'); 
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
                localStorage.removeItem('arbor-gh-token');
                sessionStorage.removeItem('arbor-gh-token');
                this.render();
            };
        }
    }

    renderSources(ui) {
        if (this.showSecurityWarning) return this.renderSecurityWarning(ui);

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
    
    renderAbout(ui) {
        return `
        <div class="p-8">
            <div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center text-3xl mb-6">ℹ️</div>
            <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-4">${ui.aboutTitle}</h2>
            <div class="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl text-left text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-4">
                <p><strong>${ui.missionTitle}</strong><br>${ui.missionText}</p>
                <p class="text-xs text-slate-400 font-mono pt-4 border-t border-slate-200 dark:border-slate-700">Version 0.2<br>${ui.lastUpdated} ${store.value.data?.generatedAt || 'N/A'}</p>
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

    renderSingleCertificate(ui, moduleId) {
        // Now using navigateTo which might have populated cache, but ideally 
        // we should try to find node in memory or fallback to search if not found
        let module = store.findNode(moduleId);
        
        // If not in live tree (because it's deep and collapsed), try search cache
        if (!module) {
             // We can't render the certificate properly without name/description
             // This is a rare edge case if user direct links to cert of unloaded node
             module = { name: "Module " + moduleId, description: "Loading..." }; 
        }

        this.innerHTML = `
        <div id="cert-overlay" class="fixed inset-0 z-[100] flex items-center justify-center bg-white dark:bg-slate-950 p-6 overflow-y-auto animate-in">
          <button id="btn-cert-close" class="absolute top-4 right-4 z-[110] p-3 bg-white/50 dark:bg-slate-900/50 rounded-full hover:bg-red-500 hover:text-white transition-colors no-print">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div class="max-w-3xl w-full border-8 border-double border-stone-800 dark:border-stone-600 p-8 bg-stone-50 dark:bg-[#1a2e22] text-center shadow-2xl relative certificate-container">
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
        // Requires full graph traversal since we don't have a flat index
        // This is fine as it's a specific view mode, but we only show loaded nodes + completed ones (from local storage)
        const allNodes = store.getModulesStatus(); // This gets modules, we need exams specifically
        
        // This view is tricky without a full index. 
        // We will show "Completed Exams" based on local storage ID matching against known graph
        // This is a limitation of client-side sharding: You can't list "everything" easily.
        
        const completedExams = [];
        // Traverse to find exams
        const traverse = (n) => {
            if (n.type === 'exam') completedExams.push(n);
            if (n.children) n.children.forEach(traverse);
        };
        if(store.value.data) traverse(store.value.data);

        const certificateItems = completedExams.map(exam => ({
            id: exam.id,
            name: exam.name,
            icon: exam.icon,
            description: exam.description,
            isComplete: store.isCompleted(exam.id),
            path: exam.path ? exam.path.split(' / ').slice(0, -1).join(' / ') : '',
        }));

        const ui = store.ui;

        const filtered = certificateItems.filter(item => {
            if (!this.certShowAll && !item.isComplete) return false;
            if (this.certSearch) {
                 const q = this.certSearch.toLowerCase();
                 return item.name.toLowerCase().includes(q);
            }
            return true;
        });

        this.innerHTML = `
        <div class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-0 md:p-10 animate-in fade-in duration-300">
          
          <div class="bg-white dark:bg-slate-950 rounded-none md:rounded-3xl w-full max-w-6xl h-full md:max-h-[90vh] shadow-2xl relative border-0 md:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            
            <div class="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white dark:bg-slate-950 z-10 pt-16 md:pt-6">
               <div>
                   <h2 class="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                       <span class="text-green-600">🏆</span> ${ui.navCertificates}
                   </h2>
                   <p class="text-slate-500 dark:text-slate-400 mt-1">${ui.modulesProgress}</p>
               </div>
               
               <div class="flex items-center gap-4 w-full md:w-auto">
                   <div class="relative flex-1 md:w-64">
                       <input id="inp-cert-search" type="text" placeholder="${ui.searchCert}" value="${this.certSearch}"
                        class="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-2 pl-10 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-green-600 outline-none">
                       <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                   </div>
                   <button id="btn-cert-filter" class="whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-colors ${!this.certShowAll ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}">
                       ${this.certShowAll ? ui.showAll : ui.showEarned}
                   </button>
                   <button class="btn-close-certs w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors flex-shrink-0">
                       <svg class="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
               </div>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50 dark:bg-slate-900/50">
                ${filtered.length === 0 ? `
                    <div class="flex flex-col items-center justify-center h-full text-slate-400">
                        <div class="text-4xl mb-4">🔍</div><p>${ui.noResults}</p>
                    </div>` : ''}
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20 md:pb-0">
                    ${filtered.map((module, i) => `
                        <div class="relative group overflow-hidden rounded-2xl border-2 transition-all duration-300 bg-white dark:bg-slate-900
                             ${module.isComplete ? 'border-green-600 shadow-xl shadow-green-600/20' : 'border-slate-200 dark:border-slate-800 opacity-75'}">
                            
                            <div class="p-6 flex flex-col h-full relative z-10">
                                <div class="flex justify-between items-start mb-4">
                                    <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-inner border border-white dark:border-slate-700
                                         ${module.isComplete ? 'bg-gradient-to-br from-green-100 to-white dark:from-green-900/20 dark:to-slate-900' : 'bg-slate-100 dark:bg-slate-800 grayscale'}">
                                        ${module.icon || '⚔️'}
                                    </div>
                                    ${module.isComplete 
                                        ? `<div class="bg-green-600 text-white text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider shadow-sm">${ui.lessonFinished}</div>`
                                        : `<div class="text-slate-400"><svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg></div>`
                                    }
                                </div>

                                <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2 leading-tight">${module.name}</h3>
                                <p class="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 min-h-[2.5em]">${module.description || module.path}</p>

                                <div class="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
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