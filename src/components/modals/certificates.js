
import { store } from '../../store.js';

class ArborModalCertificates extends HTMLElement {
    constructor() {
        super();
        this.state = {
            searchQuery: '',
            showAll: false
        };
        this.lastRenderKey = null;
    }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
    }

    close() {
        store.setViewMode('explore');
    }

    render() {
        const ui = store.ui;
        const lang = store.value.lang;
        const theme = store.value.theme;
        
        // Use new method to get all certificates, even unloaded ones
        const allCertifiable = store.getAvailableCertificates();
        
        // Anti-flicker key
        const renderKey = JSON.stringify({
            lang, theme,
            search: this.state.searchQuery,
            showAll: this.state.showAll,
            count: allCertifiable.length,
            completedCount: allCertifiable.filter(c => c.isComplete).length
        });

        const query = this.state.searchQuery.toLowerCase();
        let filtered = allCertifiable.filter(m => m.name.toLowerCase().includes(query));
        
        const showAll = this.state.showAll;
        const visibleModules = showAll ? filtered : filtered.filter(m => m.isComplete);
        
        const toggleBtnText = showAll ? (ui.showEarned || "My Achievements") : (ui.showAll || "Show All");
        const toggleBtnClass = showAll
            ? 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-yellow-500/20' 
            : 'bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 dark:hover:bg-slate-600';

        let listHtml = '';
        if (visibleModules.length === 0) {
            listHtml = `
            <div class="flex flex-col items-center justify-center h-full text-center opacity-50">
                <div class="text-8xl mb-6 grayscale">🎓</div>
                <h2 class="text-2xl font-bold mb-2 text-slate-800 dark:text-white">${ui.noResults || "No results"}</h2>
            </div>`;
        } else {
            listHtml = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar p-1">
                ${visibleModules.map(m => {
                    const isLocked = !m.isComplete;
                    return `
                    <div class="border-2 ${isLocked ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50' : 'border-yellow-400/30 bg-yellow-50 dark:bg-yellow-900/10'} p-5 rounded-2xl flex flex-col gap-4 relative overflow-hidden group transition-all hover:scale-[1.02] hover:shadow-lg h-full">
                         <div class="absolute -right-6 -bottom-6 text-9xl opacity-5 rotate-12 pointer-events-none select-none ${isLocked ? 'grayscale' : ''}">📜</div>
                         
                         <div class="flex items-start justify-between relative z-10">
                             <div class="w-16 h-16 ${isLocked ? 'bg-slate-200 dark:bg-slate-800 grayscale opacity-50' : 'bg-white dark:bg-slate-800'} rounded-2xl flex items-center justify-center text-4xl shadow-sm border ${isLocked ? 'border-slate-300 dark:border-slate-600' : 'border-yellow-200 dark:border-yellow-700/50'} shrink-0">
                                ${isLocked ? '🔒' : (m.icon || '🎓')}
                             </div>
                             <span class="text-[10px] uppercase font-black px-2 py-1 rounded-full ${isLocked ? 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400'}">
                                ${isLocked ? (ui.lockedCert || "Locked") : (ui.lessonFinished || "Earned")}
                             </span>
                         </div>
                         
                         <div class="flex-1 relative z-10 min-w-0 flex flex-col">
                             <h3 class="font-black ${isLocked ? 'text-slate-500 dark:text-slate-500' : 'text-slate-800 dark:text-white'} text-lg leading-tight mb-2 line-clamp-2">${m.name}</h3>
                             <div class="mt-auto pt-2">
                                 ${isLocked ? `
                                 <button class="w-full text-xs font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 py-2 rounded-xl cursor-not-allowed opacity-70">
                                    ${ui.viewCert || "View"}
                                 </button>
                                 ` : `
                                 <button class="btn-view-cert w-full text-xs font-bold text-white bg-slate-900 dark:bg-slate-700 hover:bg-blue-600 py-2 rounded-xl transition-colors shadow-md" data-id="${m.id}">
                                    ${ui.viewCert || "View Diploma"}
                                 </button>
                                 `}
                             </div>
                         </div>
                    </div>
                `;
                }).join('')}
            </div>`;
        }

        // Only use partial update if keys match to prevent flicker on search/filter
        // But force full re-render if language changed (renderKey difference)
        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;

        // Preserve structure strategy to prevent flicker, but update texts
        const container = this.querySelector('#certs-list-container');
        const toggleBtn = this.querySelector('#btn-toggle-certs');
        const searchInput = this.querySelector('#inp-cert-search');
        const titleEl = this.querySelector('#modal-title-text');

        if (container && toggleBtn && searchInput && titleEl) {
            // Update Title (Translation)
            titleEl.textContent = ui.navCertificates || "Certificates";
            
            // Update Toggle Button
            toggleBtn.textContent = toggleBtnText;
            toggleBtn.className = `px-4 py-2 rounded-xl ${toggleBtnClass} font-bold text-xs whitespace-nowrap transition-colors shadow-sm`;
            
            // Update List
            container.innerHTML = listHtml;
            
            // Update Search Placeholder
            searchInput.placeholder = ui.searchCert || "Search...";
            
            // Rebind
            this.querySelectorAll('.btn-view-cert').forEach(b => {
                b.onclick = (e) => store.setModal({ type: 'certificate', moduleId: e.currentTarget.dataset.id });
            });
            return;
        }

        // Full Render (First time) - INCREASED WIDTH HERE (max-w-6xl)
        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div class="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl max-w-6xl w-full relative overflow-hidden flex flex-col h-[85vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <div class="p-6 md:p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col gap-6 shrink-0">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-4">
                             <span class="text-4xl">🏆</span>
                             <div>
                                 <h2 id="modal-title-text" class="text-2xl font-black text-slate-800 dark:text-white leading-none">${ui.navCertificates || "Certificates"}</h2>
                                 <p class="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Achievements & Diplomas</p>
                             </div>
                        </div>
                        <button class="btn-close-certs w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors text-lg">✕</button>
                    </div>

                    <div class="flex flex-col md:flex-row gap-3">
                        <div class="relative flex-1">
                            <span class="absolute left-4 top-3 text-slate-400 text-sm">🔍</span>
                            <input id="inp-cert-search" type="text" placeholder="${ui.searchCert || "Search..."}" 
                                class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
                                value="${this.state.searchQuery}">
                        </div>
                        <button id="btn-toggle-certs" class="px-6 py-2.5 rounded-xl ${toggleBtnClass} font-bold text-xs whitespace-nowrap transition-colors shadow-sm">
                            ${toggleBtnText}
                        </button>
                    </div>
                </div>
                
                <div id="certs-list-container" class="p-6 md:p-8 flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50">
                    ${listHtml}
                </div>
            </div>
        </div>`;

        this.bindEvents();
    }

    bindEvents() {
        const closeBtn = this.querySelector('.btn-close-certs');
        if (closeBtn) closeBtn.onclick = () => this.close();
        
        const searchInput = this.querySelector('#inp-cert-search');
        if (searchInput) {
            searchInput.oninput = (e) => {
                this.state.searchQuery = e.target.value;
                this.render();
                
                // Refocus after render (if we did a partial update, this keeps focus, if full, we need to restore)
                setTimeout(() => {
                    const el = this.querySelector('#inp-cert-search');
                    if(el) {
                         el.focus();
                         // Only set selection if value is same length (avoids jumping cursor if logic changed)
                         if (el.value.length === this.state.searchQuery.length) {
                             el.selectionStart = el.selectionEnd = el.value.length;
                         }
                    }
                }, 0);
            };
        }

        const toggleBtn = this.querySelector('#btn-toggle-certs');
        if (toggleBtn) {
            toggleBtn.onclick = () => {
                this.state.showAll = !this.state.showAll;
                this.render();
            };
        }

        this.querySelectorAll('.btn-view-cert').forEach(b => {
             b.onclick = (e) => store.setModal({ type: 'certificate', moduleId: e.currentTarget.dataset.id });
        });
    }
}
customElements.define('arbor-modal-certificates', ArborModalCertificates);
