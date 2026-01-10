
import { store } from '../../store.js';

class ArborModalSearch extends HTMLElement {
    constructor() {
        super();
        this.state = {
            query: '',
            results: [],
            isSearching: false
        };
        this.searchTimer = null;
    }

    connectedCallback() {
        const ui = store.ui;
        this.render(ui);
        this.bindEvents();
    }

    disconnectedCallback() {
        if (this.searchTimer) clearTimeout(this.searchTimer);
    }

    close() {
        store.setModal(null);
    }

    render(ui) {
        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-start justify-center pt-4 md:pt-20 bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in">
            <div class="w-full max-w-2xl flex flex-col max-h-[85vh] md:max-h-[80vh] relative cursor-auto">
                <div class="flex justify-end w-full pb-2 md:absolute md:-top-10 md:right-0">
                    <button class="btn-close-search text-white/80 hover:text-white font-bold text-sm flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full transition-colors backdrop-blur-sm border border-white/10">
                        <span>${ui.close || 'Close'}</span> ✕
                    </button>
                </div>
                
                <div class="relative w-full mb-4">
                    <span class="absolute left-4 top-4 text-slate-400 text-lg">🔍</span>
                    <input id="inp-search" type="text" placeholder="" 
                        class="w-full bg-[#1e293b] border border-slate-700 text-slate-200 rounded-xl py-4 pl-12 pr-14 font-bold outline-none focus:ring-2 focus:ring-sky-500 shadow-xl text-lg transition-all placeholder:text-slate-500"
                        value="${this.state.query}" autofocus autocomplete="off">
                    <span class="absolute right-4 top-4 text-[10px] font-bold text-slate-500 border border-slate-600 px-1.5 py-1 rounded bg-[#0f172a] select-none hidden md:inline">ESC</span>
                </div>
                
                <div id="search-msg-area" class="text-center text-slate-400 py-4 font-medium text-sm transition-opacity duration-300 ${this.state.query.length > 0 ? 'opacity-100' : 'opacity-0'}">
                    ${ui.searchKeepTyping}
                </div>

                <div id="search-results-list" class="flex-1 overflow-y-auto custom-scrollbar bg-[#1e293b] rounded-xl border border-slate-700 shadow-2xl hidden">
                    <!-- Results injected here -->
                </div>
            </div>
        </div>`;
    }

    getResultsHTML(ui) {
         if (this.state.isSearching) {
             return `
             <div class="text-center text-slate-400 py-8 flex flex-col items-center gap-2">
                 <div class="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                 <span class="text-sm font-bold text-sky-400 animate-pulse">${ui.editorProcessing || 'Processing...'}</span>
             </div>`;
         }

         if (this.state.results.length === 0) {
             return `<div class="text-center text-slate-400 py-8 flex flex-col items-center gap-2"><span class="text-2xl opacity-50">🍃</span><span>${ui.noResults}</span></div>`;
         }
         
         // Priority Logic: Modules (branch) > Exams > Lessons (leaf)
         const priority = { 'branch': 0, 'root': 0, 'exam': 1, 'leaf': 2 };

         const sortedResults = [...this.state.results].sort((a, b) => {
             const pA = priority[a.type] !== undefined ? priority[a.type] : 99;
             const pB = priority[b.type] !== undefined ? priority[b.type] : 99;
             
             if (pA !== pB) return pA - pB;
             return a.name.localeCompare(b.name);
         });
         
         return sortedResults.map(res => {
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
         }).join('') + '<div class="h-10"></div>'; // Extra scroll space
    }

    updateResultsDOM() {
        const list = this.querySelector('#search-results-list');
        const msgArea = this.querySelector('#search-msg-area');
        const ui = store.ui;
        
        if (!list || !msgArea) return;

        if (this.state.isSearching) {
            list.innerHTML = this.getResultsHTML(ui);
            list.classList.remove('hidden');
            msgArea.classList.add('hidden');
            return;
        }

        if (this.state.query.length > 0) {
            if (this.state.results.length > 0 || (this.state.query.length >= 2)) {
                list.innerHTML = this.getResultsHTML(ui);
                list.classList.remove('hidden');
                msgArea.classList.add('hidden');
            } else if (this.state.query.length === 1) {
                list.classList.add('hidden');
                msgArea.classList.remove('hidden');
                msgArea.textContent = ui.searchKeepTyping;
            } else {
                list.innerHTML = this.getResultsHTML(ui);
                list.classList.remove('hidden');
                msgArea.classList.add('hidden');
            }
        } else {
            list.classList.add('hidden');
            msgArea.classList.add('hidden');
        }

        list.querySelectorAll('.btn-search-result').forEach(btn => {
            btn.onclick = () => {
                const data = JSON.parse(decodeURIComponent(btn.dataset.json));
                store.navigateTo(data.id, data);
                this.close();
            }
        });
    }

    bindEvents() {
        const inp = this.querySelector('#inp-search');
        const closeBtn = this.querySelector('.btn-close-search');

        if (closeBtn) closeBtn.onclick = () => this.close();
        
        if (inp) {
            inp.focus();
            inp.oninput = (e) => {
                const q = e.target.value;
                this.state.query = q;
                
                if (this.searchTimer) clearTimeout(this.searchTimer);
                
                if (q.length === 0) {
                    this.state.results = [];
                    this.state.isSearching = false;
                    this.updateResultsDOM();
                } else if (q.length === 1) {
                    this.state.isSearching = true;
                    this.updateResultsDOM();
                    
                    this.searchTimer = setTimeout(async () => {
                         if (this.state.query === q) {
                             this.state.results = await store.searchBroad(q);
                             this.state.isSearching = false;
                             this.updateResultsDOM();
                         }
                    }, 3000);
                } else {
                    this.searchTimer = setTimeout(async () => {
                         this.state.results = await store.search(q);
                         this.state.isSearching = false;
                         this.updateResultsDOM();
                    }, 300);
                }
            };
            
            // ESC key handler is handled globally, but we can add local support too
            inp.onkeydown = (e) => {
                if(e.key === 'Escape') this.close();
            }
        }
    }
}
customElements.define('arbor-modal-search', ArborModalSearch);
