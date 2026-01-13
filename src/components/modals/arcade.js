
import { store } from '../../store.js';

class ArborModalArcade extends HTMLElement {
    constructor() {
        super();
        this.activeTab = 'games'; // 'games' | 'sources' | 'storage'
        this.discoveredGames = [];
        this.isLoading = false;
        this.isPreparingContext = false;
        
        // Setup State
        this.selectedGame = null;
        this.selectedNodeId = null;
        this.filterText = '';
        this.lastRenderKey = null;
    }

    async connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
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

    // --- RECURSIVE LOADER ---
    async ensureTreeLoaded(node, depth = 0) {
        // Safety limit to prevent infinite loading on massive trees
        if (depth > 4) return; 

        if (node.type === 'branch' || node.type === 'root') {
            if (node.hasUnloadedChildren) {
                await store.loadNodeChildren(node);
            }
            if (node.children) {
                // Load children in parallel
                await Promise.all(node.children.map(c => this.ensureTreeLoaded(c, depth + 1)));
            }
        }
    }

    // Enter Setup Mode
    async prepareLaunch(game) {
        this.selectedGame = game;
        this.isPreparingContext = true;
        this.render(); // Show loading state

        // 1. Ensure the tree is loaded so the user can select anything
        const root = store.value.data;
        if (root) {
            await this.ensureTreeLoaded(root);
        }

        // 2. Auto-select current context
        const current = this.getCurrentContext();
        if (current) {
            if (current.type === 'exam') {
                this.selectedNodeId = current.parentId;
            } else {
                this.selectedNodeId = current.id;
            }
        } else {
            this.selectedNodeId = root ? root.id : null;
        }
        
        this.isPreparingContext = false;
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
        const lang = store.value.lang;
        const theme = store.value.theme;
        const installedGamesCount = store.userStore.state.installedGames.length;
        const reposCount = store.userStore.state.gameRepos.length;
        
        // Storage Stats
        const stats = store.storage.getStats();

        // Anti-Flicker Key
        const renderKey = JSON.stringify({
            lang, theme, 
            tab: this.activeTab,
            loading: this.isLoading,
            preparing: this.isPreparingContext,
            discGames: this.discoveredGames.length,
            instGames: installedGamesCount,
            repos: reposCount,
            selGameId: this.selectedGame ? this.selectedGame.id : null,
            selNode: this.selectedNodeId,
            filter: this.filterText,
            storageUsed: stats.arcade.usedBytes
        });

        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;
        
        // Preserve Focus & Selection State
        const activeId = document.activeElement ? document.activeElement.id : null;
        const selectionStart = document.activeElement ? document.activeElement.selectionStart : null;
        const selectionEnd = document.activeElement ? document.activeElement.selectionEnd : null;

        // 1. SETUP VIEW (Pre-Launch)
        if (this.selectedGame) {
            this.renderSetup(ui);
        } else {
            // 2. MAIN ARCADE VIEW
            this.renderMain(ui, stats);
        }

        // Restore Focus
        if (activeId) {
            const el = document.getElementById(activeId);
            if (el) {
                el.focus();
                if (selectionStart !== null && selectionEnd !== null && el.setSelectionRange) {
                    el.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        }
    }

    renderMain(ui, stats) {
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
                <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.activeTab === 'storage' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-storage">
                    💾 Data
                </button>
            </div>
        `;

        // --- CONTENT ---
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
        else if (this.activeTab === 'storage') {
            const usagePercent = stats.arcade.percent;
            const barColor = usagePercent > 90 ? 'bg-red-500' : (usagePercent > 70 ? 'bg-orange-500' : 'bg-purple-500');
            
            contentHtml = `
            <div class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">Total Usage</span>
                    <span class="text-xs font-mono text-slate-500">${stats.arcade.usedFmt} / 3.5 MB</span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden mb-1">
                    <div class="${barColor} h-2 rounded-full transition-all duration-500" style="width: ${usagePercent}%"></div>
                </div>
                ${usagePercent > 90 ? '<p class="text-[10px] text-red-500 font-bold mt-1 text-center">⚠️ Storage Full. Delete some saves to play new games.</p>' : ''}
            </div>
            
            <div class="flex justify-between items-center mb-3">
                <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">Saved Games</h3>
                ${stats.arcade.games.length > 0 ? `<button id="btn-delete-all-saves" class="text-[10px] text-red-500 hover:text-red-700 font-bold border border-red-200 dark:border-red-900/30 px-2 py-1 rounded bg-red-50 dark:bg-red-900/10">Delete All</button>` : ''}
            </div>

            <div class="space-y-2">
                ${stats.arcade.games.length === 0 ? `<div class="p-8 text-center text-slate-400 italic text-sm">No game data saved.</div>` : 
                  stats.arcade.games.map(g => `
                    <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl group hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                        <div class="min-w-0 pr-4">
                            <h4 class="font-bold text-sm text-slate-800 dark:text-white truncate">${g.id}</h4>
                            <p class="text-[10px] text-slate-400 font-mono">${g.sizeFmt} • Updated: ${new Date(g.updated).toLocaleDateString()}</p>
                        </div>
                        <button class="btn-delete-save px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors" data-id="${g.id}">
                            Delete
                        </button>
                    </div>
                `).join('')}
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
        if (this.isPreparingContext) {
             this.innerHTML = `
             <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
                <div class="bg-white dark:bg-slate-900 rounded-3xl p-8 flex flex-col items-center">
                    <div class="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p class="font-bold text-slate-600 dark:text-slate-300">Scanning Knowledge Tree...</p>
                </div>
             </div>
             `;
             return;
        }

        const nodeList = this.getFlatNodes();
        const filteredNodes = nodeList.slice(0, 500); 

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
                                const isLeaf = n.type === 'leaf';
                                const isExam = n.type === 'exam';
                                
                                let icon = n.icon;
                                if (!icon) icon = isLeaf ? '📄' : (isExam ? '⚔️' : '📁');
                                
                                let typeBadge = `<span class="text-[9px] bg-slate-200 text-slate-600 px-1.5 rounded uppercase font-bold tracking-wider">Module</span>`;
                                if (isLeaf) typeBadge = `<span class="text-[9px] bg-purple-100 text-purple-700 px-1.5 rounded uppercase font-bold tracking-wider">Lesson</span>`;
                                if (isExam) typeBadge = `<span class="text-[9px] bg-red-100 text-red-700 px-1.5 rounded uppercase font-bold tracking-wider">Exam</span>`;
                                
                                const indentClass = `pl-${Math.min(n.depth * 4, 12) + 3}`;
                                
                                const isDisabled = isExam;
                                const actionClass = isDisabled 
                                    ? 'opacity-40 cursor-not-allowed grayscale bg-slate-50 dark:bg-slate-900' 
                                    : 'btn-select-node hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer';
                                
                                const activeClass = isSelected 
                                    ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 ring-1 ring-orange-500' 
                                    : '';

                                return `
                                <button class="w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors text-sm ${indentClass} ${actionClass} ${activeClass}"
                                    ${!isDisabled ? `data-id="${n.id}"` : 'disabled'}>
                                    <span class="text-lg opacity-70">${icon}</span>
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2">
                                            <p class="font-bold truncate leading-tight">${n.name}</p>
                                            ${typeBadge}
                                        </div>
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
            filterInp.oninput = (e) => {
                this.filterText = e.target.value;
                this.render(); // Re-render list
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
        this.querySelector('#tab-storage').onclick = () => { this.activeTab = 'storage'; this.render(); };
        
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
        
        // STORAGE TAB HANDLERS
        this.querySelectorAll('.btn-delete-save').forEach(b => {
            b.onclick = (e) => {
                if(confirm('Delete save data for this game?')) {
                    store.storage.clearGameData(e.currentTarget.dataset.id);
                    this.render();
                }
            };
        });
        
        const btnDelAll = this.querySelector('#btn-delete-all-saves');
        if(btnDelAll) {
            btnDelAll.onclick = () => {
                if(confirm('Delete ALL Arcade save data? This cannot be undone.')) {
                    store.storage.clearAll();
                    this.render();
                }
            };
        }
    }
}
customElements.define('arbor-modal-arcade', ArborModalArcade);
