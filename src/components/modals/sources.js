
import { store } from '../../store.js';

class ArborModalSources extends HTMLElement {
    constructor() {
        super();
        this.selectedVersionUrl = null;
    }

    connectedCallback() {
        this.render();
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
            // Find the full source object from available releases
            const releases = store.value.availableReleases || [];
            const target = releases.find(r => r.url === this.selectedVersionUrl);
            
            if (target) {
                // Construct a new source object based on the active one but with new URL
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

    render() {
        const ui = store.ui;
        const state = store.value;
        const activeSource = state.activeSource || { name: 'Unknown', url: '' };
        
        // 1. Get Releases (Manifest)
        const releases = state.availableReleases || [];
        
        // 2. Identify Current Version URL (normalize relative paths for comparison)
        const normalize = (u) => {
            try { return new URL(u, window.location.href).href; } catch(e) { return u; }
        };
        const activeUrl = normalize(activeSource.url);
        
        // 3. Determine if we have a match in the manifest
        let currentInManifest = releases.find(r => normalize(r.url) === activeUrl);
        
        // If the active source isn't in the manifest (e.g. custom URL or manifest failed), 
        // we treat it as a standalone entry.
        const effectiveReleases = releases.length > 0 ? releases : [{
            id: 'current-unknown',
            name: 'Current Version',
            url: activeSource.url,
            type: 'manual'
        }];

        // 4. Dropdown State
        const selectedUrl = this.selectedVersionUrl || activeSource.url;
        const isDifferent = normalize(selectedUrl) !== activeUrl;

        // 5. Community/Other Sources (exclude the active one by ID)
        const otherSources = (state.communitySources || []).filter(s => s.id !== activeSource.id);

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-xl w-full relative overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <button class="btn-close absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 z-20 transition-colors">✕</button>

                <div class="p-6 h-full flex flex-col">
                    <div class="flex items-center gap-3 mb-6">
                        <span class="text-3xl">🌳</span>
                        <div>
                            <h2 class="text-xl font-black dark:text-white leading-none">${ui.sourceManagerTitle}</h2>
                            <p class="text-xs text-slate-500 mt-1">${ui.sourceManagerDesc}</p>
                        </div>
                    </div>

                    <div class="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-4 space-y-6">
                        
                        <!-- ACTIVE TREE CARD -->
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
                                <button disabled class="bg-slate-200 dark:bg-slate-800 text-slate-400 px-4 py-2.5 rounded-xl font-bold text-sm cursor-not-allowed">
                                    Active
                                </button>
                                `}
                            </div>
                            
                            ${releases.length === 0 ? `
                                <div class="text-[10px] text-red-400 mt-2 flex flex-col gap-1 bg-red-50 dark:bg-red-900/10 p-2 rounded">
                                    <p class="font-bold">⚠️ Manifest Check Failed</p>
                                    <p class="font-mono text-[9px] break-all opacity-80">Checked at: ${state.manifestUrlAttempted || '...'}</p>
                                </div>
                            ` : ''}
                        </div>

                        <!-- OTHER SOURCES LIST -->
                        <div>
                            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <span>🌍</span> Saved Trees
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
                </div>
            </div>
        </div>`;

        // Event Bindings
        this.querySelector('.btn-close').onclick = () => this.close();
        
        const sel = this.querySelector('#version-select');
        if (sel) sel.onchange = (e) => this.handleVersionSelect(e);
        
        const btnSwitch = this.querySelector('#btn-switch-version');
        if (btnSwitch) btnSwitch.onclick = () => this.handleSwitch();

        this.querySelectorAll('.btn-load-source').forEach(btn => {
            btn.onclick = () => {
                store.loadAndSmartMerge(btn.dataset.id);
                this.close();
            };
        });
        
        this.querySelectorAll('.btn-remove-source').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Delete tree?')) store.removeCommunitySource(btn.dataset.id);
                this.render(); // Re-render to update list
            };
        });
        
        const btnAdd = this.querySelector('#btn-add-source');
        if (btnAdd) {
            btnAdd.onclick = () => {
                const url = this.querySelector('#inp-source-url').value.trim();
                if (url) {
                    store.addCommunitySource(url);
                    this.render();
                }
            };
        }
    }
}
customElements.define('arbor-modal-sources', ArborModalSources);
