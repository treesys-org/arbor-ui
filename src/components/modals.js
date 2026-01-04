
import { store } from '../store.js';

class ArborModals extends HTMLElement {
    constructor() {
        super();
        this.tutorialStep = 0;
        // Local state for certificates filtering
        this.certSearch = '';
        this.certShowAll = false;
        // Local state for search modal
        this.searchQuery = '';
        this.searchResults = [];
        // Local state for security warning
        this.pendingSourceUrl = null;
        this.showSecurityWarning = false;
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

        // 2. Fullscreen Certificates View
        if (store.value.viewMode === 'certificates') {
            this.renderCertificatesGallery();
            return;
        }

        // 3. Modals
        const modal = store.value.modal;
        if (!modal) {
            this.innerHTML = '';
            return;
        }

        const type = typeof modal === 'string' ? modal : modal.type;
        const ui = store.ui;
        
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
        else if (type === 'certificate') {
            this.renderSingleCertificate(ui, modal.moduleId); 
            return; 
        }

        this.innerHTML = `
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[90vh]">
                <button class="btn-close absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20">✕</button>
                ${content}
            </div>
        </div>`;

        // Bind events
        const closeBtn = this.querySelector('.btn-close');
        if(closeBtn) closeBtn.onclick = () => this.close();
        
        if (type === 'tutorial') this.bindTutorialEvents();
        if (type === 'sources') this.bindSourcesEvents();
        if (type === 'language') {
            this.querySelectorAll('.btn-lang-sel').forEach(b => b.onclick = (e) => {
                store.setLanguage(e.currentTarget.dataset.code);
                this.close();
            });
        }
    }

    // --- SEARCH MODAL ---
    renderSearch(ui) {
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
             this.render(); // Re-render to show results
             // Restore focus
             this.querySelector('#inp-search').focus();
             // Hack: move cursor to end
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
        
        this.innerHTML = `
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in" onclick="store.closePreview()">
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative text-center" onclick="event.stopPropagation()">
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
                         <button onclick="store.closePreview()" class="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold rounded-xl">${ui.cancel}</button>
                         <button onclick="store.enterLesson()" class="flex-1 py-3 bg-sky-500 text-white font-bold rounded-xl shadow-lg">${ui.enter}</button>
                    </div>
                 </div>
            </div>
        </div>`;
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
                <p class="text-xs text-slate-400 font-mono pt-4 border-t border-slate-200 dark:border-slate-700">${ui.lastUpdated} ${store.value.data?.generatedAt || 'N/A'}</p>
            </div>
        </div>`;
    }

    renderImpressum(ui) {
        return `
        <div class="p-8">
             <h2 class="text-xl font-black text-slate-800 dark:text-white mb-4">${ui.impressumTitle}</h2>
             <div class="text-left bg-slate-50 dark:bg-slate-800 p-6 rounded-xl text-sm text-slate-600 dark:text-slate-300 space-y-4">
                 <p>${ui.impressumText}</p>
                 <div class="font-mono pt-4 border-t border-slate-200 dark:border-slate-700 whitespace-pre-wrap text-xs">
                     ${ui.impressumDetails}
                 </div>
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
        const module = store.getModulesStatus().find(m => m.id === moduleId);
        if(!module) return;

        this.innerHTML = `
        <div class="fixed inset-0 z-[100] flex items-center justify-center bg-white dark:bg-slate-950 p-6 overflow-y-auto animate-in" onclick="store.setModal(null)">
          <div class="max-w-3xl w-full border-8 border-double border-stone-800 dark:border-stone-600 p-8 bg-stone-50 dark:bg-[#1a2e22] text-center shadow-2xl relative" onclick="event.stopPropagation()">
              <button class="absolute top-4 right-4 p-3 bg-white/50 rounded-full hover:bg-red-500 hover:text-white" onclick="store.setModal(null)">✕</button>
              
              <div class="py-12 px-6 border-2 border-stone-800/20 dark:border-stone-600/20">
                  <div class="w-24 h-24 mb-6 bg-green-700 text-white rounded-full flex items-center justify-center text-5xl shadow-lg mx-auto">🎓</div>
                  <h1 class="text-3xl md:text-5xl font-black text-slate-800 dark:text-green-400 mb-2 uppercase tracking-widest font-serif">${ui.certTitle}</h1>
                  <div class="w-32 h-1 bg-stone-700 dark:bg-stone-500 mx-auto mb-8"></div>
                  <p class="text-xl text-slate-500 dark:text-slate-400 italic font-serif mb-6">${ui.certBody}</p>
                  <h2 class="text-2xl md:text-4xl font-bold text-slate-900 dark:text-white mb-12 font-serif border-b-2 border-stone-300 pb-2 px-12 inline-block">${module.name}</h2>
                  <p class="text-md text-slate-600 dark:text-slate-300 mb-1">${ui.certSign}</p>
                  <p class="text-sm text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-12">${new Date().toLocaleDateString()}</p>

                  <button class="px-8 py-3 bg-stone-800 hover:bg-stone-700 text-white font-bold rounded-xl shadow-lg" onclick="window.print()">${ui.printCert}</button>
              </div>
          </div>
        </div>`;
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

        this.innerHTML = `
        <div class="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md p-4 md:p-10 flex flex-col animate-in">
             <header class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                 <div>
                    <h2 class="text-3xl font-black text-white flex items-center gap-3"><span class="text-green-500">🏆</span> ${ui.navCertificates}</h2>
                 </div>
                 
                 <div class="flex items-center gap-3 w-full md:w-auto">
                    <input id="inp-cert-search" type="text" placeholder="${ui.searchCert}" value="${this.certSearch}" class="bg-slate-800 text-white px-4 py-2 rounded-xl outline-none border border-slate-700 focus:border-green-500">
                    <button id="btn-cert-filter" class="px-4 py-2 rounded-xl text-sm font-bold ${this.certShowAll ? 'bg-slate-700 text-white' : 'bg-green-600 text-white'} whitespace-nowrap">
                        ${this.certShowAll ? ui.showAll : ui.showEarned}
                    </button>
                    <button class="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center flex-shrink-0" onclick="store.setViewMode('explore')">✕</button>
                 </div>
             </header>
             
             <div class="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 custom-scrollbar pb-20">
                 ${filtered.length === 0 ? `<div class="col-span-3 text-center text-slate-400 py-20">${ui.noResults}</div>` : ''}
                 ${filtered.map(m => `
                    <div class="relative overflow-hidden rounded-2xl border-2 transition-all bg-white dark:bg-slate-900 p-6 flex flex-col
                        ${m.isComplete ? 'border-green-600 shadow-xl shadow-green-900/20' : 'border-slate-800 opacity-75'}">
                        
                        <div class="flex justify-between items-start mb-4">
                            <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-inner ${m.isComplete ? 'bg-green-100 dark:bg-green-900/30' : 'bg-slate-100 dark:bg-slate-800 grayscale'}">${m.icon || '📦'}</div>
                            ${m.isComplete ? `<span class="bg-green-600 text-white text-[10px] font-black px-2 py-1 rounded uppercase">Finished</span>` : ''}
                        </div>
                        
                        <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2 leading-tight">${m.name}</h3>
                        <div class="mt-auto">
                            <div class="flex justify-between text-xs font-bold text-slate-400 mb-1">
                                <span>${m.completedLeaves}/${m.totalLeaves}</span>
                                <span>${m.totalLeaves > 0 ? Math.round((m.completedLeaves/m.totalLeaves)*100) : 0}%</span>
                            </div>
                            <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div class="h-full bg-green-600" style="width: ${m.totalLeaves > 0 ? Math.round((m.completedLeaves/m.totalLeaves)*100) : 0}%"></div>
                            </div>
                        </div>
                        <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                             ${m.isComplete 
                                ? `<button class="btn-cert-view w-full py-3 bg-green-600 text-white font-bold rounded-xl" data-id="${m.id}">${ui.viewCert}</button>`
                                : `<button disabled class="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold rounded-xl cursor-not-allowed">${ui.lockedCert}</button>`
                             }
                        </div>
                    </div>
                 `).join('')}
             </div>
        </div>`;

        this.querySelector('#inp-cert-search').oninput = (e) => {
            this.certSearch = e.target.value;
            this.render();
            this.querySelector('#inp-cert-search').focus();
        };
        this.querySelector('#btn-cert-filter').onclick = () => {
            this.certShowAll = !this.certShowAll;
            this.render();
        };

        this.querySelectorAll('.btn-cert-view').forEach(b => {
            b.onclick = (e) => store.setModal({ type: 'certificate', moduleId: e.target.dataset.id });
        });
    }
}
customElements.define('arbor-modals', ArborModals);
