
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
            store.notify("✅ " + (store.ui.conLocalSaved || "Local Garden Saved"));
        } else {
            store.notify("ℹ️ " + (store.ui.conRemoteSaved || "Remote changes are saved per-file."));
        }
    }

    async handleRevert() {
        const ui = store.ui;
        if (await store.confirm(ui.conRevertConfirm || "Revert to last saved state? Unsaved changes will be lost.", ui.conRevertTitle || "Revert Changes")) {
            store.loadData(store.value.activeSource, store.value.lang, true);
            store.notify("↩️ " + (ui.conReverted || "Changes Reverted"));
        }
    }

    renderStructure() {
        // Explicitly set positioning to bottom-4 (1rem from floor)
        // flex-col ensure popover (first child) sits ABOVE dock (second child)
        this.className = "fixed bottom-4 left-0 w-full z-[60] flex flex-col items-center justify-end pointer-events-none";
        
        this.innerHTML = `
            <!-- Popover Container (Visually floats above the dock) -->
            <div id="popover-slot" class="mb-3 flex justify-center empty:hidden pointer-events-auto"></div>

            <!-- Dock Bar -->
            <div id="dock-container" class="pointer-events-auto bg-slate-900/90 dark:bg-black/90 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-full p-1.5 flex items-center gap-2 transition-all duration-300 animate-in slide-in-from-bottom-10 hover:scale-105">
                <!-- Content injected via JS -->
            </div>
        `;
    }

    updateView() {
        if (!this.isInitialized) return;

        const { activeSource, githubUser } = store.value;
        const { activePopover, loading, isLoggingIn, loginError } = this.state;
        const repoName = activeSource?.name || "Local Garden";
        
        const isLocal = activeSource && (activeSource.type === 'local' || (activeSource.url && activeSource.url.startsWith('local://')));
        
        const isContributor = isLocal || !!githubUser;
        const ui = store.ui;

        const renderKey = JSON.stringify({
            activePopover, loading, isLoggingIn, loginError,
            sourceId: activeSource?.id,
            sourceName: activeSource?.name,
            user: githubUser?.login,
            isLocal,
            hasGithubUser: !!githubUser
        });

        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;

        // 1. Update Popover
        const popoverSlot = this.querySelector('#popover-slot');
        if (activePopover === 'login' && !githubUser) {
            popoverSlot.innerHTML = `
                <div class="bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl p-4 w-80 animate-in slide-in-from-bottom-4 fade-in origin-bottom">
                    <h4 class="text-xs font-black text-white uppercase tracking-widest mb-3">${ui.conConnectRepo || "Connect Repository"}</h4>
                    <input id="inp-gh-token" type="password" placeholder="${ui.conTokenPlaceholder || "GitHub Personal Token..."}" class="w-full bg-black/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white mb-2 focus:border-blue-500 outline-none">
                    ${loginError ? `<p class="text-xs text-red-400 mb-2 font-bold">${loginError}</p>` : ''}
                    <button id="btn-login-action" class="w-full py-2 bg-white text-black font-bold rounded-lg text-xs hover:bg-slate-200">
                        ${isLoggingIn ? (ui.syncing || 'Connecting...') : (ui.conLogin || 'Connect')}
                    </button>
                    <p class="text-[9px] text-slate-500 mt-2">${ui.conTokenScope || "Requires 'repo' scope token."}</p>
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
                <button id="btn-save-all" class="${itemBaseClass} ${itemActionClass}" title="${ui.conSaveTooltip || "Save Changes"}"><span>💾</span></button>
                <button id="btn-revert" class="${itemBaseClass} ${itemActionClass}" title="${ui.conRevertTooltip || "Undo / Revert"}"><span>↩️</span></button>
                <div class="w-px h-6 bg-white/10 mx-1"></div>
                
                <button id="btn-architect" class="${itemBaseClass} ${itemSpecialClass}" title="${ui.conAiTooltip || "AI Architect"}">
                    <span class="relative">🦉<span class="absolute -top-2 -right-2 text-[10px] transform rotate-12 drop-shadow-md">⛑️</span></span>
                </button>
                
                <button id="btn-governance" class="${itemBaseClass} ${itemBlueClass}" title="${ui.conGovTooltip || "Governance"}"><span>🏛️</span></button>
            `;
        }

        // Logic for Login/Logout Button
        if (!isLocal) {
            if (!githubUser) {
                html += `<button id="btn-login-toggle" class="${btnLoginClass}"><span>${ui.conLoginAction || "Login"}</span></button>`;
            } else {
                html += `<button id="btn-logout" class="${btnLogoutClass}"><span>${ui.conLogout || "Logout"}</span></button>`;
            }
        }

        // EXIT BUTTON (Easy Mobile Access)
        html += `<div class="w-px h-6 bg-white/10 mx-1"></div>`;
        html += `<button id="btn-exit-construct" class="${itemBaseClass} bg-red-600/80 hover:bg-red-500 text-white border-red-400" title="Exit Construction Mode"><span>✕</span></button>`;

        dock.innerHTML = html;

        // Rebind Dock Events
        const bind = (id, fn) => {
            const el = dock.querySelector(id);
            if (el) el.onclick = (e) => { e.stopPropagation(); fn(e); };
        };

        bind('#btn-exit-construct', () => store.toggleConstructionMode());

        if (isContributor) {
            bind('#btn-architect', () => store.setModal({ type: 'sage', mode: 'architect' }));
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
