
import { store } from '../../store.js';

class ArborModalSources extends HTMLElement {
    constructor() {
        super();
        this.activeTab = 'global'; // 'global' | 'local'
        this.selectedVersionUrl = null;
    }

    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
    }

    close() {
        store.setModal(null);
    }

    handleVersionSelect(e) {
        this.selectedVersionUrl = e.target.value;
        this.render();
    }

    handleSwitch() {
        if (this.selectedVersionUrl) {
            const releases = store.value.availableReleases || [];
            const target = releases.find(r => r.url === this.selectedVersionUrl);
            
            if (target) {
                const active = store.value.activeSource;
                const newSource = {
                    ...active,
                    id: target.id || `release-${Date.now()}`,
                    url: target.url,
                    type: target.type,
                    name: target.name || active.name
                };
                store.loadData(newSource);
                this.close();
            }
        }
    }
    
    plantNewTree() {
        const ui = store.ui;
        const name = prompt(ui.treeNamePlaceholder || "Name your tree:");
        if (!name) return;
        
        const newTree = store.userStore.plantTree(name);
        
        // Load immediately
        const source = {
            id: newTree.id,
            name: newTree.name,
            url: `local://${newTree.id}`,
            type: 'local',
            isTrusted: true
        };
        store.loadData(source);
        this.close();
    }
    
    importTreeFromFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const jsonData = JSON.parse(event.target.result);
                    const newTree = store.userStore.importLocalTree(jsonData);
                    
                    // Optional: auto-load the newly imported tree
                    const source = { id: newTree.id, name: newTree.name, url: `local://${newTree.id}`, type: 'local' };
                    store.loadData(source);
                    this.close();

                } catch (err) {
                    alert("Error importing tree: " + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
    
    loadLocalTree(id, name) {
        const source = {
            id: id,
            name: name,
            url: `local://${id}`,
            type: 'local',
            isTrusted: true
        };
        store.loadData(source);
        this.close();
    }
    
    deleteLocalTree(id) {
        if(confirm(store.ui.deleteTreeConfirm)) {
            store.userStore.deleteLocalTree(id);
            this.render();
        }
    }
    
    exportLocalTree(id, name) {
        const treeData = store.userStore.getLocalTreeData(id);
        if (!treeData) return;
        
        const blob = new Blob([JSON.stringify(treeData, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `arbor-tree-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    shareActiveTree() {
        const url = store.value.activeSource?.url;
        if (!url) return;
        const shareLink = `${window.location.origin}${window.location.pathname}?source=${encodeURIComponent(url)}`;
        navigator.clipboard.writeText(shareLink).then(() => {
            alert("Share link copied to clipboard!");
        });
    }

    render() {
        const ui = store.ui;
        const state = store.value;
        const activeSource = state.activeSource || { name: 'Unknown', url: '' };
        
        // GLOBAL DATA
        const releases = state.availableReleases || [];
        const normalize = (u) => { try { return new URL(u, window.location.href).href; } catch(e) { return u; } };
        const activeUrl = normalize(activeSource.url);
        
        const effectiveReleases = releases.length > 0 ? releases : [{
            id: 'current-unknown',
            name: 'Current Version',
            url: activeSource.url,
            type: 'manual'
        }];
        const selectedUrl = this.selectedVersionUrl || activeSource.url;
        const isDifferent = normalize(selectedUrl) !== activeUrl;
        const otherSources = (state.communitySources || []).filter(s => s.id !== activeSource.id);

        // LOCAL DATA
        const localTrees = store.userStore.state.localTrees || [];

        // TABS
        const tabsHtml = `
            <div class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0">
                <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.activeTab === 'global' ? 'border-purple-500 text-purple-600 dark:text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-global">
                    🌍 ${ui.tabGlobal || 'Global Forest'}
                </button>
                <button class="flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${this.activeTab === 'local' ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-slate-400 hover:text-slate-600'}" id="tab-local">
                    🌱 ${ui.tabGarden || 'My Garden'}
                </button>
            </div>`;

        let contentHtml = '';

        // --- TAB: GLOBAL ---
        if (this.activeTab === 'global') {
            contentHtml = `
            <div class="space-y-6">
                <!-- ACTIVE TREE CARD (Only if Remote) -->
                ${activeSource.type !== 'local' ? `
                <div class="bg-slate-50 dark:bg-slate-950/50 p-5 rounded-2xl border-2 border-purple-500/30 relative overflow-hidden">
                    <div class="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-widest">
                        ${ui.sourceActive}
                    </div>
                    <h3 class="font-bold text-lg text-slate-800 dark:text-white mb-1">${activeSource.name}</h3>
                    <p class="text-xs text-slate-400 font-mono truncate mb-4 opacity-70">${activeSource.url}</p>
                    
                    <div class="flex gap-2 items-end">
                        <div class="flex-1">
                            <label class="block text-[10px] uppercase font-bold text-slate-400 mb-1">Release / Version</label>
                            <div class="relative">
                                <select id="version-select" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500 appearance-none">
                                    ${effectiveReleases.map(r => `
                                        <option value="${r.url}" ${normalize(r.url) === normalize(selectedUrl) ? 'selected' : ''}>
                                            ${r.type === 'rolling' ? '🌊 ' : (r.type === 'archive' ? '🏛️ ' : '📄 ')} 
                                            ${r.name || r.year || 'Unknown Version'}
                                        </option>
                                    `).join('')}
                                </select>
                                <div class="absolute right-3 top-2.5 pointer-events-none text-slate-400 text-xs">▼</div>
                            </div>
                        </div>
                        ${isDifferent ? `
                        <button id="btn-switch-version" class="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-all animate-in fade-in slide-in-from-right-2">
                            Switch
                        </button>
                        ` : `
                        <button id="btn-share-tree" class="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 px-3 py-2.5 rounded-xl font-bold text-sm transition-colors" title="Copy Share Link">
                           🔗
                        </button>
                        `}
                    </div>
                </div>
                ` : `<div class="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800 text-center text-xs text-purple-600 dark:text-purple-400">You are currently in your local garden. Switch to a global tree below to explore.</div>`}

                <!-- SAVED TREES -->
                <div>
                    <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span>📡</span> Community Trees
                    </h3>
                    ${otherSources.length === 0 
                        ? `<div class="p-6 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl text-center text-slate-400 text-xs">No other trees added.</div>`
                        : `<div class="space-y-2">
                            ${otherSources.map(s => `
                                <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl group hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                    <div class="flex items-center gap-3 overflow-hidden">
                                        <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg">🌐</div>
                                        <div class="min-w-0">
                                            <h4 class="font-bold text-sm text-slate-700 dark:text-slate-200 truncate">${s.name}</h4>
                                            <p class="text-[10px] text-slate-400 truncate">${s.url}</p>
                                        </div>
                                    </div>
                                    <div class="flex gap-2">
                                        <button class="btn-load-source px-3 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-green-50 dark:hover:bg-green-900/30 text-slate-600 dark:text-green-400 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors" data-id="${s.id}">
                                            Load
                                        </button>
                                        <button class="btn-remove-source px-2 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 rounded-lg transition-colors" data-id="${s.id}">✕</button>
                                    </div>
                                </div>
                            `).join('')}
                           </div>`
                    }
                </div>

                <!-- ADD NEW -->
                <div class="pt-4 border-t border-slate-100 dark:border-slate-800 mt-2">
                    <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sourceAdd}</label>
                    <div class="flex gap-2">
                        <input id="inp-source-url" type="text" placeholder="https://.../data/data.json" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 dark:text-white">
                        <button id="btn-add-source" class="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 rounded-xl font-bold shadow-lg hover:opacity-90 active:scale-95 transition-transform">
                            +
                        </button>
                    </div>
                </div>
            </div>`;
        }

        // --- TAB: LOCAL GARDEN ---
        if (this.activeTab === 'local') {
            contentHtml = `
            <div class="flex flex-col h-full">
                <!-- Action Buttons -->
                <div class="grid grid-cols-2 gap-3 mb-6">
                    <button id="btn-plant-tree" class="py-3 px-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 font-bold rounded-xl active:scale-95 transition-all flex flex-col items-center gap-1 group">
                        <span class="text-xl group-hover:-translate-y-0.5 transition-transform">🌱</span> 
                        <span class="text-xs">${ui.plantTree || 'Plant New'}</span>
                    </button>
                    <button id="btn-import-tree" class="py-3 px-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl active:scale-95 transition-all flex flex-col items-center gap-1 group">
                        <span class="text-xl group-hover:-translate-y-0.5 transition-transform">📥</span> 
                        <span class="text-xs">${ui.importBtn || 'Import'}</span>
                    </button>
                </div>

                <!-- Local Trees List -->
                <div class="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-4">
                    ${localTrees.length === 0 
                        ? `<div class="text-center p-8 text-slate-400 italic text-sm">Your garden is empty. Plant your first tree!</div>` 
                        : localTrees.map(t => {
                            const isActive = activeSource.id === t.id;
                            return `
                            <div class="bg-white dark:bg-slate-900 border ${isActive ? 'border-green-500 ring-1 ring-green-500' : 'border-slate-200 dark:border-slate-700'} rounded-xl p-4 flex items-center justify-between group hover:border-green-300 dark:hover:border-green-700 transition-colors">
                                <div class="flex items-center gap-4 min-w-0">
                                    <div class="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-xl">
                                        🌳
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="font-bold text-slate-800 dark:text-white truncate">${t.name}</h4>
                                        <p class="text-[10px] text-slate-400">Last updated: ${new Date(t.updated).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div class="flex gap-2 shrink-0">
                                    <button class="btn-export-local px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors" data-id="${t.id}" data-name="${t.name}" title="${ui.sourceExport || 'Export Tree'}">📤</button>
                                    ${isActive 
                                        ? `<span class="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded-lg">${ui.sourceActive}</span>`
                                        : `<button class="btn-load-local px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-lg shadow hover:opacity-90 transition-opacity" data-id="${t.id}" data-name="${t.name}">Open</button>`
                                    }
                                    <button class="btn-delete-local w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" data-id="${t.id}">✕</button>
                                </div>
                            </div>
                            `;
                        }).join('')
                    }
                </div>
            </div>
            `;
        }

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-xl w-full relative overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <button class="btn-close absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>

                <div class="p-6 h-full flex flex-col">
                    <div class="flex items-center gap-3 mb-4 shrink-0">
                        <span class="text-3xl">🌳</span>
                        <div>
                            <h2 class="text-xl font-black dark:text-white leading-none">${ui.sourceManagerTitle}</h2>
                            <p class="text-xs text-slate-500 mt-1">${ui.sourceManagerDesc}</p>
                        </div>
                    </div>

                    ${tabsHtml}

                    <div class="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-4 pt-4">
                        ${contentHtml}
                    </div>
                </div>
            </div>
        </div>`;

        // Event Bindings
        this.querySelector('.btn-close').onclick = () => this.close();
        
        // Tab Switching
        const tabGlobal = this.querySelector('#tab-global');
        if(tabGlobal) tabGlobal.onclick = () => { this.activeTab = 'global'; this.render(); };
        
        const tabLocal = this.querySelector('#tab-local');
        if(tabLocal) tabLocal.onclick = () => { this.activeTab = 'local'; this.render(); };

        // Global Events
        if (this.activeTab === 'global') {
            const sel = this.querySelector('#version-select');
            if (sel) sel.onchange = (e) => this.handleVersionSelect(e);
            
            const btnSwitch = this.querySelector('#btn-switch-version');
            if (btnSwitch) btnSwitch.onclick = () => this.handleSwitch();
            
            const btnShare = this.querySelector('#btn-share-tree');
            if (btnShare) btnShare.onclick = () => this.shareActiveTree();

            this.querySelectorAll('.btn-load-source').forEach(btn => {
                btn.onclick = () => {
                    store.loadAndSmartMerge(btn.dataset.id);
                    this.close();
                };
            });
            
            this.querySelectorAll('.btn-remove-source').forEach(btn => {
                btn.onclick = (e) => {
                    if(confirm('Delete tree?')) store.removeCommunitySource(btn.dataset.id);
                    this.render(); 
                };
            });
            
            const btnAdd = this.querySelector('#btn-add-source');
            if (btnAdd) {
                btnAdd.onclick = () => {
                    const url = this.querySelector('#inp-source-url').value.trim();
                    if (url) {
                        store.requestAddCommunitySource(url);
                        // The store will handle showing the warning or adding directly.
                    }
                };
            }
        }

        // Local Events
        if (this.activeTab === 'local') {
            const btnPlant = this.querySelector('#btn-plant-tree');
            if (btnPlant) btnPlant.onclick = () => this.plantNewTree();
            
            const btnImport = this.querySelector('#btn-import-tree');
            if (btnImport) btnImport.onclick = () => this.importTreeFromFile();
            
            this.querySelectorAll('.btn-load-local').forEach(btn => {
                btn.onclick = (e) => this.loadLocalTree(e.currentTarget.dataset.id, e.currentTarget.dataset.name);
            });
            
            this.querySelectorAll('.btn-export-local').forEach(btn => {
                btn.onclick = (e) => this.exportLocalTree(e.currentTarget.dataset.id, e.currentTarget.dataset.name);
            });
            
            this.querySelectorAll('.btn-delete-local').forEach(btn => {
                btn.onclick = (e) => this.deleteLocalTree(e.currentTarget.dataset.id);
            });
        }
    }
}
customElements.define('arbor-modal-sources', ArborModalSources);