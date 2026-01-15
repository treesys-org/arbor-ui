
import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';

class ArborModalReleases extends HTMLElement {
    constructor() {
        super();
        this.state = {
            releases: [],
            loading: true,
            creating: false,
            newVersionName: ''
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
            // 1. Scan content/releases folder
            const tree = await fileSystem.getTree('content/releases');
            
            // Filter only folders directly under content/releases
            // We look for the meta.json identifying the folder
            const releaseFolders = new Set();
            
            tree.forEach(node => {
                const path = node.path;
                // format: content/releases/{VERSION_NAME}/...
                const parts = path.split('/');
                if (parts.length >= 3 && parts[0] === 'content' && parts[1] === 'releases') {
                    releaseFolders.add(parts[2]);
                }
            });

            this.state.releases = Array.from(releaseFolders).sort().reverse(); // Newest first
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
            // Create the folder structure
            // content/releases/{name}/meta.json
            await fileSystem.createNode('content/releases', name, 'folder');
            
            this.state.newVersionName = '';
            await this.loadReleases();
            alert(`Version '${name}' created.\n\nNote: In a live environment, you must now run the Builder Script to compile the content snapshot into this folder.`);
        } catch (e) {
            alert("Error creating version: " + e.message);
        } finally {
            this.state.creating = false;
            this.render();
        }
    }

    switchTo(version) {
        // Construct the URL for the release data
        // Logic: specific releases are usually compiled to data/releases/{version}.json OR they exist as raw content
        // For the Builder V3 context, we usually load data/releases/{version}.json
        
        const activeSource = store.value.activeSource;
        let baseUrl = activeSource.url;
        
        // Strip filename to get root
        if (baseUrl.endsWith('.json')) {
            baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/'));
            // If ended in /data, go up one to get root if needed, but builder puts releases in /data/releases
        }

        // Construct new source object
        // Assuming standard structure: root/data/releases/VERSION.json
        // Or if strictly folder browsing: we might just navigate there?
        // Let's assume standard Arbor Builder output behavior:
        
        let newUrl = '';
        const isLocal = fileSystem.isLocal;

        if (isLocal) {
            // Local switching logic might differ, but for now we warn
            alert("Switching versions in Local Mode requires re-importing the snapshot file manually.");
            return;
        } else {
            // GitHub / Remote logic
            // Try to find relative to current data.json
            // If current is .../data/data.json, new is .../data/releases/VERSION.json
            
            // Heuristic to find root /data/ folder
            let dataRoot = activeSource.url;
            if (dataRoot.includes('/data.json')) {
                dataRoot = dataRoot.replace('/data.json', '');
            } else {
                // Fallback
                dataRoot = dataRoot.substring(0, dataRoot.lastIndexOf('/'));
            }
            
            newUrl = `${dataRoot}/releases/${version}.json`;
        }

        if (confirm(`Switch to archived version '${version}'?`)) {
            const newSource = {
                ...activeSource,
                id: `${activeSource.id}-${version}`,
                name: `${activeSource.name} (${version})`,
                url: newUrl,
                type: 'archive'
            };
            store.loadData(newSource);
            this.close();
        }
    }

    render() {
        const ui = store.ui;
        const currentTreeName = store.value.activeSource?.name || "Current Tree";
        const isRolling = !store.value.activeSource?.type || store.value.activeSource.type === 'rolling' || store.value.activeSource.type === 'local';

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full relative overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                
                <!-- Header -->
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 shrink-0">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">🚀</span>
                        <div>
                            <h3 class="font-black text-xl text-slate-800 dark:text-white">Tree Versions</h3>
                            <p class="text-xs text-slate-500 font-mono">${currentTreeName}</p>
                        </div>
                    </div>
                    <button class="btn-close w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors">✕</button>
                </div>

                <!-- Create New Section -->
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Create New Version Tag</label>
                    <div class="flex gap-2">
                        <input id="inp-version" type="text" placeholder="e.g. v1.0, 2024-Winter" class="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white font-mono" value="${this.state.newVersionName}">
                        <button id="btn-create" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold shadow-lg hover:shadow-blue-500/20 active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center gap-2" ${this.state.creating ? 'disabled' : ''}>
                            ${this.state.creating ? '<span class="animate-spin">⏳</span>' : '<span>+ Create</span>'}
                        </button>
                    </div>
                    <p class="text-[10px] text-slate-400 mt-2">Saves a permanent checkpoint of the current tree.</p>
                </div>

                <!-- List Section -->
                <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                    
                    <!-- Current State -->
                    <div class="p-4 rounded-xl border-2 ${isRolling ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-slate-200 dark:border-slate-800'} flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full ${isRolling ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'} flex items-center justify-center font-bold text-lg">
                                ${isRolling ? '🌊' : '📄'}
                            </div>
                            <div>
                                <h4 class="font-bold text-sm text-slate-800 dark:text-white">Live Version</h4>
                                <p class="text-[10px] text-slate-500">Development Branch (Rolling)</p>
                            </div>
                        </div>
                        ${isRolling ? '<span class="text-[10px] font-black bg-green-200 text-green-800 px-2 py-1 rounded">ACTIVE</span>' : ''}
                    </div>

                    <div class="h-px bg-slate-100 dark:border-slate-800 my-2"></div>
                    <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Past Versions</h4>

                    ${this.state.loading 
                        ? `<div class="p-8 text-center text-slate-400"><div class="animate-spin text-2xl mb-2">⏳</div>Scanning...</div>` 
                        : (this.state.releases.length === 0 
                            ? `<div class="p-8 text-center text-slate-400 italic text-xs">No past versions found.</div>`
                            : this.state.releases.map(ver => `
                                <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl group hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-sm">📦</div>
                                        <span class="font-bold text-sm text-slate-700 dark:text-slate-200 font-mono">${ver}</span>
                                    </div>
                                    <button class="btn-switch px-3 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-600 dark:text-blue-400 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors" data-ver="${ver}">
                                        Load
                                    </button>
                                </div>
                            `).join(''))
                    }

                </div>
            </div>
        </div>`;

        this.querySelector('.btn-close').onclick = () => this.close();
        
        const btnCreate = this.querySelector('#btn-create');
        if(btnCreate) btnCreate.onclick = () => this.createRelease();

        const inp = this.querySelector('#inp-version');
        if(inp) inp.oninput = (e) => this.state.newVersionName = e.target.value;

        this.querySelectorAll('.btn-switch').forEach(b => {
            b.onclick = (e) => this.switchTo(e.currentTarget.dataset.ver);
        });
    }
}

customElements.define('arbor-modal-releases', ArborModalReleases);
