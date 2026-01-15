
import { store } from '../store.js';
import { github } from '../services/github.js';
import { fileSystem } from '../services/filesystem.js';

class ArborConstructionPanel extends HTMLElement {
    constructor() {
        super();
        this.state = {
            activePopover: null, // 'login' | null (Request popover removed)
            prsCount: 0,
            loading: false,
            isLoggingIn: false,
            loginError: null,
            repoInfo: null
        };
        this.lastRenderKey = null;
        this.clickOutsideHandler = this.handleClickOutside.bind(this);
    }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
        document.addEventListener('click', this.clickOutsideHandler);
        
        if (store.value.constructionMode && store.value.githubUser) {
            this.fetchData();
        }
    }
    
    disconnectedCallback() {
        document.removeEventListener('click', this.clickOutsideHandler);
    }

    handleClickOutside(e) {
        if (this.state.activePopover && !this.contains(e.target)) {
            this.state.activePopover = null;
            this.render();
        }
    }

    async fetchData() {
        if (fileSystem.isLocal || !store.value.githubUser) return;
        
        this.state.loading = true;
        this.render();

        try {
            // Just get the count for the badge
            const prs = await github.getPullRequests();
            this.state.prsCount = prs ? prs.length : 0;
            this.state.repoInfo = github.getRepositoryInfo();
        } catch (e) {
            console.error("Construction Panel Fetch Error", e);
        } finally {
            this.state.loading = false;
            this.render();
        }
    }

    togglePopover(name) {
        if (this.state.activePopover === name) {
            this.state.activePopover = null;
        } else {
            this.state.activePopover = name;
        }
        this.render();
    }

    async handleLogin() {
        const inp = this.querySelector('#inp-gh-token');
        if (!inp) return;
        const token = inp.value.trim();
        if (!token) return;

        this.state.isLoggingIn = true;
        this.state.loginError = null;
        this.render();

        try {
            const user = await github.initialize(token);
            if (user) {
                localStorage.setItem('arbor-gh-token', token);
                store.update({ githubUser: user });
                this.state.activePopover = null; 
                this.fetchData();
            } else {
                throw new Error("Invalid Token");
            }
        } catch (e) {
            this.state.loginError = "Auth Failed";
        } finally {
            this.state.isLoggingIn = false;
            this.render();
        }
    }

    render() {
        const { constructionMode, activeSource, githubUser } = store.value;
        
        if (!constructionMode) {
            this.style.display = 'none';
            return;
        }
        this.style.display = 'block';

        const { activePopover, prsCount, loading, isLoggingIn, loginError } = this.state;
        const repoName = activeSource?.name || "Local Garden";
        const isLocal = fileSystem.isLocal;

        const renderKey = JSON.stringify({
            activePopover, prCount: prsCount, 
            loading, isLoggingIn, loginError,
            source: activeSource?.id,
            user: githubUser?.login
        });

        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;

        this.className = "fixed bottom-6 left-1/2 -translate-x-1/2 z-[50] flex flex-col items-center pointer-events-auto";

        const dockContainerClass = "bg-slate-900/80 dark:bg-black/80 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl p-2 flex items-end gap-3 transition-all duration-300 animate-in slide-in-from-bottom-10";
        
        const itemBaseClass = "relative w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all duration-200 cursor-pointer border group";
        const itemInactiveClass = "bg-white/5 hover:bg-white/15 hover:scale-110 hover:-translate-y-2 border-transparent hover:border-white/10 text-slate-400 hover:text-white";
        
        const popoverClass = "absolute bottom-20 mb-2 bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl p-4 w-80 max-h-[60vh] overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom-4 fade-in origin-bottom";

        let dockItemsHtml = '';
        let activePopoverHtml = '';

        // 1. REPO INDICATOR
        dockItemsHtml += `
            <div class="flex flex-col items-center justify-center px-3 h-12 mr-2 border-r border-white/10 opacity-70">
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target</span>
                <span class="text-xs font-mono font-bold text-slate-300 truncate max-w-[100px]">${repoName}</span>
            </div>
        `;

        if (isLocal) {
            // --- LOCAL MODE ---
            dockItemsHtml += `
                <button id="btn-architect" class="${itemBaseClass} ${itemInactiveClass}" title="AI Architect">
                    <span class="relative">
                        <span class="text-xl">🦉</span>
                        <span class="absolute -top-2 -right-2 text-xs">⛑️</span>
                    </span>
                </button>
            `;
            
            // Local versions handled by "Releases" modal or manual file import, 
            // but for consistency we might link to Admin Panel if we enabled local history support there.
            // For now, keep it simple.
            dockItemsHtml += `
                <div class="px-2 text-xs font-bold text-green-500 uppercase tracking-widest opacity-80 flex flex-col items-center">
                    <span>🌱</span>
                    <span class="text-[8px] text-green-700">Local</span>
                </div>
            `;
        } else if (!githubUser) {
            // --- LOGIN REQUIRED ---
            const isActive = activePopover === 'login';
            dockItemsHtml += `
                <button id="btn-login-toggle" class="${itemBaseClass} ${isActive ? 'bg-green-600 text-white -translate-y-2 border-green-400 shadow-lg shadow-green-500/40' : 'bg-white/5 hover:bg-green-900/30 text-green-400 border-green-900/50'}" title="Connect GitHub">
                    <span>🔌</span>
                    ${!isActive ? '<span class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>' : ''}
                </button>
            `;

            if (isActive) {
                activePopoverHtml = `
                <div class="${popoverClass}">
                    <h4 class="text-xs font-black text-white uppercase tracking-widest mb-3">Connect Repository</h4>
                    <input id="inp-gh-token" type="password" placeholder="GitHub Personal Token..." class="w-full bg-black/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white mb-2 focus:border-blue-500 outline-none">
                    ${loginError ? `<p class="text-xs text-red-400 mb-2 font-bold">${loginError}</p>` : ''}
                    <button id="btn-login-action" class="w-full py-2 bg-white text-black font-bold rounded-lg text-xs hover:bg-slate-200">
                        ${isLoggingIn ? 'Connecting...' : 'Connect'}
                    </button>
                    <p class="text-[9px] text-slate-500 mt-2">Requires 'repo' scope token.</p>
                </div>`;
            }

        } else {
            // --- ENGINEER DOCK (CONNECTED) ---
            
            // 0. ARCHITECT AI
            dockItemsHtml += `
                <button id="btn-architect" class="${itemBaseClass} ${itemInactiveClass}" title="AI Architect">
                    <span class="relative">
                        <span class="text-xl">🦉</span>
                        <span class="absolute -top-2 -right-2 text-xs">⛑️</span>
                    </span>
                </button>
            `;

            // 1. RELEASES -> Opens Admin Panel (Versions Tab)
            dockItemsHtml += `
                <button id="btn-versions" class="${itemBaseClass} ${itemInactiveClass}" title="Timeline & Versions">
                    <span>🚀</span>
                </button>
            `;

            // 2. INBOX -> Opens Admin Panel (PRs Tab)
            dockItemsHtml += `
                <button id="btn-inbox" class="${itemBaseClass} ${itemInactiveClass}" title="Inbox & Requests">
                    <span>📬</span>
                    ${prsCount > 0 ? `<span class="absolute -top-2 -right-2 bg-orange-500 text-black text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-slate-900">${prsCount}</span>` : ''}
                </button>
            `;

            // 3. TEAM -> Opens Admin Panel (Team Tab)
            dockItemsHtml += `
                <button id="btn-team" class="${itemBaseClass} ${itemInactiveClass}" title="Team & Access">
                    <span class="text-xl">🛡️</span>
                </button>
            `;

            // 4. USER / LOGOUT
            dockItemsHtml += `
                <div class="w-px h-8 bg-white/10 mx-1"></div>
                <button id="btn-logout" class="${itemBaseClass} ${itemInactiveClass} !rounded-full" title="Log Out @${githubUser.login}">
                    <img src="${githubUser.avatar_url}" class="w-full h-full rounded-full opacity-80 hover:opacity-100 transition-opacity">
                    <div class="absolute inset-0 flex items-center justify-center bg-red-500/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-white">✕</div>
                </button>
            `;
        }

        this.innerHTML = `
            ${activePopoverHtml}
            <div class="${dockContainerClass}">
                ${dockItemsHtml}
            </div>
        `;

        // --- BINDINGS ---
        
        const bind = (id, fn) => {
            const el = this.querySelector(id);
            if (el) el.onclick = (e) => { e.stopPropagation(); fn(e); };
        };

        // Open specific tabs in the unified Admin Modal
        bind('#btn-versions', () => store.setModal({ type: 'contributor', tab: 'versions' }));
        bind('#btn-inbox', () => store.setModal({ type: 'contributor', tab: 'prs' }));
        bind('#btn-team', () => store.setModal({ type: 'contributor', tab: 'team' }));
        
        bind('#btn-architect', () => store.setModal({ type: 'sage', mode: 'architect' }));

        if (!isLocal) {
            if (!githubUser) {
                bind('#btn-login-toggle', () => this.togglePopover('login'));
                bind('#btn-login-action', () => this.handleLogin());
            } else {
                bind('#btn-logout', () => {
                    github.disconnect();
                    localStorage.removeItem('arbor-gh-token');
                    store.update({ githubUser: null });
                });
            }
        }
    }
}

customElements.define('arbor-construction-panel', ArborConstructionPanel);
