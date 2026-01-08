






import { store } from '../store.js';
import './admin-panel.js';

class ArborModals extends HTMLElement {
    constructor() {
        super();
        this.state = {
            step: 0,
            searchQuery: '',
            searchResults: [],
            pendingUrl: null,
            showWarning: false,
            showImpressum: false,
            profileTab: 'garden',
            showAllCerts: false, 
            certSearchQuery: '' 
        };
        this.searchTimer = null;
        this.lastRenderKey = null;
    }

    connectedCallback() {
        store.addEventListener('state-change', () => {
             // Only full re-render if we are NOT in search mode with an active input
             // or if the modal type actually changed.
             const currentModal = store.value.modal;
             const isSearch = currentModal === 'search' || currentModal?.type === 'search';
             // Simple check: if we are already searching, don't re-render whole component on state change
             // unless the modal ITSELF changed.
             if (isSearch && this.querySelector('#inp-search')) {
                 return; 
             }
             this.render();
        });
    }

    close() { 
        this.state.searchQuery = '';
        this.state.searchResults = [];
        this.state.pendingUrl = null;
        this.state.showWarning = false;
        this.state.showImpressum = false;
        this.state.showAllCerts = false;
        this.state.certSearchQuery = '';
        this.lastRenderKey = null;
        if (this.searchTimer) clearTimeout(this.searchTimer);
        store.setModal(null); 
    }

    updateState(partial) {
        this.state = { ...this.state, ...partial };
        // If we are in search, manual update of list instead of full re-render
        if (store.value.modal === 'search' || store.value.modal?.type === 'search') {
            if (partial.searchResults) {
                this.updateSearchResultsDOM();
                return;
            }
        }
        this.render();
    }
    
    render() {
        const { modal, viewMode, previewNode } = store.value;
        const ui = store.ui;

        // 1. Sage (AI) Modal
        if (modal && (modal === 'sage' || modal.type === 'sage')) { 
            if (this.lastRenderKey !== 'sage') {
                this.innerHTML = ''; 
                this.lastRenderKey = 'sage';
            }
            return; 
        }
        
        // 2. Lesson Preview Modal (The "Enter" Screen)
        if (previewNode) { 
            const key = `preview-${previewNode.id}`;
            if (this.lastRenderKey !== key) {
                this.renderPreviewModal(previewNode, ui);
                this.lastRenderKey = key;
            }
            return; 
        }
        
        // 3. Certificates Gallery
        if (viewMode === 'certificates' && modal?.type !== 'certificate') { 
            // Always render certificates view to handle internal state updates (like search filter)
            // But use key to debounce simple prop changes
            const certKey = `certificates-${this.state.showAllCerts}-${this.state.certSearchQuery}`;
            if (this.lastRenderKey !== certKey) {
                this.renderCertificatesGallery(ui); 
                this.lastRenderKey = certKey;
            }
            return; 
        }

        // 4. No Modal Check
        if (!modal) { 
            if (this.innerHTML !== '') {
                this.innerHTML = ''; 
                this.lastRenderKey = null;
            }
            return; 
        }
        
        // 5. Editor (Handled by its own component usually, but ensures cleanup if needed)
        if (modal.type === 'editor') return;

        // --- RENDER KEY CHECK for Standard Modals ---
        const currentKey = JSON.stringify({
            modalType: modal.type || modal,
            modalNodeId: modal.node ? modal.node.id : null,
            state: this.state,
            lang: store.value.lang
        });

        if (currentKey === this.lastRenderKey) return;
        this.lastRenderKey = currentKey;

        const type = modal.type || modal;
        let content = '';

        switch (type) {
            case 'search': content = this.renderSearch(ui); break;
            case 'welcome': 
            case 'tutorial': content = this.renderWelcome(ui); break;
            case 'sources': content = this.renderSources(ui); break;
            case 'offline': content = this.renderOffline(ui); break;
            case 'about': content = this.renderAbout(ui); break;
            case 'language': content = this.renderLanguage(ui); break;
            case 'impressum': content = this.renderImpressum(ui); break;
            case 'contributor': content = '<arbor-admin-panel class="w-full h-full flex flex-col"></arbor-admin-panel>'; break;
            case 'profile': content = this.renderProfile(ui); break;
            case 'emptyModule': content = this.renderEmptyModule(ui, modal.node); break;
            case 'certificate': content = this.renderSingleCertificate(ui, modal.moduleId); break;
            default: content = `<div class="p-8">Unknown modal: ${type}</div>`;
        }

        const sizeClass = type === 'contributor' && store.value.githubUser ? 'w-[95vw] h-[90vh] max-w-6xl' : 'max-w-lg';

        // Custom styling wrapper for Search vs Standard modals
        if (type === 'search') {
             this.innerHTML = `
             <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-start justify-center pt-20 bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in">
                <div class="w-full max-w-2xl flex flex-col max-h-[80vh] relative cursor-auto">
                    <div class="absolute -top-10 right-0 flex justify-end w-full pb-2">
                        <button class="btn-close-search text-white/80 hover:text-white font-bold text-sm flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full transition-colors backdrop-blur-sm border border-white/10">
                            <span>${ui.close || 'Close'}</span> ✕
                        </button>
                    </div>
                    ${content}
                </div>
             </div>`;
             
             // Removed backdrop click closing logic
             this.querySelector('.btn-close-search').onclick = () => this.close();
             
             this.bindEvents(type, ui);
             return;
        }

        // Standard Modal Wrapper
        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl ${sizeClass} w-full relative overflow-hidden flex flex-col max-h-[95vh] border border-slate-200 dark:border-slate-800 cursor-auto">
                ${type !== 'contributor' ? `<button class="btn-close absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>` : ''}
                ${content}
            </div>
        </div>`;

        // Removed backdrop click closing logic
        const closeBtn = this.querySelector('.btn-close');
        if (closeBtn) closeBtn.onclick = () => this.close();
        
        this.bindEvents(type, ui);
    }

    // --- PREVIEW LOGIC (Fixing the "Click Course" Issue) ---
    renderPreviewModal(node, ui) {
        const isComplete = store.isCompleted(node.id);
        const icon = node.icon || (node.type === 'exam' ? '⚔️' : '📄');
        const btnText = isComplete ? ui.lessonFinished : ui.lessonEnter;
        const btnClass = isComplete ? 'bg-green-600 hover:bg-green-500' : 'bg-purple-600 hover:bg-purple-500';

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto">
                <button class="btn-cancel absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>
                
                <div class="p-8 text-center">
                    <div class="w-24 h-24 mx-auto bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center text-5xl mb-6 shadow-inner border border-slate-100 dark:border-slate-700/50 transform rotate-3">
                        ${icon}
                    </div>
                    
                    <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-3 leading-tight">${node.name}</h2>
                    
                    <p class="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed text-sm max-w-[260px] mx-auto">
                        ${node.description || ui.noDescription}
                    </p>

                    <div class="flex gap-3 justify-center w-full">
                        <button class="btn-enter w-full py-4 rounded-2xl font-bold text-white shadow-xl shadow-purple-500/20 transition-transform active:scale-95 flex items-center justify-center gap-2 ${btnClass}">
                            <span>${isComplete ? '✓' : '🚀'}</span> ${btnText}
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        // Removed backdrop click closing logic
        this.querySelector('.btn-enter').onclick = () => store.enterLesson();
        this.querySelectorAll('.btn-cancel').forEach(b => b.onclick = () => store.closePreview());
    }

    // --- CERTIFICATES GALLERY ---
    renderCertificatesGallery(ui) {
        // Filter by Exam Type (isCertifiable)
        const allCertifiable = store.getModulesStatus().filter(m => m.isCertifiable);
        
        // Filter by Search
        const query = this.state.certSearchQuery.toLowerCase();
        let filtered = allCertifiable.filter(m => m.name.toLowerCase().includes(query));
        
        // Toggle Logic: Show All vs Earned
        const showAll = this.state.showAllCerts;
        const visibleModules = showAll ? filtered : filtered.filter(m => m.isComplete);
        
        // Button Text logic: "Mis logros" implies going BACK to earned only. "Ver todos" implies showing all.
        const toggleBtnText = showAll ? ui.showEarned : ui.showAll;

        let listHtml = '';
        if (visibleModules.length === 0) {
            listHtml = `
            <div class="flex flex-col items-center justify-center h-64 text-center">
                <div class="text-6xl mb-4 opacity-30 grayscale">🎓</div>
                <h2 class="text-xl font-bold mb-2 text-slate-800 dark:text-white">${ui.noResults}</h2>
            </div>`;
        } else {
            listHtml = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto custom-scrollbar p-1">
                ${visibleModules.map(m => {
                    const isLocked = !m.isComplete;
                    return `
                    <div class="border-2 ${isLocked ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50' : 'border-yellow-400/30 bg-yellow-50 dark:bg-yellow-900/10'} p-4 rounded-xl flex items-center gap-4 relative overflow-hidden group transition-colors">
                         <div class="absolute -right-4 -bottom-4 text-8xl opacity-10 rotate-12 pointer-events-none select-none ${isLocked ? 'grayscale' : ''}">📜</div>
                         
                         <div class="w-16 h-16 ${isLocked ? 'bg-slate-200 dark:bg-slate-800 grayscale opacity-50' : 'bg-white dark:bg-slate-800'} rounded-full flex items-center justify-center text-3xl shadow-sm border ${isLocked ? 'border-slate-300 dark:border-slate-600' : 'border-yellow-200 dark:border-yellow-700/50'} relative z-10 shrink-0">
                            ${isLocked ? '🔒' : (m.icon || '🎓')}
                         </div>
                         
                         <div class="flex-1 relative z-10 min-w-0">
                             <h3 class="font-bold ${isLocked ? 'text-slate-500 dark:text-slate-500' : 'text-slate-800 dark:text-white'} leading-tight mb-1 truncate">${m.name}</h3>
                             <p class="text-[10px] uppercase font-bold ${isLocked ? 'text-slate-400' : 'text-yellow-600 dark:text-yellow-400'} mb-2">${isLocked ? ui.lockedCert : ui.lessonFinished}</p>
                             
                             ${isLocked ? `
                             <button class="text-xs font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 px-3 py-1.5 rounded-lg cursor-not-allowed opacity-70">
                                ${ui.viewCert}
                             </button>
                             ` : `
                             <button class="btn-view-cert text-xs font-bold text-white bg-slate-900 dark:bg-slate-700 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors" data-id="${m.id}">
                                ${ui.viewCert}
                             </button>
                             `}
                         </div>
                    </div>
                `;
                }).join('')}
            </div>`;
        }

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-3xl w-full relative overflow-hidden flex flex-col max-h-[85vh] border border-slate-200 dark:border-slate-800 cursor-auto">
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col gap-4 shrink-0">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                             <span class="text-3xl">🏆</span>
                             <h2 class="text-xl font-black text-slate-800 dark:text-white">${ui.navCertificates}</h2>
                        </div>
                        <button class="btn-close-certs w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors">✕</button>
                    </div>

                    <div class="flex gap-3">
                        <div class="relative flex-1">
                            <span class="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
                            <input id="inp-cert-search" type="text" placeholder="${ui.searchCert}" 
                                class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-9 pr-4 text-sm font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-sky-500"
                                value="${this.state.certSearchQuery}">
                        </div>
                        <button id="btn-toggle-certs" class="px-4 py-2 rounded-xl bg-slate-800 dark:bg-slate-700 text-white font-bold text-xs whitespace-nowrap hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors shadow-sm">
                            ${toggleBtnText}
                        </button>
                    </div>
                </div>
                
                <div class="p-6 flex-1 overflow-y-auto">
                    ${listHtml}
                </div>
            </div>
        </div>`;
        
        // Removed backdrop click closing logic
        this.querySelector('.btn-close-certs').onclick = () => store.setViewMode('explore');
        
        const searchInput = this.querySelector('#inp-cert-search');
        if (searchInput) {
            searchInput.oninput = (e) => {
                this.updateState({ certSearchQuery: e.target.value });
                setTimeout(() => {
                    const el = this.querySelector('#inp-cert-search');
                    if(el) {
                         el.focus();
                         el.selectionStart = el.selectionEnd = el.value.length;
                    }
                }, 10);
            };
            searchInput.focus();
        }

        const toggleBtn = this.querySelector('#btn-toggle-certs');
        if (toggleBtn) {
            toggleBtn.onclick = () => this.updateState({ showAllCerts: !this.state.showAllCerts });
        }

        this.querySelectorAll('.btn-view-cert').forEach(b => {
             b.onclick = (e) => store.setModal({ type: 'certificate', moduleId: e.currentTarget.dataset.id });
        });
    }

    bindEvents(type, ui) {
        if (type === 'search') this.bindSearchEvents();
        if (type === 'welcome' || type === 'tutorial') this.bindWelcomeEvents(ui);
        if (type === 'sources') this.bindSourcesEvents();
        if (type === 'offline') this.bindOfflineEvents();
        if (type === 'profile') this.bindProfileEvents();
        if (type === 'language') {
            this.querySelectorAll('.btn-lang-sel').forEach(b => b.onclick = (e) => {
                store.setLanguage(e.currentTarget.dataset.code);
                this.close();
            });
        }
        if (type === 'impressum') {
            const btn = this.querySelector('#btn-show-imp');
            if(btn) btn.onclick = () => this.updateState({ showImpressum: true });
        }
    }

    // --- SEARCH ---
    renderSearch(ui) {
        return `
        <div class="relative w-full mb-4">
            <span class="absolute left-4 top-4 text-slate-400 text-lg">🔍</span>
            <input id="inp-search" type="text" placeholder="" 
                class="w-full bg-[#1e293b] border border-slate-700 text-slate-200 rounded-xl py-4 pl-12 pr-14 font-bold outline-none focus:ring-2 focus:ring-sky-500 shadow-xl text-lg transition-all placeholder:text-slate-500"
                value="${this.state.searchQuery}" autofocus autocomplete="off">
            <span class="absolute right-4 top-4 text-[10px] font-bold text-slate-500 border border-slate-600 px-1.5 py-1 rounded bg-[#0f172a] select-none">ESC</span>
        </div>
        
        <div id="search-msg-area" class="text-center text-slate-400 py-4 font-medium text-sm transition-opacity duration-300 ${this.state.searchQuery.length > 0 ? 'opacity-100' : 'opacity-0'}">
            ${ui.searchKeepTyping}
        </div>

        <div id="search-results-list" class="flex-1 overflow-y-auto custom-scrollbar bg-[#1e293b] rounded-xl border border-slate-700 shadow-2xl hidden">
            <!-- Results injected here -->
        </div>`;
    }
    
    getSearchResultsHTML(ui) {
         if (this.state.searchResults.length === 0) {
             return `<div class="text-center text-slate-400 py-8 flex flex-col items-center gap-2"><span class="text-2xl opacity-50">🍃</span><span>${ui.noResults}</span></div>`;
         }
         
         return this.state.searchResults.map(res => {
            // Determine Tag
            let tag = ui.tagModule || 'MODULE';
            let tagClass = 'border-blue-500 text-blue-400 bg-blue-500/10';
            
            if (res.type === 'leaf') { 
                tag = ui.tagLesson || 'LESSON'; 
                tagClass = 'border-sky-500 text-sky-400 bg-sky-500/10';
            }
            if (res.type === 'exam') { 
                tag = ui.tagExam || 'EXAM'; 
                tagClass = 'border-red-500 text-red-400 bg-red-500/10';
            }
            if (res.type === 'branch' || res.type === 'tree' || res.type === 'root') {
                 tag = ui.tagModule || 'MODULE';
            }

            // Format Breadcrumbs
            const pathDisplay = (res.path || '').replace(/ \/ /g, ' › ');

            return `
            <button class="btn-search-result w-full text-left p-4 border-b border-slate-700/50 hover:bg-white/5 transition-colors flex items-start gap-4 group" data-json="${encodeURIComponent(JSON.stringify(res))}">
                <div class="w-10 h-10 rounded-lg bg-[#0f172a] border border-slate-700 text-slate-300 flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform shadow-md">
                    ${res.icon || '📄'}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3 mb-1">
                        <h4 class="font-bold text-slate-100 truncate text-base">${res.name}</h4>
                        <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 border rounded ${tagClass}">${tag}</span>
                    </div>
                    <p class="text-xs text-slate-400 truncate font-medium">${pathDisplay}</p>
                </div>
            </button>
            `;
         }).join('');
    }
    
    updateSearchResultsDOM() {
        const list = this.querySelector('#search-results-list');
        const msgArea = this.querySelector('#search-msg-area');
        
        if (list && msgArea) {
            if (this.state.searchQuery.length > 0) {
                // Determine visibility based on query length logic
                if (this.state.searchResults.length > 0 || (this.state.searchQuery.length >= 2)) {
                    list.innerHTML = this.getSearchResultsHTML(store.ui);
                    list.classList.remove('hidden');
                    msgArea.classList.add('hidden');
                } else if (this.state.searchQuery.length === 1) {
                    list.classList.add('hidden');
                    msgArea.classList.remove('hidden');
                    msgArea.textContent = store.ui.searchKeepTyping;
                } else {
                    list.classList.add('hidden');
                    msgArea.classList.remove('hidden');
                    msgArea.textContent = store.ui.noResults;
                }
            } else {
                list.classList.add('hidden');
                msgArea.classList.add('hidden');
            }

            // Re-bind click events
            list.querySelectorAll('.btn-search-result').forEach(btn => {
                btn.onclick = () => {
                    const data = JSON.parse(decodeURIComponent(btn.dataset.json));
                    store.navigateTo(data.id, data);
                    this.close();
                }
            });
        }
    }

    bindSearchEvents() {
        const inp = this.querySelector('#inp-search');
        
        // Global Keydown for ESC
        const handleKey = (e) => {
            if (e.key === 'Escape') this.close();
        };
        window.addEventListener('keydown', handleKey);
        
        // Cleanup listener when element removed
        const observer = new MutationObserver((mutations) => {
             if (!document.contains(inp)) {
                 window.removeEventListener('keydown', handleKey);
                 observer.disconnect();
             }
        });
        if(inp) observer.observe(document.body, { childList: true, subtree: true });


        if(inp) {
            inp.focus();
            inp.oninput = (e) => {
                const q = e.target.value;
                this.state.searchQuery = q;
                
                if (this.searchTimer) clearTimeout(this.searchTimer);
                
                if (q.length === 0) {
                    this.updateState({ searchResults: [] });
                } else if (q.length === 1) {
                    // Update UI to show "Keep typing..." immediately
                    this.updateSearchResultsDOM();
                    
                    // Set 3 second delay for single char search
                    this.searchTimer = setTimeout(async () => {
                         // Double check current query in case it changed
                         if (this.state.searchQuery === q) {
                             const results = await store.searchBroad(q);
                             this.updateState({ searchResults: results });
                         }
                    }, 3000);
                } else {
                    // Standard search debounce
                    this.searchTimer = setTimeout(async () => {
                         const results = await store.search(q);
                         this.updateState({ searchResults: results });
                    }, 300);
                }
            };
        }
        // Initial DOM Sync
        this.updateSearchResultsDOM();
    }

    // --- SOURCES ---
    renderSources(ui) {
        const sources = store.value.sources || [];
        const activeId = store.value.activeSource?.id;

        return `
        <div class="p-6 h-full flex flex-col">
            <h2 class="text-2xl font-black mb-2 dark:text-white">${ui.sourceManagerTitle}</h2>
            <p class="text-sm text-slate-500 mb-6">${ui.sourceManagerDesc}</p>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar space-y-3 mb-4 pr-1">
                ${sources.map(s => `
                    <div class="p-4 rounded-xl border-2 transition-all group relative ${s.id === activeId ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900'}">
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex items-center gap-2">
                                <span class="text-xl">${s.isDefault ? '🌳' : '🌐'}</span>
                                <h3 class="font-bold text-slate-800 dark:text-white">${s.name}</h3>
                                ${s.id === activeId ? `<span class="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">${ui.sourceActive}</span>` : ''}
                            </div>
                            ${!s.isDefault ? `<button class="btn-remove-source text-slate-300 hover:text-red-500 transition-colors p-1" data-id="${s.id}">✕</button>` : ''}
                        </div>
                        <p class="text-xs text-slate-400 font-mono mb-3 truncate">${s.url}</p>
                        
                        ${s.id !== activeId ? `
                        <button class="btn-load-source w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-slate-600 dark:text-purple-300 font-bold rounded-lg text-xs transition-colors" data-id="${s.id}">
                            ${ui.sourceLoad}
                        </button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>

            <div class="pt-4 border-t border-slate-100 dark:border-slate-800">
                <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sourceAdd}</label>
                <div class="flex gap-2">
                    <input id="inp-source-url" type="text" placeholder="https://.../data.json" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 dark:text-white">
                    <button id="btn-add-source" class="bg-purple-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg hover:bg-purple-500 active:scale-95 transition-transform">
                        +
                    </button>
                </div>
            </div>
        </div>`;
    }

    bindSourcesEvents() {
        this.querySelectorAll('.btn-load-source').forEach(btn => {
            btn.onclick = () => {
                store.loadAndSmartMerge(btn.dataset.id);
                this.close(); // Auto close on load
            };
        });
        
        this.querySelectorAll('.btn-remove-source').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if(confirm('Delete tree?')) store.removeSource(btn.dataset.id);
            };
        });

        const btnAdd = this.querySelector('#btn-add-source');
        if (btnAdd) {
            btnAdd.onclick = () => {
                const url = this.querySelector('#inp-source-url').value.trim();
                if (url) {
                    store.addSource(url);
                    this.querySelector('#inp-source-url').value = ''; 
                }
            };
        }
    }
    
    // --- OFFLINE / DOWNLOAD ---
    renderOffline(ui) {
        return `
        <div class="p-8 text-center flex flex-col items-center justify-center h-full relative">
             <div class="w-20 h-20 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center text-4xl mb-6 shadow-inner border border-green-100 dark:border-green-800 text-green-600">💾</div>
             <h2 class="text-2xl font-black mb-2 dark:text-white">${ui.offlineTitle}</h2>
             <p class="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-xs leading-relaxed">${ui.offlineDesc}</p>
             
             <div class="w-full max-w-sm space-y-3">
                 <button id="btn-download-offline" class="w-full py-4 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-500 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <span>⬇️</span> ${ui.offlineBtnDownload}
                 </button>
                 
                 <button id="btn-delete-offline" class="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                    <span>🗑️</span> ${ui.offlineBtnDelete}
                 </button>
             </div>
             
             <div class="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 w-full max-w-xs">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">${ui.offlineStatus}</p>
                <div class="flex items-center justify-center gap-2">
                     <span class="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                     <span class="text-xs text-slate-500">IndexedDB: ArborDB</span>
                </div>
             </div>
        </div>
        `;
    }
    
    bindOfflineEvents() {
        const btnDownload = this.querySelector('#btn-download-offline');
        if (btnDownload) {
             btnDownload.onclick = () => {
                 store.downloadCurrentTree();
                 this.close();
             };
        }
        
        const btnDeleteOffline = this.querySelector('#btn-delete-offline');
        if (btnDeleteOffline) {
            btnDeleteOffline.onclick = () => {
                if(confirm("Clear offline cache?")) {
                    store.deleteOfflineData();
                    this.close();
                }
            };
        }
    }

    // --- OTHER MODALS ---
    renderEmptyModule(ui, node) {
        return `<div class="p-8 text-center">
            <div class="text-4xl mb-4">🍂</div>
            <h3 class="font-bold text-xl mb-2">${ui.emptyModuleTitle}</h3>
            <p class="text-slate-500 mb-6">${ui.emptyModuleDesc}</p>
            ${store.value.githubUser 
                ? `<button class="bg-green-600 text-white px-4 py-2 rounded font-bold" onclick="window.editFile('${node.sourcePath}/01_Intro.md')">Crear Primera Lección</button>` 
                : `<p class="text-xs text-slate-400">Inicia sesión en modo editor para contribuir.</p>`}
        </div>`;
    }
    
    renderWelcome(ui) {
         return `<div class="p-8 md:p-10 relative overflow-hidden">
            <!-- Decorative Background -->
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
         </div>`;
    }
    
    bindWelcomeEvents(ui) {
        const btn = this.querySelector('#btn-tutorial-finish');
        if (btn) {
            btn.onclick = () => this.close();
        }
    }
    renderProfile(ui) { 
        const g = store.value.gamification;
        return `<div class="p-8 text-center">
            <div class="w-20 h-20 bg-slate-100 rounded-full mx-auto flex items-center justify-center text-4xl mb-4">👤</div>
            <h2 class="text-2xl font-black mb-1">${ui.profileTitle}</h2>
            <p class="text-slate-500 mb-6">${g.xp} ${ui.xpUnit} • Racha: ${g.streak} días</p>
            
            <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="bg-orange-50 p-4 rounded-xl border border-orange-100">
                    <div class="text-2xl mb-1">🍎</div>
                    <div class="font-bold text-orange-800">${g.fruits.length} Frutos</div>
                </div>
                 <div class="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <div class="text-2xl mb-1">💧</div>
                    <div class="font-bold text-blue-800">${g.streak} Días</div>
                </div>
            </div>
            
            <div class="text-left bg-slate-50 p-4 rounded-xl mb-4">
                <h3 class="font-bold text-xs uppercase text-slate-400 mb-2">Sync Code</h3>
                <textarea class="w-full p-2 text-[10px] font-mono border rounded h-20" readonly onclick="this.select()">${store.getExportData()}</textarea>
                <div class="flex gap-2 mt-2">
                     <button class="flex-1 bg-white border border-slate-200 py-1 rounded text-xs font-bold" onclick="store.downloadProgressFile()">Descargar Archivo</button>
                     <button class="flex-1 bg-slate-800 text-white py-1 rounded text-xs font-bold" onclick="const code=prompt('Pega el código:'); if(code) store.importProgress(code);">Importar</button>
                </div>
            </div>
        </div>`; 
    } 
    bindProfileEvents() {}
    
    renderAbout(ui) { 
        return `
        <div class="p-8 text-center">
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
        </div>`; 
    }
    
    renderImpressum(ui) { 
        const detailsClass = this.state.showImpressum ? 'block' : 'hidden';
        const btnClass = this.state.showImpressum ? 'hidden' : 'block';
        
        return `
        <div class="p-8">
            <h2 class="text-2xl font-black mb-6 dark:text-white flex items-center gap-2">
                <span>⚖️</span> ${ui.impressumTitle}
            </h2>
            
            <div class="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p class="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">${ui.impressumText}</p>
                
                <button id="btn-show-imp" class="${btnClass} text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300 font-bold text-sm flex items-center gap-1 transition-colors">
                    <span>${ui.showImpressumDetails}</span>
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                </button>

                <div class="${detailsClass} mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-2 fade-in">
                     <div class="flex flex-col items-center mb-6">
                         <div class="w-16 h-16 bg-white dark:bg-slate-900 rounded-xl shadow-sm flex items-center justify-center text-2xl border border-slate-100 dark:border-slate-800 mb-2">🌲</div>
                         <p class="font-black text-slate-800 dark:text-white">treesys.org</p>
                     </div>
                     <pre class="whitespace-pre-wrap font-mono text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">${ui.impressumDetails}</pre>
                </div>
            </div>
        </div>`; 
    }
    
    renderLanguage(ui) { 
        return `<div class="p-8 grid grid-cols-2 gap-4">
            ${store.availableLanguages.map(l => `
                <button class="btn-lang-sel p-4 border rounded-xl hover:bg-slate-50 flex flex-col items-center gap-2 ${store.value.lang === l.code ? 'border-green-500 bg-green-50' : ''}" data-code="${l.code}">
                    <span class="text-4xl">${l.flag}</span>
                    <span class="font-bold">${l.nativeName}</span>
                </button>
            `).join('')}
        </div>`; 
    }
    
    renderSingleCertificate(ui, moduleId) { 
        return `
        <div class="p-12 text-center bg-yellow-50 dark:bg-yellow-950/20 h-full flex flex-col items-center justify-center relative overflow-hidden">
             <div class="absolute inset-0 border-[10px] border-double border-yellow-200 dark:border-yellow-900/40 m-4 rounded-2xl pointer-events-none"></div>
             <div class="w-24 h-24 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center text-5xl shadow-lg border-4 border-yellow-400 mb-6 relative z-10">🎓</div>
             <h2 class="font-black text-3xl text-slate-800 dark:text-white mb-2 uppercase tracking-widest relative z-10">${ui.certTitle}</h2>
             <div class="w-24 h-1 bg-yellow-400 mb-6 relative z-10"></div>
             <p class="text-slate-600 dark:text-slate-300 mb-2 font-serif italic text-lg relative z-10">${ui.certBody}</p>
             <h3 class="font-bold text-2xl text-purple-600 dark:text-purple-400 mb-8 relative z-10">${moduleId}</h3>
             
             <div class="flex gap-8 text-center text-xs text-slate-400 font-mono relative z-10 uppercase tracking-widest">
                <div>
                    <div class="border-b border-slate-300 dark:border-slate-700 pb-1 mb-1 w-32 mx-auto">${new Date().toLocaleDateString()}</div>
                    ${ui.certDate}
                </div>
                <div>
                    <div class="border-b border-slate-300 dark:border-slate-700 pb-1 mb-1 w-32 mx-auto font-black text-slate-800 dark:text-slate-300">Arbor University</div>
                    ${ui.certSign}
                </div>
             </div>
             
             <button class="mt-8 px-6 py-2 bg-slate-900 dark:bg-slate-800 text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:scale-105 transition-transform relative z-10" onclick="window.print()">
                ${ui.printCert}
             </button>
        </div>`;
    }
}

customElements.define('arbor-modals', ArborModals);