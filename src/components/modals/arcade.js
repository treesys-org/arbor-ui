
import { store } from '../../store.js';

class ArborModalArcade extends HTMLElement {
    constructor() {
        super();
        this.activeTab = 'games'; // 'games' | 'storage' | 'garden'
        this.discoveredGames = [];
        this.isLoading = false;
        this.isPreparingContext = false;
        
        // Setup State
        this.selectedGame = null;
        this.selectedNodeId = null;
        
        // New State for "Watering Mode"
        this.wateringTargetId = null; 
        
        this.filterText = '';
        this.isInitialized = false;
    }

    async connectedCallback() {
        if (!this.isInitialized) {
            this.renderSkeleton();
            this.isInitialized = true;
        }
        this.updateContent();
        
        this.storeListener = () => this.updateContent();
        store.addEventListener('state-change', this.storeListener);
        
        await this.loadAllGames();
    }
    
    disconnectedCallback() {
        store.removeEventListener('state-change', this.storeListener);
    }

    async loadAllGames() {
        this.isLoading = true;
        this.updateContent();
        
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
        this.updateContent();
    }

    close() {
        store.setModal(null);
    }

    renderSkeleton() {
        const ui = store.ui;
        
        // INCREASED WIDTH to max-w-6xl and height to 700px
        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-6xl w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto" style="height: 700px; max-height: 90vh;">
                <button class="btn-close absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>

                <div class="p-6 h-full flex flex-col relative">
                    
                    <!-- Header (Setup Mode Only) -->
                    <div id="setup-header" class="hidden text-center mb-6 shrink-0"></div>

                    <!-- Header (Main Mode Only) -->
                    <div id="main-header" class="flex items-center gap-3 mb-4 shrink-0">
                        <span class="text-3xl">🎮</span>
                        <div>
                            <h2 class="text-xl font-black dark:text-white leading-none">${ui.arcadeTitle || "Arbor Arcade"}</h2>
                            <p class="text-xs text-slate-500 mt-1">${ui.arcadeDesc}</p>
                        </div>
                    </div>
                    
                    <!-- Tabs (Main Mode Only) -->
                    <div id="main-tabs" class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0">
                        <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors border-transparent text-slate-400 hover:text-slate-600" id="tab-games">
                            🎮 ${ui.arcadeFeatured || "Games"}
                        </button>
                        <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors border-transparent text-slate-400 hover:text-slate-600" id="tab-garden">
                            🍂 ${ui.arcadeTabCare || "Care"}
                        </button>
                        <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors border-transparent text-slate-400 hover:text-slate-600" id="tab-storage">
                            💾 ${ui.arcadeTabStorage || "Data"}
                        </button>
                    </div>

                    <!-- Content Area -->
                    <div id="modal-content" class="flex-1 overflow-y-auto custom-scrollbar p-1 py-4 flex flex-col min-h-0">
                        <!-- Dynamic -->
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => {
            if(this.selectedGame) this.cancelLaunch();
            else this.close();
        };
        
        this.querySelector('#tab-games').onclick = () => { this.activeTab = 'games'; this.updateContent(); };
        this.querySelector('#tab-garden').onclick = () => { this.activeTab = 'garden'; this.updateContent(); };
        this.querySelector('#tab-storage').onclick = () => { this.activeTab = 'storage'; this.updateContent(); };
        
        // Delegate events
        this.addEventListener('click', (e) => this.handleDelegatedClick(e));
        this.addEventListener('input', (e) => {
            if(e.target.id === 'inp-filter-context') {
                this.filterText = e.target.value;
                this.updateContent();
            }
        });
    }

    updateContent() {
        if (!this.isInitialized) return;
        
        const ui = store.ui;
        const mainHeader = this.querySelector('#main-header');
        const setupHeader = this.querySelector('#setup-header');
        const mainTabs = this.querySelector('#main-tabs');
        const content = this.querySelector('#modal-content');
        
        // SETUP MODE vs MAIN MODE
        if (this.selectedGame) {
            // SHOW SETUP
            mainHeader.classList.add('hidden');
            mainTabs.classList.add('hidden');
            setupHeader.classList.remove('hidden');
            
            setupHeader.innerHTML = `
                <div class="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-2xl mx-auto flex items-center justify-center text-3xl mb-3 border-2 border-orange-200 dark:border-orange-800">
                    ${this.selectedGame.icon || '🕹️'}
                </div>
                <h2 class="text-xl font-black text-slate-800 dark:text-white">${this.selectedGame.name}</h2>
                <p class="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">${ui.arcadeSetup || "Game Setup"}</p>
            `;
            
            this.renderSetupContent(content, ui);
        } else {
            // SHOW MAIN
            mainHeader.classList.remove('hidden');
            mainTabs.classList.remove('hidden');
            setupHeader.classList.add('hidden');
            
            // Update Tab Styles
            const tGames = this.querySelector('#tab-games');
            const tGarden = this.querySelector('#tab-garden');
            const tStorage = this.querySelector('#tab-storage');
            
            const activeClass = "border-orange-500 text-orange-600 dark:text-orange-400";
            const inactiveClass = "border-transparent text-slate-400 hover:text-slate-600";
            
            tGames.className = `flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.activeTab === 'games' ? activeClass : inactiveClass}`;
            tGarden.className = `flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.activeTab === 'garden' ? 'border-red-500 text-red-600 dark:text-red-400' : inactiveClass}`;
            tStorage.className = `flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.activeTab === 'storage' ? 'border-purple-500 text-purple-600 dark:text-purple-400' : inactiveClass}`;
            
            // Render Content
            if (this.activeTab === 'games') this.renderGamesList(content, ui);
            if (this.activeTab === 'garden') this.renderGarden(content, ui);
            if (this.activeTab === 'storage') this.renderStorage(content, ui);
        }
    }

    renderGamesList(container, ui) {
        if (this.isLoading) {
            container.innerHTML = `<div class="p-12 text-center text-slate-400 animate-pulse">${ui.loading || 'Loading...'}</div>`;
            return;
        }
        
        let html = '';
        
        // Watering Banner
        if (this.wateringTargetId) {
            const targetNode = store.findNode(this.wateringTargetId);
            const targetName = targetNode ? targetNode.name : "Unknown Lesson";
            html += `
            <div class="bg-blue-600 text-white p-4 rounded-xl shadow-lg mb-4 flex items-center justify-center md:justify-between animate-in slide-in-from-top-2 flex-wrap gap-2">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-xl">💧</div>
                    <div>
                        <p class="text-[10px] uppercase font-bold opacity-80">${ui.arcadeWateringMission || 'Watering Mission'}</p>
                        <p class="font-bold text-sm">${ui.arcadeReviewTarget || 'Select a game to review:'} <span class="underline">${targetName}</span></p>
                    </div>
                </div>
                <button data-action="cancel-watering" class="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">${ui.cancel || 'Cancel'}</button>
            </div>`;
        }

        const manualGames = store.userStore.state.installedGames.map(g => ({
            ...g, repoName: 'Manual Install', isManual: true, path: g.url 
        }));
        const allGames = [...this.discoveredGames, ...manualGames];

        if (allGames.length === 0) {
            html += `<div class="p-8 text-center text-slate-400 italic">${ui.noResults || 'No games found.'}</div>`;
        } else {
            html += allGames.map((g, idx) => `
                <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border ${this.wateringTargetId ? 'border-blue-200 dark:border-blue-900/30' : 'border-slate-200 dark:border-slate-700'} rounded-2xl hover:shadow-md transition-shadow group mb-3">
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
                        <button class="px-4 py-2 ${this.wateringTargetId ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-900 dark:bg-white hover:scale-105'} text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-lg transition-all active:scale-95" 
                                data-action="prepare" data-idx="${idx}" data-manual="${g.isManual}">
                            ${this.wateringTargetId ? (ui.arcadeWaterHere || "Water Here") : (ui.arcadePlay || "Play")}
                        </button>
                        ${g.isManual ? `
                        <button class="px-2 py-2 text-slate-400 hover:text-red-500 transition-colors" data-action="remove-game" data-id="${g.id}">✕</button>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        }
        
        // Add Custom
        html += `
        <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">${ui.arcadeAdd || "Add Game URL"}</label>
            <div class="flex gap-2">
                <input id="inp-custom-game" type="text" placeholder="${ui.arcadePlaceholder || "https://..."}" class="flex-1 bg-slate-100 dark:bg-slate-950 border-none rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 dark:text-white">
                <button data-action="add-custom" class="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl font-bold text-sm">
                    +
                </button>
            </div>
        </div>`;
        
        container.innerHTML = html;
    }

    renderGarden(container, ui) {
        const memoryData = store.userStore.state.memory || {};
        const dueIds = [];
        const healthyIds = [];
        const now = Date.now();

        // Sort items into buckets
        for (const [id, item] of Object.entries(memoryData)) {
            if (now >= item.dueDate) {
                dueIds.push(id);
            } else {
                healthyIds.push({ id, ...item });
            }
        }
        
        // Sort healthy by next due date (soonest first)
        healthyIds.sort((a, b) => a.dueDate - b.dueDate);

        let html = '';

        if (dueIds.length === 0 && healthyIds.length === 0) {
            html += `
            <div class="p-12 text-center flex flex-col items-center">
                <div class="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-5xl mb-4">🪴</div>
                <h3 class="text-lg font-black text-slate-700 dark:text-white mb-2">${ui.arcadeGardenEmptyTitle || "Garden is Empty"}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 max-w-xs">${ui.arcadeGardenEmptyDesc || "Complete lessons to start cultivating your memory garden."}</p>
            </div>`;
        } else {
            // Withered Section
            if (dueIds.length > 0) {
                html += `
                <div class="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-100 dark:border-red-900/30 mb-4 flex items-center gap-3">
                    <span class="text-2xl">🍂</span>
                    <p class="text-xs text-red-800 dark:text-red-300 font-medium">${ui.arcadeWitheredMsg || "These lessons are fading from memory. Play to refresh them!"}</p>
                </div>
                <div class="space-y-2 mb-6">
                    ${dueIds.map(id => {
                        const node = store.findNode(id);
                        const mem = memoryData[id];
                        const daysOverdue = Math.ceil((now - mem.dueDate) / (1000 * 60 * 60 * 24));
                        const name = node ? node.name : `Module ${id.substring(0, 8)}...`;
                        const icon = node ? (node.icon || '📄') : '📄';
                        const daysText = (ui.arcadeWitheredDays || "Withered {days} days ago").replace('{days}', daysOverdue);
                        
                        return `
                        <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/30 rounded-xl group hover:border-red-400 transition-colors">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center text-xl">
                                    ${icon}
                                </div>
                                <div class="min-w-0">
                                    <h4 class="font-bold text-sm text-slate-800 dark:text-white truncate">${name}</h4>
                                    <p class="text-[10px] text-red-500 font-bold">${daysText}</p>
                                </div>
                            </div>
                            <button data-action="water-node" data-id="${id}" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                                <span>💧</span> ${ui.arcadeWaterBtn || "Water"}
                            </button>
                        </div>`;
                    }).join('')}
                </div>`;
            } else {
                html += `
                <div class="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-900/30 mb-6 flex items-center gap-3">
                    <span class="text-2xl">🌻</span>
                    <div>
                        <p class="text-sm font-black text-green-700 dark:text-green-300">${ui.arcadeHealthyTitle || "Garden is Healthy!"}</p>
                        <p class="text-xs text-green-600 dark:text-green-400">${ui.arcadeHealthyMsg || "All memories are fresh."}</p>
                    </div>
                </div>`;
            }

            // Thriving Section
            if (healthyIds.length > 0) {
                html += `<h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">${ui.arcadeThrivingTitle || "Thriving Plants"} (${healthyIds.length})</h4>`;
                html += `<div class="space-y-2 opacity-80">
                    ${healthyIds.map(item => {
                        const node = store.findNode(item.id);
                        const daysLeft = Math.ceil((item.dueDate - now) / (1000 * 60 * 60 * 24));
                        const name = node ? node.name : `Module ${item.id.substring(0, 8)}...`;
                        const icon = node ? (node.icon || '📄') : '📄';
                        const rainText = (ui.arcadeNextRain || "Next rain in {days} days").replace('{days}', daysLeft);
                        
                        // Strength indicator based on interval
                        let strength = `${ui.arcadeStageSprout || "Sprout"}`;
                        if (item.interval > 30) strength = `${ui.arcadeStageTree || "Tree"}`;
                        else if (item.interval > 14) strength = `${ui.arcadeStageBush || "Bush"}`;
                        else if (item.interval > 7) strength = `${ui.arcadeStagePlant || "Plant"}`;

                        return `
                        <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 flex items-center justify-center text-lg">
                                    ${icon}
                                </div>
                                <div class="min-w-0">
                                    <h4 class="font-bold text-sm text-slate-700 dark:text-slate-300 truncate">${name}</h4>
                                    <p class="text-[10px] text-slate-400">${rainText}</p>
                                </div>
                            </div>
                            <span class="text-[9px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500 font-medium">${strength}</span>
                        </div>`;
                    }).join('')}
                </div>`;
            }
        }
        
        container.innerHTML = html;
    }

    renderStorage(container, ui) {
        const stats = store.storage.getStats();
        const usagePercent = stats.arcade.percent;
        const barColor = usagePercent > 90 ? 'bg-red-500' : (usagePercent > 70 ? 'bg-orange-500' : 'bg-purple-500');
        
        container.innerHTML = `
        <div class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6">
            <div class="flex justify-between items-center mb-2">
                <span class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">${ui.arcadeStorageTotal || "Total Usage"}</span>
                <span class="text-xs font-mono text-slate-500">${stats.arcade.usedFmt} / 3.5 MB</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden mb-1">
                <div class="${barColor} h-2 rounded-full transition-all duration-500" style="width: ${usagePercent}%"></div>
            </div>
            ${usagePercent > 90 ? `<p class="text-[10px] text-red-500 font-bold mt-1 text-center">⚠️ ${ui.arcadeStorageFull || "Storage Full"}</p>` : ''}
        </div>
        
        <div class="flex justify-between items-center mb-3">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">${ui.arcadeSavedGames || "Saved Games"}</h3>
            ${stats.arcade.games.length > 0 ? `<button data-action="delete-all-saves" class="text-[10px] text-red-500 hover:text-red-700 font-bold border border-red-200 dark:border-red-900/30 px-2 py-1 rounded bg-red-50 dark:bg-red-900/10">${ui.arcadeDeleteAll || "Delete All"}</button>` : ''}
        </div>

        <div class="space-y-2">
            ${stats.arcade.games.length === 0 ? `<div class="p-8 text-center text-slate-400 italic text-sm">${ui.noResults || "No game data saved."}</div>` : 
              stats.arcade.games.map(g => `
                <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl group hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                    <div class="min-w-0 pr-4">
                        <h4 class="font-bold text-sm text-slate-800 dark:text-white truncate">${g.id}</h4>
                        <p class="text-[10px] text-slate-400 font-mono">${g.sizeFmt} • Updated: ${new Date(g.updated).toLocaleDateString()}</p>
                    </div>
                    <button data-action="delete-save" data-id="${g.id}" class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors">
                        ${ui.graphDelete || "Delete"}
                    </button>
                </div>
            `).join('')}
        </div>`;
    }

    renderSetupContent(container, ui) {
        if (this.isPreparingContext) {
             container.innerHTML = `
                <div class="flex-1 flex items-center justify-center">
                    <div class="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                </div>
             `;
             return;
        }

        const nodeList = this.getFlatNodes();
        const filteredNodes = nodeList.slice(0, 500);

        container.innerHTML = `
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
                    
                    let typeBadge = `<span class="text-[9px] bg-slate-200 text-slate-600 px-1.5 rounded uppercase font-bold tracking-wider">${ui.tagModule || "MODULE"}</span>`;
                    if (isLeaf) typeBadge = `<span class="text-[9px] bg-purple-100 text-purple-700 px-1.5 rounded uppercase font-bold tracking-wider">${ui.tagLesson || "LESSON"}</span>`;
                    if (isExam) typeBadge = `<span class="text-[9px] bg-red-100 text-red-700 px-1.5 rounded uppercase font-bold tracking-wider">${ui.tagExam || "EXAM"}</span>`;
                    
                    const indentClass = `pl-${Math.min(n.depth * 4, 12) + 3}`;
                    const isDisabled = isExam;
                    const actionClass = isDisabled 
                        ? 'opacity-40 cursor-not-allowed grayscale bg-slate-50 dark:bg-slate-900' 
                        : 'hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer';
                    const activeClass = isSelected 
                        ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 ring-1 ring-orange-500' 
                        : '';

                    return `
                    <button class="w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors text-sm ${indentClass} ${actionClass} ${activeClass}"
                        ${!isDisabled ? `data-action="select-node" data-id="${n.id}"` : 'disabled'}>
                        <span class="text-lg opacity-70">${icon}</span>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <p class="font-bold truncate leading-tight">${n.name}</p>
                                ${typeBadge}
                            </div>
                        </div>
                        ${isSelected ? '<span class="ml-auto text-orange-500 font-bold">✔</span>' : ''}
                    </button>`;
                }).join('')}
                
                ${filteredNodes.length === 0 ? `<div class="p-4 text-center text-xs text-slate-400">${ui.noResults || "No matching content found."}</div>` : ''}
            </div>
        </div>

        <div class="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button data-action="start-game" class="w-full py-4 bg-orange-600 text-white font-black text-lg rounded-2xl shadow-xl hover:bg-orange-50 active:scale-95 transition-all flex items-center justify-center gap-2" ${!this.selectedNodeId ? 'disabled style="opacity:0.5"' : ''}>
                <span>🚀</span> ${ui.arcadeStart || "START GAME"}
            </button>
            <p class="text-[10px] text-center text-slate-400 mt-2">${ui.arcadeDisclaimer || "⚠️ Uses AI"}</p>
        </div>`;
    }

    handleDelegatedClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        
        if (action === 'cancel-watering') this.cancelWatering();
        if (action === 'add-custom') this.addCustomGame();
        if (action === 'remove-game') {
            store.userStore.removeGame(id);
            this.updateContent();
        }
        if (action === 'prepare') {
            const isManual = btn.dataset.manual === 'true';
            const idx = parseInt(btn.dataset.idx);
            const manualGames = store.userStore.state.installedGames.map(g => ({...g, isManual: true, path: g.url}));
            const allGames = [...this.discoveredGames, ...manualGames];
            this.prepareLaunch(allGames[idx], this.wateringTargetId);
            this.wateringTargetId = null;
        }
        if (action === 'water-node') this.launchWateringSession(id);
        if (action === 'delete-save') {
            if(confirm('Delete save data?')) {
                store.storage.clearGameData(id);
                this.updateContent();
            }
        }
        if (action === 'delete-all-saves') {
            if(confirm('Delete ALL Arcade saves?')) {
                store.storage.clearAll();
                this.updateContent();
            }
        }
        if (action === 'select-node') {
            this.selectedNodeId = id;
            this.updateContent();
        }
        if (action === 'start-game') this.launchGame();
    }

    // --- LOGIC HELPER METHODS --- (Same as before)
    async ensureTreeLoaded(node, depth = 0) {
        if (depth > 4) return;
        if (node.type === 'branch' || node.type === 'root') {
            if (node.hasUnloadedChildren) await store.loadNodeChildren(node);
            if (node.children) await Promise.all(node.children.map(c => this.ensureTreeLoaded(c, depth + 1)));
        }
    }

    async prepareLaunch(game, preSelectedNodeId = null) {
        this.selectedGame = game;
        this.isPreparingContext = true;
        this.updateContent();

        const root = store.value.data;
        if (root) await this.ensureTreeLoaded(root);

        if (preSelectedNodeId) this.selectedNodeId = preSelectedNodeId;
        else {
            const current = store.value.previewNode || store.value.selectedNode || store.value.data;
            if (current) this.selectedNodeId = (current.type === 'exam') ? current.parentId : current.id;
            else this.selectedNodeId = root ? root.id : null;
        }
        
        this.isPreparingContext = false;
        this.updateContent();
    }
    
    launchWateringSession(nodeId) {
        this.wateringTargetId = nodeId;
        this.activeTab = 'games';
        this.updateContent();
    }
    
    cancelWatering() {
        this.wateringTargetId = null;
        this.updateContent();
    }

    cancelLaunch() {
        this.selectedGame = null;
        this.selectedNodeId = null;
        this.wateringTargetId = null;
        this.filterText = '';
        this.updateContent();
    }

    getFlatNodes() {
        const root = store.value.data;
        if (!root) return [];
        const nodes = [];
        const traverse = (n, depth) => {
            if (!this.filterText || n.name.toLowerCase().includes(this.filterText.toLowerCase())) nodes.push({ ...n, depth });
            if (n.children) n.children.forEach(c => traverse(c, depth + 1));
        };
        traverse(root, 0);
        return nodes;
    }

    launchGame() {
        if (!this.selectedGame || !this.selectedNodeId) return;
        const activeSource = store.value.activeSource;
        const targetNode = store.findNode(this.selectedNodeId);
        if (!activeSource || !targetNode) return;

        const treeUrl = encodeURIComponent(activeSource.url);
        const lang = store.value.lang || 'EN';
        const modulePath = targetNode.apiPath || targetNode.contentPath || ''; 
        const encodedPath = encodeURIComponent(modulePath);

        let finalUrl = this.selectedGame.path;
        const separator = finalUrl.includes('?') ? '&' : '?';
        finalUrl += `${separator}source=${treeUrl}&lang=${lang}`;
        if (encodedPath) finalUrl += `&module=${encodedPath}`;
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
        this.updateContent();
    }
}
customElements.define('arbor-modal-arcade', ArborModalArcade);
