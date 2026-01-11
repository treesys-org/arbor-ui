
import { store } from '../../store.js';

class ArborModalArcade extends HTMLElement {
    constructor() {
        super();
        this.activeTab = 'games'; // 'games' | 'sources'
        this.discoveredGames = [];
        this.isLoading = false;
    }

    async connectedCallback() {
        await this.loadAllGames();
    }

    async loadAllGames() {
        this.isLoading = true;
        this.render();
        
        this.discoveredGames = [];
        const repos = store.userStore.state.gameRepos || [];
        
        const promises = repos.map(async (repo) => {
            try {
                // If local path, ensure no cache issues or strict CORS if not served properly
                // For GitHub/Remote, normal fetch.
                const res = await fetch(repo.url, { cache: 'no-cache' });
                if (res.ok) {
                    const games = await res.json();
                    
                    // Normalize relative paths in the manifest based on manifest URL
                    const repoBase = repo.url.substring(0, repo.url.lastIndexOf('/') + 1);
                    
                    const normalize = (path) => {
                        if (!path) return '';
                        if (path.startsWith('http') || path.startsWith('//')) return path;
                        if (path.startsWith('./')) return repoBase + path.substring(2);
                        if (path.startsWith('/')) return repoBase + path.substring(1); 
                        return repoBase + path;
                    };

                    const tagged = games.map(g => ({ 
                        ...g, 
                        path: normalize(g.path || g.url), // Normalized absolute URL
                        repoId: repo.id, 
                        repoName: repo.name,
                        isOfficial: repo.isOfficial
                    }));
                    
                    this.discoveredGames.push(...tagged);
                } else {
                    console.warn(`Repo ${repo.name} fetch error: ${res.status}`);
                }
            } catch (e) {
                console.warn(`Failed to load repo ${repo.name}`, e);
            }
        });

        await Promise.all(promises);
        this.isLoading = false;
        this.render();
    }

    close() {
        store.setModal(null);
    }

    getCurrentContext() {
        const { previewNode, selectedNode, data } = store.value;
        let node = previewNode || selectedNode;
        if (node) {
            if (node.type === 'leaf' || node.type === 'exam') {
                if (node.parentId) node = store.findNode(node.parentId) || node;
            }
        } else {
            node = data; 
        }
        return node;
    }

    launchGame(gameUrl) {
        const activeSource = store.value.activeSource;
        if (!activeSource) {
            alert("No active knowledge tree selected.");
            return;
        }

        const contextNode = this.getCurrentContext();
        
        // Context Parameters
        const treeUrl = encodeURIComponent(activeSource.url);
        const lang = store.value.lang || 'EN';
        const modulePath = contextNode?.apiPath ? encodeURIComponent(contextNode.apiPath) : ''; 

        let finalUrl = gameUrl;
        const separator = finalUrl.includes('?') ? '&' : '?';
        
        finalUrl += `${separator}source=${treeUrl}&lang=${lang}`;
        if (modulePath) {
            finalUrl += `&module=${modulePath}`;
        }

        window.open(finalUrl, '_blank');
    }

    addCustomGame() {
        const url = this.querySelector('#inp-custom-game').value.trim();
        if (!url) return;
        let name = "Custom Game";
        try { name = new URL(url).hostname; } catch(e){}
        store.userStore.addGame(name, url);
        this.render();
    }

    addRepo() {
        const url = this.querySelector('#inp-repo-url').value.trim();
        if (!url) return;
        store.userStore.addGameRepo(url);
        this.loadAllGames(); // Reload to fetch new repo
    }

    removeRepo(id) {
        if(confirm("Remove this repository?")) {
            store.userStore.removeGameRepo(id);
            this.loadAllGames();
        }
    }

    render() {
        const ui = store.ui;
        
        // 1. Combine Games (Discovered + Manual)
        const manualGames = store.userStore.state.installedGames.map(g => ({
            ...g,
            repoName: 'Manual Install',
            isManual: true,
            path: g.url // unifying property
        }));
        
        const allGames = [...this.discoveredGames, ...manualGames];
        const repos = store.userStore.state.gameRepos;

        // Context Info
        const contextNode = this.getCurrentContext();
        const contextName = contextNode?.name || "Root (All Content)";
        const contextIcon = contextNode?.icon || "🌳";

        // --- TABS ---
        const tabsHtml = `
            <div class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0">
                <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.activeTab === 'games' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-games">
                    🎮 ${ui.arcadeFeatured || "Games"}
                </button>
                <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.activeTab === 'sources' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-sources">
                    📡 ${ui.navSources || "Sources"}
                </button>
            </div>
        `;

        // --- LIST VIEW (GAMES) ---
        let contentHtml = '';
        
        if (this.activeTab === 'games') {
            if (this.isLoading) {
                contentHtml = `<div class="p-12 text-center text-slate-400 animate-pulse">Loading Arcade...</div>`;
            } else if (allGames.length === 0) {
                contentHtml = `<div class="p-8 text-center text-slate-400 italic">No games found. Check your sources.</div>`;
            } else {
                contentHtml = allGames.map(g => `
                    <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:shadow-md transition-shadow group mb-3">
                        <div class="flex items-center gap-4 min-w-0">
                            <div class="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-2xl flex items-center justify-center border border-orange-200 dark:border-orange-800">
                                ${g.icon || '🕹️'}
                            </div>
                            <div class="min-w-0">
                                <h4 class="font-bold text-slate-800 dark:text-white truncate flex items-center gap-2">
                                    ${g.name}
                                    ${g.isOfficial ? '<span class="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase">Official</span>' : ''}
                                </h4>
                                <p class="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px] md:max-w-xs">${g.description || g.path}</p>
                                <p class="text-[9px] text-slate-400 mt-0.5 uppercase tracking-wide">${g.repoName}</p>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button class="btn-launch px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-transform" data-url="${g.path}">
                                ${ui.arcadePlay || "Play"}
                            </button>
                            ${g.isManual ? `
                            <button class="btn-remove-game px-2 py-2 text-slate-400 hover:text-red-500 transition-colors" data-id="${g.id}">✕</button>
                            ` : ''}
                        </div>
                    </div>
                `).join('');
                
                // Add Custom Game Input at bottom of list
                contentHtml += `
                <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">Add Single Game URL</label>
                    <div class="flex gap-2">
                        <input id="inp-custom-game" type="text" placeholder="https://..." class="flex-1 bg-slate-100 dark:bg-slate-950 border-none rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 dark:text-white">
                        <button id="btn-add-custom" class="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl font-bold text-sm">
                            +
                        </button>
                    </div>
                </div>
                `;
            }
        } 
        
        // --- LIST VIEW (SOURCES) ---
        else if (this.activeTab === 'sources') {
            contentHtml = `
            <div class="space-y-3 mb-6">
                ${repos.map(r => `
                    <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                        <div class="flex items-center gap-3 overflow-hidden">
                            <div class="text-xl">📦</div>
                            <div class="min-w-0">
                                <h4 class="font-bold text-sm text-slate-800 dark:text-white truncate">
                                    ${r.name || 'Repository'}
                                    ${r.isOfficial ? '<span class="ml-2 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded uppercase">Verified</span>' : ''}
                                </h4>
                                <p class="text-[10px] text-slate-400 truncate font-mono">${r.url}</p>
                            </div>
                        </div>
                        ${!r.isOfficial ? `
                        <button class="btn-remove-repo px-2 py-1 text-slate-400 hover:text-red-500 transition-colors" data-id="${r.id}">✕</button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>

            <div class="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
                <label class="block text-xs font-bold text-blue-800 dark:text-blue-300 uppercase mb-2">Add Repository URL</label>
                <div class="flex gap-2">
                    <input id="inp-repo-url" type="text" placeholder="https://.../manifest.json" class="flex-1 bg-white dark:bg-slate-950 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white">
                    <button id="btn-add-repo" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold shadow-md active:scale-95 transition-transform text-sm">
                        Add
                    </button>
                </div>
                <p class="text-[10px] text-blue-400 mt-2">
                    A repository is a <code>manifest.json</code> file containing a list of games.
                </p>
            </div>
            `;
        }

        // --- MAIN RENDER ---
        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full relative overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <button class="btn-close absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>

                <div class="p-6 h-full flex flex-col">
                    <div class="flex items-center gap-3 mb-2 shrink-0">
                        <span class="text-3xl">🎮</span>
                        <div>
                            <h2 class="text-xl font-black dark:text-white leading-none">${ui.arcadeTitle || "Arbor Arcade"}</h2>
                            <p class="text-xs text-slate-500 mt-1">${ui.arcadeDesc || "Context-aware educational games."}</p>
                        </div>
                    </div>
                    
                    <!-- Context Indicator -->
                    <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 flex items-center justify-between shrink-0">
                        <div class="flex items-center gap-2 overflow-hidden">
                            <span class="text-xl">${contextIcon}</span>
                            <div class="min-w-0">
                                <p class="text-[10px] uppercase font-bold text-blue-400 dark:text-blue-300 tracking-wider">${ui.arcadeContext || "Target Context"}</p>
                                <p class="font-bold text-blue-900 dark:text-blue-100 text-sm truncate">${contextName}</p>
                            </div>
                        </div>
                        <div class="text-[10px] text-blue-400 px-2 text-right leading-tight hidden sm:block">
                            Select a topic on the map<br>to change context.
                        </div>
                    </div>

                    ${tabsHtml}

                    <div class="flex-1 overflow-y-auto custom-scrollbar p-1 py-4">
                        ${contentHtml}
                    </div>
                </div>
            </div>
        </div>`;

        // Bindings
        this.querySelector('.btn-close').onclick = () => this.close();
        
        this.querySelector('#tab-games').onclick = () => { this.activeTab = 'games'; this.render(); };
        this.querySelector('#tab-sources').onclick = () => { this.activeTab = 'sources'; this.render(); };
        
        const btnAddCustom = this.querySelector('#btn-add-custom');
        if(btnAddCustom) btnAddCustom.onclick = () => this.addCustomGame();

        const btnAddRepo = this.querySelector('#btn-add-repo');
        if(btnAddRepo) btnAddRepo.onclick = () => this.addRepo();

        this.querySelectorAll('.btn-launch').forEach(b => {
            b.onclick = (e) => this.launchGame(e.currentTarget.dataset.url);
        });

        this.querySelectorAll('.btn-remove-game').forEach(b => {
            b.onclick = (e) => {
                store.userStore.removeGame(e.currentTarget.dataset.id);
                this.render();
            };
        });

        this.querySelectorAll('.btn-remove-repo').forEach(b => {
            b.onclick = (e) => this.removeRepo(e.currentTarget.dataset.id);
        });
    }
}
customElements.define('arbor-modal-arcade', ArborModalArcade);
