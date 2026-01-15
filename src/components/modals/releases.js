
import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';

class ArborModalReleases extends HTMLElement {
    constructor() {
        super();
        this.state = {
            releases: [],
            loading: true,
            creating: false,
            newVersionName: '',
            deleteTarget: null // ID of version to delete
        };
    }

    connectedCallback() {
        this.render();
        this.loadReleases();
    }

    close() {
        store.setModal(null);
    }

    async loadReleases() {
        this.state.loading = true;
        this.render();

        try {
            // STRATEGY 1: Public Manifest (Fast, Works for Readers)
            // SourceManager already fetched this into store.value.availableReleases
            const publicReleases = store.value.availableReleases || [];
            
            // Map to unified structure
            let releases = publicReleases
                .filter(r => r.type === 'archive')
                .map(r => ({
                    id: r.year || r.name, // Use year/name as display ID
                    name: r.name,
                    url: r.url,
                    isRemote: true
                }));

            // STRATEGY 2: File System Scan (Admin/Editor Mode)
            // Only if we have write access (implies we are editing/admining)
            if (fileSystem.features.canWrite) {
                try {
                    const tree = await fileSystem.getTree('content/releases');
                    const releaseFolders = new Set();
                    tree.forEach(node => {
                        const parts = node.path.split('/');
                        if (parts.length >= 3 && parts[0] === 'content' && parts[1] === 'releases') {
                            releaseFolders.add(parts[2]);
                        }
                    });
                    
                    // Add any folders found that weren't in the manifest
                    // (e.g. newly created but not yet built via builder script)
                    releaseFolders.forEach(folder => {
                        if (!releases.find(r => r.id === folder)) {
                            releases.push({
                                id: folder,
                                name: `Snapshot ${folder}`,
                                url: null, // Logic will construct path dynamically
                                isRemote: false
                            });
                        }
                    });
                } catch(e) {
                    console.log("FS scan skipped/failed", e);
                }
            }

            // Sort descending (newest first)
            // Simple heuristic: if it looks like a year/date, sort accordingly, else alpha
            this.state.releases = releases.sort((a, b) => b.id.localeCompare(a.id));

        } catch (e) {
            console.warn("Could not load releases:", e);
            this.state.releases = [];
        } finally {
            this.state.loading = false;
            this.render();
        }
    }

    async createRelease() {
        const name = this.state.newVersionName.trim().replace(/[^a-z0-9\.\-_]/gi, '');
        if (!name) return;

        this.state.creating = true;
        this.render();

        try {
            // Create content/releases/{name}/meta.json
            await fileSystem.createNode('content/releases', name, 'folder');
            
            this.state.newVersionName = '';
            await this.loadReleases();
            store.alert(`Version '${name}' folder created.\n\nNote: In a live environment, you must now run the Builder Script to compile the content snapshot into this folder.`);
        } catch (e) {
            store.alert("Error creating version: " + e.message);
        } finally {
            this.state.creating = false;
            this.render();
        }
    }
    
    async confirmDelete() {
        if (!this.state.deleteTarget) return;
        
        const version = this.state.deleteTarget;
        this.state.deleteTarget = null; // Close overlay
        this.state.loading = true;
        this.render();

        try {
            await fileSystem.deleteNode(`content/releases/${version}`, 'folder');
            await this.loadReleases();
        } catch (e) {
            store.alert("Error deleting archive: " + e.message);
            this.state.loading = false;
            this.render();
        }
    }

    async switchTo(release) {
        const activeSource = store.value.activeSource;
        let newUrl = release.url;

        // If no URL (from FS scan), construct standard path
        if (!newUrl) {
            let dataRoot = activeSource.url;
            if (dataRoot.includes('/data.json')) {
                dataRoot = dataRoot.replace('/data.json', '');
            } else {
                dataRoot = dataRoot.substring(0, dataRoot.lastIndexOf('/'));
            }
            newUrl = `${dataRoot}/releases/${release.id}.json`;
        }

        const proceed = await store.confirm(`Travel to time period '${release.id}'?`);
        if (proceed) {
            const newSource = {
                ...activeSource,
                id: `${activeSource.id}-${release.id}`,
                name: release.name || `${activeSource.name} (${release.id})`,
                url: newUrl,
                type: 'archive'
            };
            store.loadData(newSource);
            this.close();
        }
    }
    
    switchToLive() {
        const releases = store.value.availableReleases || [];
        const rolling = releases.find(r => r.type === 'rolling');
        
        let newUrl = rolling ? rolling.url : store.value.activeSource.url;
        
        // Fallback logic to strip release path
        if (!rolling && store.value.activeSource.type === 'archive') {
             // Try to find the root data.json
             // .../data/releases/2023.json -> .../data/data.json
             let current = store.value.activeSource.url;
             if (current.includes('/releases/')) {
                 newUrl = current.split('/releases/')[0] + '/data.json';
             }
        }

        const newSource = {
            ...store.value.activeSource,
            id: `live-${Date.now()}`,
            name: store.value.activeSource.name.split(' (')[0], // Strip version suffix
            url: newUrl,
            type: 'rolling'
        };
        store.loadData(newSource);
        this.close();
    }

    render() {
        const ui = store.ui;
        const currentTreeName = store.value.activeSource?.name || "Current Tree";
        const canWrite = fileSystem.features.canWrite;
        
        // Determine active state
        const activeType = store.value.activeSource?.type;
        const activeId = store.value.activeSource?.id;
        
        const isRolling = !activeType || activeType === 'rolling' || activeType === 'local';

        let overlayHtml = '';
        if (this.state.deleteTarget) {
            overlayHtml = `
            <div class="absolute inset-0 bg-white/95 dark:bg-slate-900/95 flex items-center justify-center z-20 animate-in fade-in">
                <div class="w-full max-w-xs text-center">
                    <div class="text-3xl mb-4">⚠️</div>
                    <h3 class="text-lg font-black mb-2 dark:text-white">Delete Snapshot?</h3>
                    <p class="text-xs text-slate-500 mb-6">Are you sure you want to remove '${this.state.deleteTarget}'?</p>
                    <div class="flex gap-2">
                        <button id="btn-cancel-delete" class="flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs uppercase">Cancel</button>
                        <button id="btn-confirm-delete" class="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg">Delete</button>
                    </div>
                </div>
            </div>
            `;
        }

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                
                <!-- Header -->
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 shrink-0">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">⏳</span>
                        <div>
                            <h3 class="font-black text-xl text-slate-800 dark:text-white">Timeline</h3>
                            <p class="text-xs text-slate-500 font-mono">${currentTreeName}</p>
                        </div>
                    </div>
                    <button class="btn-close w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors">✕</button>
                </div>

                <div class="relative flex-1 overflow-hidden flex flex-col">
                    ${overlayHtml}
                    
                    <!-- Create New Section (Admin Only) -->
                    ${canWrite ? `
                    <div class="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                        <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Tag New Version</label>
                        <div class="flex gap-2">
                            <input id="inp-version" type="text" placeholder="e.g. v2.0" class="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white font-mono" value="${this.state.newVersionName}">
                            <button id="btn-create" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold shadow-lg hover:shadow-blue-500/20 active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center gap-2" ${this.state.creating ? 'disabled' : ''}>
                                ${this.state.creating ? '<span class="animate-spin">⏳</span>' : '<span>+ Tag</span>'}
                            </button>
                        </div>
                    </div>
                    ` : ''}

                    <!-- List Section -->
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                        
                        <!-- Line Connector (Visual) -->
                        <div class="absolute left-8 top-0 bottom-0 w-0.5 bg-slate-100 dark:bg-slate-800 -z-10"></div>

                        <!-- Current / Rolling State -->
                        <div class="relative pl-12">
                            <div class="absolute left-2 top-4 w-4 h-4 rounded-full border-2 ${isRolling ? 'bg-green-500 border-green-200 dark:border-green-900' : 'bg-slate-200 border-white dark:bg-slate-700 dark:border-slate-800'} z-10 shadow-sm"></div>
                            
                            <div class="p-4 rounded-xl border-2 ${isRolling ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'} flex justify-between items-center shadow-sm">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full ${isRolling ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'} flex items-center justify-center font-bold text-xl">
                                        🌊
                                    </div>
                                    <div>
                                        <h4 class="font-bold text-sm text-slate-800 dark:text-white">Live / Rolling</h4>
                                        <p class="text-[10px] text-slate-500">Latest Updates</p>
                                    </div>
                                </div>
                                ${isRolling 
                                    ? '<span class="text-[10px] font-black bg-green-200 text-green-800 px-3 py-1 rounded-full">ACTIVE</span>' 
                                    : '<button id="btn-live" class="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg shadow transition-colors">Switch</button>'
                                }
                            </div>
                        </div>

                        ${this.state.loading 
                            ? `<div class="p-8 text-center text-slate-400"><div class="animate-spin text-2xl mb-2">⏳</div>Scanning...</div>` 
                            : (this.state.releases.length === 0 
                                ? `<div class="pl-12 py-4 text-slate-400 italic text-xs">No historical snapshots found.</div>`
                                : this.state.releases.map((rel, idx) => {
                                    // Simple active check (fuzzy matching ID in current active ID)
                                    const isActive = activeType === 'archive' && activeId && activeId.includes(rel.id);
                                    return `
                                    <div class="relative pl-12 animate-in slide-in-from-bottom-2 fade-in" style="animation-delay: ${idx * 50}ms">
                                        <div class="absolute left-2.5 top-5 w-3 h-3 rounded-full ${isActive ? 'bg-blue-500 ring-4 ring-blue-100 dark:ring-blue-900/30' : 'bg-slate-300 dark:bg-slate-700'} z-10"></div>
                                        
                                        <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border ${isActive ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-100 dark:border-slate-800'} rounded-xl group hover:border-blue-300 dark:hover:border-blue-700 transition-colors shadow-sm">
                                            <div class="flex items-center gap-3">
                                                <div class="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-lg border border-slate-100 dark:border-slate-700">📦</div>
                                                <div>
                                                    <h4 class="font-bold text-sm text-slate-700 dark:text-slate-200 font-mono tracking-tight">${rel.id}</h4>
                                                    <p class="text-[9px] text-slate-400">Snapshot</p>
                                                </div>
                                            </div>
                                            
                                            ${isActive 
                                                ? '<span class="text-[10px] font-black text-blue-500 uppercase tracking-wider mr-2">Viewing</span>' 
                                                : `<button class="btn-switch px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 text-slate-600 dark:text-blue-200 text-xs font-bold rounded-lg transition-colors" data-idx="${idx}">Load</button>`
                                            }
                                            
                                            <button class="btn-delete-release w-9 h-9 flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors" data-id="${rel.id}" title="Delete Archive">🗑️</button>
                                        </div>
                                    </div>
                                `;
                                }).join(''))
                        }
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
        
        const btnCreate = this.querySelector('#btn-create');
        if(btnCreate) btnCreate.onclick = () => this.createRelease();
        
        const btnLive = this.querySelector('#btn-live');
        if(btnLive) btnLive.onclick = () => this.switchToLive();

        const inp = this.querySelector('#inp-version');
        if(inp) inp.oninput = (e) => this.state.newVersionName = e.target.value;

        this.querySelectorAll('.btn-switch').forEach(b => {
            b.onclick = (e) => this.switchTo(this.state.releases[e.currentTarget.dataset.idx]);
        });
        
        this.querySelectorAll('.btn-delete-release').forEach(b => {
            b.onclick = (e) => {
                this.state.deleteTarget = e.currentTarget.dataset.id;
                this.render();
            };
        });
        
        const btnConfirmDelete = this.querySelector('#btn-confirm-delete');
        if (btnConfirmDelete) btnConfirmDelete.onclick = () => this.confirmDelete();
        
        const btnCancelDelete = this.querySelector('#btn-cancel-delete');
        if (btnCancelDelete) btnCancelDelete.onclick = () => {
            this.state.deleteTarget = null;
            this.render();
        };
    }
}

customElements.define('arbor-modal-releases', ArborModalReleases);
