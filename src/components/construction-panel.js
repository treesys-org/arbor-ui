
import { store } from '../store.js';
import { github } from '../services/github.js';
import { fileSystem } from '../services/filesystem.js';

class ArborConstructionPanel extends HTMLElement {
    constructor() {
        super();
        this.state = {
            activePopover: null, 
            loading: false,
            isLoggingIn: false,
            loginError: null,
            repoInfo: null
        };
        this.lastRenderKey = null;
        this.isInitialized = false;
        
        this.clickOutsideHandler = this.handleClickOutside.bind(this);
    }

    connectedCallback() {
        // Initial Structure Render
        if (!this.isInitialized) {
            this.renderStructure();
            this.isInitialized = true;
        }
        
        this.updateView();
        store.addEventListener('state-change', () => this.checkRender());
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
            this.updateView();
        }
    }

    checkRender() {
        const { constructionMode } = store.value;
        if (!constructionMode) {
            this.style.display = 'none';
            return;
        }
        this.style.display = 'flex'; // Use flex per class
        this.updateView();
    }

    async fetchData() {
        if (fileSystem.isLocal || !store.value.githubUser) return;
        this.state.loading = true;
        this.updateView();
        try {
            this.state.repoInfo = github.getRepositoryInfo();
        } catch (e) {
            console.error("Fetch Error", e);
        } finally {
            this.state.loading = false;
            this.updateView();
        }
    }

    togglePopover(name) {
        this.state.activePopover = (this.state.activePopover === name) ? null : name;
        this.updateView();
    }

    async handleLogin() {
        const inp = this.querySelector('#inp-gh-token');
        if (!inp) return;
        const token = inp.value.trim();
        if (!token) return;

        this.state.isLoggingIn = true;
        this.state.loginError = null;
        this.updateView();

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
            this.updateView();
        }
    }

    handleLogout() {
        github.disconnect();
        localStorage.removeItem('arbor-gh-token');
        store.update({ githubUser: null });
        this.state.activePopover = null;
        this.updateView();
    }

    handleSave() {
        if (fileSystem.isLocal) {
            store.userStore.persist();
            store.notify("✅ Local Garden Saved");
        } else {
            store.notify("ℹ️ Remote changes are saved per-file.");
        }
    }

    async handleRevert() {
        if (await store.confirm("Revert to last saved state? Unsaved changes will be lost.", "Revert Changes")) {
            store.loadData(store.value.activeSource, store.value.lang, true);
            store.notify("↩️ Changes Reverted");
        }
    }

    renderStructure() {
        this.className = "fixed bottom-8 left-1/2 -translate-x-1/2 z-[50] flex flex-col items-center pointer-events-auto";
        this.innerHTML = `
            <!-- Popover Container (Above Dock) -->
            <div id="popover-slot" class="mb-2 w-full flex justify-center empty:hidden"></div>
            
            <!-- Dock -->
            <div id="dock-container" class="bg-slate-900/90 dark:bg-black/90 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-full p-1.5 flex items-center gap-2 transition-all duration-300 animate-in slide-in-from-bottom-10 hover:scale-105">
                <!-- Content injected via JS to maintain event bindings better if needed, or static here -->
            </div>
        `;
    }

    updateView() {
        if (!this.isInitialized) return;

        const { activeSource, githubUser } = store.value;
        const { activePopover, loading, isLoggingIn, loginError } = this.state;
        const repoName = activeSource?.name || "Local Garden";
        const isLocal = fileSystem.isLocal;
        const isContributor = isLocal || !!githubUser;

        const renderKey = JSON.stringify({
            activePopover, loading, isLoggingIn, loginError,
            sourceId: activeSource?.id,
            sourceName: activeSource?.name,
            user: githubUser?.login,
            isLocal
        });

        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;

        // 1. Update Popover
        const popoverSlot = this.querySelector('#popover-slot');
        if (activePopover === 'login' && !githubUser) {
            popoverSlot.innerHTML = `
                <div class="bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl p-4 w-80 animate-in slide-in-from-bottom-4 fade-in origin-bottom">
                    <h4 class="text-xs font-black text-white uppercase tracking-widest mb-3">Connect Repository</h4>
                    <input id="inp-gh-token" type="password" placeholder="GitHub Personal Token..." class="w-full bg-black/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white mb-2 focus:border-blue-500 outline-none">
                    ${loginError ? `<p class="text-xs text-red-400 mb-2 font-bold">${loginError}</p>` : ''}
                    <button id="btn-login-action" class="w-full py-2 bg-white text-black font-bold rounded-lg text-xs hover:bg-slate-200">
                        ${isLoggingIn ? 'Connecting...' : 'Connect'}
                    </button>
                    <p class="text-[9px] text-slate-500 mt-2">Requires 'repo' scope token.</p>
                </div>`;
                
            const btnLoginAction = popoverSlot.querySelector('#btn-login-action');
            if(btnLoginAction) btnLoginAction.onclick = (e) => { e.stopPropagation(); this.handleLogin(); };
            
        } else {
            popoverSlot.innerHTML = '';
        }

        // 2. Update Dock Items
        const dock = this.querySelector('#dock-container');
        const itemBaseClass = "relative w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all duration-200 cursor-pointer border group";
        const itemSpecialClass = "bg-orange-600 hover:bg-orange-500 text-white border-orange-400 shadow-lg shadow-orange-900/50";
        const itemBlueClass = "bg-blue-600 hover:bg-blue-500 text-white border-blue-400 shadow-lg shadow-blue-900/50";
        const itemActionClass = "bg-slate-700 hover:bg-slate-600 text-white border-slate-500";
        const btnLoginClass = "px-4 h-10 rounded-full bg-green-600 hover:bg-green-500 text-white font-bold text-xs uppercase tracking-wider border border-green-400 shadow-lg shadow-green-900/50 transition-all flex items-center gap-2";
        const btnLogoutClass = "px-4 h-10 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider border border-red-400 shadow-lg shadow-red-900/50 transition-all flex items-center gap-2";

        let html = `
            <div class="flex items-center px-4 h-10 border-r border-white/10 mr-1 select-none">
                <span class="text-xs font-black text-slate-200 tracking-tight truncate max-w-[120px] flex items-center gap-2">
                    ${isLocal ? '🌱' : '🐙'} ${repoName}
                </span>
            </div>`;

        if (isContributor) {
            html += `
                <button id="btn-save-all" class="${itemBaseClass} ${itemActionClass}" title="Save Changes"><span>💾</span></button>
                <button id="btn-revert" class="${itemBaseClass} ${itemActionClass}" title="Undo / Revert"><span>↩️</span></button>
                <div class="w-px h-6 bg-white/10 mx-1"></div>
            `;
        }

        html += `
            <button id="btn-architect" class="${itemBaseClass} ${itemSpecialClass}" title="AI Architect">
                <span class="relative">🦉<span class="absolute -top-2 -right-2 text-[10px] transform rotate-12 drop-shadow-md">⛑️</span></span>
            </button>
        `;

        if (isContributor) {
            html += `
                <button id="btn-governance" class="${itemBaseClass} ${itemBlueClass}" title="Governance"><span>🏛️</span></button>
            `;
        }

        if (!isLocal) {
            if (!githubUser) {
                html += `<button id="btn-login-toggle" class="${btnLoginClass}"><span>Login</span></button>`;
            } else {
                html += `<button id="btn-logout" class="${btnLogoutClass}"><span>Logout</span></button>`;
            }
        }

        dock.innerHTML = html;

        // Rebind Dock Events
        const bind = (id, fn) => {
            const el = dock.querySelector(id);
            if (el) el.onclick = (e) => { e.stopPropagation(); fn(e); };
        };

        bind('#btn-architect', () => store.setModal({ type: 'sage', mode: 'architect' }));
        if (isContributor) {
            bind('#btn-governance', () => store.setModal({ type: 'contributor', tab: 'access' }));
            bind('#btn-save-all', () => this.handleSave());
            bind('#btn-revert', () => this.handleRevert());
        }
        if (!isLocal) {
            if (!githubUser) bind('#btn-login-toggle', () => this.togglePopover('login'));
            else bind('#btn-logout', () => this.handleLogout());
        }
    }
}

customElements.define('arbor-construction-panel', ArborConstructionPanel);
