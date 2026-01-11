
import { store } from '../../store.js';

class ArborModalArcade extends HTMLElement {
    constructor() {
        super();
        this.activeTab = 'games'; // 'games' | 'sources'
        this.discoveredGames = [];
        this.isLoading = false;
        
        // Setup State
        this.selectedGame = null;
        this.selectedNodeId = null;
        this.filterText = '';
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
                const res = await fetch(repo.url, { cache: 'no-cache' });
                if (res.ok) {
                    const games = await res.json();
                    
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
                        path: normalize(g.path || g.url), 
                        repoId: repo.id, 
                        repoName: repo.name,
                        isOfficial: repo.isOfficial
                    }));
                    
                    this.discoveredGames.push(...tagged);
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

    // Enter Setup Mode
    prepareLaunch(game) {
        this.selectedGame = game;
        
        // Auto-select current context
        const current = this.getCurrentContext();
        if (current) {
            this.selectedNodeId = current.id;
        } else {
            // Default to root
            const root = store.value.data;
            this.selectedNodeId = root ? root.id : null;
        }
        
        this.render();
    }

    cancelLaunch() {
        this.selectedGame = null;
        this.selectedNodeId = null;
        this.filterText = '';
        this.render();
    }

    getCurrentContext() {
        const { previewNode, selectedNode, data } = store.value;
        return previewNode || selectedNode || data;
    }

    launchGame() {
        if (!this.selectedGame || !this.selectedNodeId) return;
        
        const activeSource = store.value.activeSource;
        const targetNode = store.findNode(this.selectedNodeId);
        
        if (!activeSource || !targetNode) return;

        const treeUrl = encodeURIComponent(activeSource.url);
        const lang = store.value.lang || 'EN';
        
        // Determine path for legacy games that might parse URL manually
        const modulePath = targetNode.apiPath || targetNode.contentPath || ''; 
        const encodedPath = encodeURIComponent(modulePath);

        let finalUrl = this.selectedGame.path;
        const separator = finalUrl.includes('?') ? '&' : '?';
        
        // Standard Context Parameters
        finalUrl += `${separator}source=${treeUrl}&lang=${lang}`;
        if (encodedPath) {
            finalUrl += `&module=${encodedPath}`;
        }
        
        // CRITICAL: Include ID for the internal bridge to find the object in memory
        finalUrl += `&moduleId=${this.selectedNodeId}`;

        store.setModal({ 
            type: 'game-player', 
            url: finalUrl,
            title: this.selectedGame.name,
            moduleId: this.selectedNodeId 
        });
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
        this.loadAllGames(); 
    }

    removeRepo(id) {
        if(confirm("Remove this repository?")) {
            store.userStore.removeGameRepo(id);
            this.loadAllGames();
        }
    }

    // Flattens the tree for the list view
    getFlatNodes() {
        const root = store.value.data;
        if (!root) return [];
        
        const nodes = [];
        const traverse = (n, depth) => {
            // Add if it matches filter (or if filter is empty)
            if (!this.filterText || n.name.toLowerCase().includes(this.filterText.toLowerCase())) {
                nodes.push({ ...n, depth });
            }
            if (n.children) {
                n.children.forEach(c => traverse(c, depth + 1));
            }
        };
        
        traverse(root, 0);
        return nodes;
    }

    render() {
        const ui = store.ui;
        
        // 1. SETUP VIEW (Pre-Launch)
        if (this.selectedGame) {
            this.renderSetup(ui);
            return;
        }

        // 2. MAIN ARCADE VIEW
        const manualGames = store.userStore.state.installedGames.map(g => ({
            ...g, repoName: 'Manual Install', isManual: true, path: g.url 
        }));
        
        const allGames = [...this.discoveredGames, ...manualGames];
        const repos = store.userStore.state.gameRepos;

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
                contentHtml = allGames.map((g, idx) => `
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
                            <button class="btn-prepare px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-transform" 
                                    data-idx="${idx}" data-manual="${g.isManual}">
                                ${ui.arcadePlay || "Play"}
                            </button>
                            ${g.isManual ? `
                            <button class="btn-remove-game px-2 py-2 text-slate-400 hover:text-red-500 transition-colors" data-id="${g.id}">✕</button>
                            ` : ''}
                        </div>
                    </div>
                `).join('');
                
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
            </div>
            `;
        }

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full relative overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <button class="btn-close absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>

                <div class="p-6 h-full flex flex-col">
                    <div class="flex items-center gap-3 mb-4 shrink-0">
                        <span class="text-3xl">🎮</span>
                        <div>
                            <h2 class="text-xl font-black dark:text-white leading-none">${ui.arcadeTitle || "Arbor Arcade"}</h2>
                            <p class="text-xs text-slate-500 mt-1">${ui.arcadeDesc}</p>
                        </div>
                    </div>
                    
                    ${tabsHtml}

                    <div class="flex-1 overflow-y-auto custom-scrollbar p-1 py-4">
                        ${contentHtml}
                    </div>
                </div>
            </div>
        </div>`;

        this.bindMainEvents();
    }

    // --- SETUP RENDERER (Detailed Selection) ---
    renderSetup(ui) {
        const nodeList = this.getFlatNodes();
        const selectedNode = nodeList.find(n => n.id === this.selectedNodeId);
        
        // Increased limit to show more items, especially children in deep trees
        const filteredNodes = nodeList.slice(0, 300); 

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full h-[85vh] relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <button class="btn-cancel-launch absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>

                <div class="p-6 flex-1 flex flex-col h-full overflow-hidden">
                    <div class="text-center mb-6 shrink-0">
                        <div class="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-2xl mx-auto flex items-center justify-center text-3xl mb-3 border-2 border-orange-200 dark:border-orange-800">
                            ${this.selectedGame.icon || '🕹️'}
                        </div>
                        <h2 class="text-xl font-black text-slate-800 dark:text-white">${this.selectedGame.name}</h2>
                        <p class="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">${ui.arcadeSetup || "Game Setup"}</p>
                    </div>

                    <!-- MODULE SELECTOR -->
                    <div class="flex-1 flex flex-col min-h-0">
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">${ui.arcadeSelectModule || "Select Context"}</label>
                        
                        <div class="relative mb-2">
                            <span class="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
                            <input id="inp-filter-context" type="text" placeholder="${ui.searchPlaceholder || "Search..."}" 
                                class="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl py-2 pl-9 pr-4 text-sm font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                                value="${this.filterText}" autocomplete="off">
                        </div>

                        <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800 p-2 space-y-1">
                            ${filteredNodes.map(n => {
                                const isSelected = this.selectedNodeId === n.id;
                                const isLeaf = n.type === 'leaf' || n.type === 'exam';
                                
                                // Distinct styling for leaves vs modules to make selection easier
                                let icon = n.icon;
                                if (!icon) icon = isLeaf ? '📄' : '📁';
                                
                                const typeBadge = isLeaf 
                                    ? `<span class="text-[9px] bg-purple-100 text-purple-700 px-1.5 rounded uppercase font-bold tracking-wider">Lesson</span>`
                                    : `<span class="text-[9px] bg-slate-200 text-slate-600 px-1.5 rounded uppercase font-bold tracking-wider">Module</span>`;

                                return `
                                <button class="btn-select-node w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors text-sm
                                    ${isSelected ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 ring-1 ring-orange-500' : 'hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}"
                                    data-id="${n.id}">
                                    <span class="text-lg">${icon}</span>
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2">
                                            <p class="font-bold truncate leading-tight">${n.name}</p>
                                            ${typeBadge}
                                        </div>
                                        <p class="text-[10px] opacity-60 truncate">${n.path || 'No path'}</p>
                                    </div>
                                    ${isSelected ? '<span class="ml-auto text-orange-500 font-bold">✔</span>' : ''}
                                </button>
                                `;
                            }).join('')}
                            
                            ${filteredNodes.length === 0 ? `<div class="p-4 text-center text-xs text-slate-400">No matching content found. Try expanding the map first.</div>` : ''}
                        </div>
                    </div>

                    <div class="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                        <button id="btn-start-game" class="w-full py-4 bg-orange-600 text-white font-black text-lg rounded-2xl shadow-xl hover:bg-orange-500 active:scale-95 transition-all flex items-center justify-center gap-2" ${!this.selectedNodeId ? 'disabled style="opacity:0.5"' : ''}>
                            <span>🚀</span> ${ui.arcadeStart || "START GAME"}
                        </button>
                        <p class="text-[10px] text-center text-slate-400 mt-2">${ui.arcadeDisclaimer || "⚠️ Uses AI"}</p>
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-cancel-launch').onclick = () => this.cancelLaunch();
        
        const filterInp = this.querySelector('#inp-filter-context');
        if(filterInp) {
            filterInp.focus();
            filterInp.oninput = (e) => {
                this.filterText = e.target.value;
                this.render(); // Re-render list
                setTimeout(() => {
                    const el = this.querySelector('#inp-filter-context');
                    if(el) {
                        el.focus(); 
                        el.selectionStart = el.selectionEnd = el.value.length;
                    }
                }, 0);
            };
        }

        this.querySelectorAll('.btn-select-node').forEach(b => {
            b.onclick = (e) => {
                this.selectedNodeId = e.currentTarget.dataset.id;
                this.render();
            };
        });

        const btnStart = this.querySelector('#btn-start-game');
        if(btnStart && !btnStart.disabled) btnStart.onclick = () => this.launchGame();
    }

    bindMainEvents() {
        this.querySelector('.btn-close').onclick = () => this.close();
        this.querySelector('#tab-games').onclick = () => { this.activeTab = 'games'; this.render(); };
        this.querySelector('#tab-sources').onclick = () => { this.activeTab = 'sources'; this.render(); };
        
        const btnAddCustom = this.querySelector('#btn-add-custom');
        if(btnAddCustom) btnAddCustom.onclick = () => this.addCustomGame();

        const btnAddRepo = this.querySelector('#btn-add-repo');
        if(btnAddRepo) btnAddRepo.onclick = () => this.addRepo();

        this.querySelectorAll('.btn-prepare').forEach(b => {
            b.onclick = (e) => {
                const isManual = e.currentTarget.dataset.manual === 'true';
                const idx = parseInt(e.currentTarget.dataset.idx);
                const manualGames = store.userStore.state.installedGames.map(g => ({...g, isManual: true, path: g.url}));
                const allGames = [...this.discoveredGames, ...manualGames];
                this.prepareLaunch(allGames[idx]);
            };
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
