
import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';
import { github } from '../../services/github.js'; 

class ArborAdminPanel extends HTMLElement {
    constructor() {
        super();
        this.state = {
            adminTab: 'proposals', 
            isAdmin: false,
            canWrite: false,
            isRepoHealthy: true, 
            adminData: { prs: [], users: [], gov: null },
            
            // Access / Permissions State
            accessRules: [], 
            accessTree: null, 
            selectedFolderPath: null, 
            expandedPaths: new Set(['/']), // Default expand root
            isDirty: false, 
            
            // Login State
            isLoggingIn: false,
            loginError: null,
            
            // Versions State
            releases: [],
            releasesLoading: false,
            newVersionName: '',
            creatingRelease: false,
            
            loadingTree: false
        };
        
        // Bind methods to be used in HTML strings
        window.arborAdminToggleFolder = (path) => this.toggleFolder(path);
        window.arborAdminSelectFolder = (path) => this.selectAccessFolder(path);
    }

    connectedCallback() {
        const modalState = store.value.modal;
        if (modalState && modalState.tab) {
            this.state.adminTab = modalState.tab;
        }

        this.subscription = (e) => {
            this.render();
            if(store.value.activeSource && !this.state.accessTree) this.initData();
        };
        store.addEventListener('state-change', this.subscription);
        
        this.render();
        
        if (store.value.activeSource) {
            this.initData();
        }
    }
    
    disconnectedCallback() {
        store.removeEventListener('state-change', this.subscription);
        // Clean up global handlers
        delete window.arborAdminToggleFolder;
        delete window.arborAdminSelectFolder;
    }

    async initData() {
        if (!fileSystem.isLocal && !store.value.githubUser) return;

        const features = fileSystem.features;
        const isAdmin = features.hasGovernance && store.value.githubUser ? await github.isAdmin() : false;

        this.updateState({ 
            canWrite: features.canWrite,
            isAdmin: isAdmin
        });
        
        // Initial data load based on tab
        if (this.state.adminTab === 'archives') this.loadReleases();
        if (this.state.adminTab === 'access') this.loadFolderTree();

        if (!fileSystem.isLocal && features.canWrite) {
            const isHealthy = await github.checkHealth();
            this.updateState({ isRepoHealthy: isHealthy });
            this.loadAdminData();
        }
    }

    async loadAdminData() {
        if (fileSystem.isLocal) return;
        
        const promises = [
            github.getPullRequests(),
            github.getCollaborators()
        ];
        
        if (fileSystem.features.hasGovernance) {
            promises.push(github.getCodeOwners());
        }

        const results = await Promise.all(promises);
        
        const prs = results[0] || [];
        const users = results[1] || [];
        const gov = results.length > 2 ? results[2] : null;

        const parsedRules = this.parseGovernance(gov?.content || '');

        this.updateState({ 
            adminData: { prs, users, gov },
            accessRules: parsedRules,
            isDirty: false
        });
    }
    
    // --- PERMISSIONS / FOLDER LOGIC ---

    async loadFolderTree() {
        this.updateState({ loadingTree: true });
        try {
            const flatTree = await fileSystem.getTree('content');
            
            const folders = flatTree
                .filter(node => node.type === 'tree')
                .map(node => {
                    let p = node.path;
                    if (!p.startsWith('/')) p = '/' + p;
                    if (!p.endsWith('/')) p = p + '/';
                    return p;
                });

            const root = { name: 'Root', path: '/', children: [] };
            
            folders.forEach(path => {
                const parts = path.split('/').filter(p => p);
                let current = root;
                
                parts.forEach((part, index) => {
                    let existing = current.children.find(c => c.name === part);
                    if (!existing) {
                        const currentPath = '/' + parts.slice(0, index + 1).join('/') + '/';
                        existing = { name: part, path: currentPath, children: [] };
                        current.children.push(existing);
                    }
                    current = existing;
                });
            });
            
            const sortNode = (node) => {
                if (node.children) {
                    node.children.sort((a, b) => a.name.localeCompare(b.name));
                    node.children.forEach(sortNode);
                }
            };
            sortNode(root);

            this.updateState({ accessTree: root, loadingTree: false });
        } catch(e) {
            console.error("Error loading folder tree", e);
            this.updateState({ loadingTree: false });
        }
    }

    parseGovernance(rawText) {
        if (!rawText) return [];
        const lines = rawText.split('\n');
        const rules = [];
        lines.forEach(line => {
            const clean = line.trim();
            if (!clean || clean.startsWith('#')) return;
            const parts = clean.split(/\s+/);
            if (parts.length >= 2) {
                let path = parts[0];
                if (!path.startsWith('/')) path = '/' + path;
                if (!path.endsWith('/')) path = path + '/';
                rules.push({ path: path, owner: parts[1] });
            }
        });
        return rules;
    }
    
    toggleFolder(path) {
        const expanded = new Set(this.state.expandedPaths);
        if (expanded.has(path)) expanded.delete(path);
        else expanded.add(path);
        this.updateState({ expandedPaths: expanded });
    }

    selectAccessFolder(path) {
        this.updateState({ selectedFolderPath: path });
    }
    
    addGuardianToSelected(username) {
        const { selectedFolderPath, accessRules } = this.state;
        if (!selectedFolderPath || !username) return;
        const exists = accessRules.some(r => r.path === selectedFolderPath && r.owner === username);
        if (exists) return;
        const newRules = [...accessRules, { path: selectedFolderPath, owner: username }];
        this.updateState({ accessRules: newRules, isDirty: true });
    }
    
    removeGuardianFromSelected(username) {
        const { selectedFolderPath, accessRules } = this.state;
        if (!selectedFolderPath) return;
        const newRules = accessRules.filter(r => !(r.path === selectedFolderPath && r.owner === username));
        this.updateState({ accessRules: newRules, isDirty: true });
    }
    
    async saveGovernance() {
        const { accessRules, adminData } = this.state;
        let content = "# ARBOR GOVERNANCE\n# Define ownership rules here\n\n";
        accessRules.forEach(r => {
            content += `${r.path} ${r.owner}\n`;
        });
        
        try {
            await github.saveCodeOwners(adminData.gov?.path || '.github/CODEOWNERS', content, adminData.gov?.sha);
            store.notify("Permissions updated successfully.");
            this.loadAdminData(); 
        } catch(e) {
            store.notify("Error saving rules: " + e.message, true);
        }
    }

    // --- RELEASES LOGIC ---
    
    async loadReleases() {
        this.updateState({ releasesLoading: true });
        try {
            const tree = await fileSystem.getTree('content/releases');
            const releaseFolders = new Set();
            tree.forEach(node => {
                const path = node.path;
                const parts = path.split('/');
                if (parts.length >= 3 && parts[0] === 'content' && parts[1] === 'releases') {
                    releaseFolders.add(parts[2]);
                }
            });
            const list = Array.from(releaseFolders).sort().reverse();
            this.updateState({ releases: list, releasesLoading: false }); 
        } catch (e) {
            console.warn("Release load error", e);
            this.updateState({ releases: [], releasesLoading: false });
        }
    }

    async createRelease() {
        const name = this.state.newVersionName.trim().replace(/[^a-z0-9\.\-_]/gi, '');
        if (!name) return;
        this.updateState({ creatingRelease: true });
        try {
            await fileSystem.createNode('content/releases', name, 'folder');
            this.updateState({ newVersionName: '' });
            await this.loadReleases();
            store.notify(`Version '${name}' created.`);
        } catch (e) {
            store.notify("Error: " + e.message, true);
        } finally {
            this.updateState({ creatingRelease: false });
        }
    }
    
    async deleteRelease(version) {
        // Since we are inside the admin panel which is a modal, using store.confirm will replace it.
        // For admin panel, we can use a small internal overlay or accept the context switch.
        // Given the complexity of implementing internal overlays for every admin action, 
        // we'll try to stick to notifications or accept the modal replacement for critical actions.
        // HOWEVER, replacing the modal closes the admin panel. That is bad UX.
        // Let's implement a simple inline check for delete.
        
        // Inline confirm logic: Change button state?
        // Actually, let's just use `confirm` for now but warn user it might close panel? 
        // No, the goal is consistent UI. 
        // Let's use `window.confirm` only if absolutely necessary? NO, the user said NO native prompts.
        
        // We will skip implementing the delete button action here if it closes the modal, 
        // OR we implement a micro-overlay inside the panel.
        // Let's do a micro-overlay logic.
        
        if (this._pendingDelete === version) {
             // Second click confirmed
             this.updateState({ releasesLoading: true });
             try {
                await fileSystem.deleteNode(`content/releases/${version}`, 'folder');
                await this.loadReleases();
                this._pendingDelete = null;
            } catch (e) {
                store.notify("Error deleting archive: " + e.message, true);
                this.updateState({ releasesLoading: false });
            }
        } else {
            this._pendingDelete = version;
            store.notify("Click trash again to confirm delete.", false);
            // Auto-reset
            setTimeout(() => {
                if(this._pendingDelete === version) this._pendingDelete = null;
            }, 3000);
        }
    }

    switchToVersion(version) {
        const activeSource = store.value.activeSource;
        let dataRoot = activeSource.url;
        if (dataRoot.includes('/data.json')) {
            dataRoot = dataRoot.replace('/data.json', '');
        } else {
            dataRoot = dataRoot.substring(0, dataRoot.lastIndexOf('/'));
        }
        const newUrl = `${dataRoot}/releases/${version}.json`;

        // We can use store.confirm here because switching versions SHOULD close the admin panel anyway to show the new tree.
        store.confirm(`Switch to '${version}'?`).then(ok => {
            if (ok) {
                const newSource = {
                    ...activeSource,
                    id: `${activeSource.id}-${version}`,
                    name: `${activeSource.name} (${version})`,
                    url: newUrl,
                    type: 'archive'
                };
                store.loadData(newSource);
                store.setModal(null);
            }
        });
    }

    updateState(partial) {
        this.state = { ...this.state, ...partial };
        this.render();
    }

    async handleLogin() {
        const token = this.querySelector('#inp-token').value.trim();
        if (!token) return;
        this.updateState({ isLoggingIn: true, loginError: null });
        try {
            const user = await github.initialize(token);
            if (user) {
                localStorage.setItem('arbor-gh-token', token);
                store.update({ githubUser: user });
            } else { throw new Error("Invalid Token"); }
        } catch (e) {
            this.updateState({ loginError: "Auth Failed", isLoggingIn: false });
        }
    }

    // --- RECURSIVE TREE RENDERER ---
    renderFolderTree(node, depth = 0) {
        const { selectedFolderPath, accessRules, expandedPaths } = this.state;
        
        const hasRules = accessRules.some(r => r.path === node.path);
        const isSelected = selectedFolderPath === node.path;
        const isExpanded = expandedPaths.has(node.path);
        const hasChildren = node.children && node.children.length > 0;
        
        const padding = depth * 14 + 8;
        
        let html = `
        <div class="tree-item group select-none">
            <div class="flex items-center w-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded-lg mb-0.5 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500/20' : ''}">
                
                <div style="width: ${padding}px" class="shrink-0 h-8"></div>
                
                ${hasChildren ? `
                <button class="w-6 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                        onclick="window.arborAdminToggleFolder('${node.path}')">
                    <span class="text-[10px] font-bold transform transition-transform ${isExpanded ? 'rotate-90' : ''}">▶</span>
                </button>
                ` : `<div class="w-6 h-8"></div>`}
                
                <button class="flex-1 text-left flex items-center gap-2 h-8 pr-2 min-w-0"
                        onclick="window.arborAdminSelectFolder('${node.path}')">
                    <span class="text-lg leading-none ${isSelected ? 'text-blue-500' : 'text-slate-400'}">${depth === 0 ? '🌳' : (isExpanded ? '📂' : '📁')}</span>
                    <span class="text-xs font-bold truncate ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}">${node.name}</span>
                    ${hasRules ? `<span class="shrink-0 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-200">🛡️</span>` : ''}
                </button>
            </div>
            
            ${isExpanded && hasChildren ? `
            <div class="tree-children">
                ${node.children.map(c => this.renderFolderTree(c, depth + 1)).join('')}
            </div>
            ` : ''}
        </div>
        `;
        return html;
    }

    renderLogin() {
        const ui = store.ui;
        this.innerHTML = `
        <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-950 relative rounded-3xl overflow-hidden">
            <button id="btn-close-panel" class="absolute top-6 right-6 w-10 h-10 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors flex items-center justify-center text-xl">✕</button>
            <div class="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto animate-in fade-in zoom-in duration-300">
                <div class="w-24 h-24 bg-black text-white rounded-3xl flex items-center justify-center text-5xl mb-8 shadow-2xl transform -rotate-6">🐙</div>
                <h2 class="text-3xl font-black text-slate-800 dark:text-white mb-2">${ui.contribTitle}</h2>
                <p class="text-lg text-slate-500 mb-10 font-medium leading-relaxed">${ui.contribDesc}</p>
                <input id="inp-token" type="password" placeholder="${ui.contribTokenPlaceholder}" class="w-full px-6 py-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 mb-4 focus:border-black dark:focus:border-white outline-none transition-colors text-lg font-bold text-center">
                ${this.state.loginError ? `<p class="text-sm text-red-500 font-bold mb-6 animate-pulse bg-red-50 px-4 py-2 rounded-lg">${this.state.loginError}</p>` : ''}
                <button id="btn-login" class="w-full py-4 bg-black dark:bg-white text-white dark:text-black font-black text-xl rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all mb-6">
                    ${this.state.isLoggingIn ? 'Connecting...' : ui.contribConnect}
                </button>
            </div>
        </div>`;
        this.querySelector('#btn-close-panel').onclick = () => store.setModal(null);
        const btnLogin = this.querySelector('#btn-login');
        if(btnLogin) btnLogin.onclick = () => this.handleLogin();
    }

    render() {
        const ui = store.ui;
        
        if (!fileSystem.isLocal && !store.value.githubUser) {
            this.renderLogin();
            return;
        }

        const { adminTab, releases, releasesLoading, adminData, accessRules, isDirty, accessTree, selectedFolderPath, loadingTree, newVersionName, creatingRelease } = this.state;
        const sourceName = store.value.activeSource?.name || 'Garden';
        const navButtonClass = (tab) => `flex-1 py-3 flex items-center justify-center gap-2 font-black uppercase text-xs tracking-widest transition-all ${adminTab === tab ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md rounded-xl' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl'}`;

        const header = `
        <div class="flex flex-col bg-white dark:bg-slate-950 shrink-0 z-20 border-b border-slate-100 dark:border-slate-800">
            <div class="p-4 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-xl">🏛️</div>
                    <div>
                        <h2 class="text-lg font-black text-slate-800 dark:text-white uppercase leading-none tracking-tight">${sourceName}</h2>
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Admin Console</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button id="btn-close-panel" class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-colors">✕</button>
                </div>
            </div>
            
            <div class="flex px-4 pb-4 gap-2 overflow-x-auto no-scrollbar">
                <button id="tab-proposals" class="${navButtonClass('proposals')}">
                    <span>📬</span> ${ui.adminPrs || "Proposals"}
                </button>
                <button id="tab-access" class="${navButtonClass('access')}">
                    <span>🔐</span> ${ui.adminGovTitle || "Permissions"}
                </button>
                <button id="tab-faculty" class="${navButtonClass('faculty')}">
                    <span>👩‍🏫</span> ${ui.adminTeam || "Faculty"}
                </button>
                <button id="tab-archives" class="${navButtonClass('archives')}">
                    <span>⏳</span> ${ui.adminVersions || "Versions"}
                </button>
            </div>
        </div>`;

        let content = '';

        // --- TAB: PERMISSIONS (ACCESS) ---
        if (adminTab === 'access') {
            
            let treeHtml = '';
            if (loadingTree || !accessTree) {
                treeHtml = `<div class="p-8 text-center text-slate-400 text-xs animate-pulse flex flex-col gap-2"><span class="text-2xl">📡</span><span>Scanning territory...</span></div>`;
            } else {
                treeHtml = `<div class="w-full whitespace-nowrap">${this.renderFolderTree(accessTree)}</div>`;
            }

            let detailsHtml = '';
            if (!selectedFolderPath) {
                detailsHtml = `
                <div class="flex-1 flex flex-col items-center justify-center text-slate-400 text-center p-8">
                    <span class="text-6xl mb-4 opacity-10">🗺️</span>
                    <p class="text-sm font-bold text-slate-500">Select a folder from the list.</p>
                    <p class="text-xs mt-2 opacity-60">You can assign permissions per folder.</p>
                </div>`;
            } else {
                const folderName = selectedFolderPath === '/' ? 'Root Territory' : selectedFolderPath.split('/').filter(p => p).pop();
                const folderGuardians = accessRules.filter(r => r.path === selectedFolderPath);
                const userOptions = adminData.users.map(u => `<option value="@${u.login}">@${u.login}</option>`).join('');

                detailsHtml = `
                <div class="flex-1 flex flex-col h-full overflow-hidden">
                    <div class="p-6 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl">📂</span>
                            <div class="min-w-0">
                                <h3 class="text-lg font-black text-slate-800 dark:text-white truncate">${folderName}</h3>
                                <p class="text-xs font-mono text-slate-400 mt-0.5 truncate max-w-full" title="${selectedFolderPath}">${selectedFolderPath}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="p-6 flex-1 overflow-y-auto custom-scrollbar">
                        <div class="mb-8">
                            <div class="flex justify-between items-center mb-3">
                                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest">Maintainers</h4>
                                <span class="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500 font-bold">${folderGuardians.length}</span>
                            </div>
                            
                            ${folderGuardians.length === 0 
                                ? `<div class="p-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center">
                                     <p class="text-sm text-slate-400 font-medium">No maintainers assigned.</p>
                                   </div>`
                                : `<div class="space-y-2">
                                    ${folderGuardians.map(r => `
                                        <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                                            <div class="flex items-center gap-3">
                                                <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                                    ${r.owner.substring(1,3).toUpperCase()}
                                                </div>
                                                <span class="font-bold text-slate-700 dark:text-slate-200 text-sm">${r.owner}</span>
                                            </div>
                                            <button class="btn-revoke w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" data-owner="${r.owner}">✕</button>
                                        </div>
                                    `).join('')}
                                   </div>`
                            }
                        </div>
                        
                        <div class="bg-blue-50 dark:bg-blue-900/10 p-5 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                            <label class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase mb-2 block tracking-wider">Grant Access</label>
                            <div class="flex gap-2">
                                <div class="relative flex-1">
                                    <select id="inp-new-guardian" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none font-bold text-slate-700 dark:text-white appearance-none focus:ring-2 focus:ring-blue-500">
                                        <option value="" disabled selected>Select Contributor...</option>
                                        ${userOptions}
                                    </select>
                                    <div class="absolute right-4 top-3.5 pointer-events-none text-slate-400 text-xs">▼</div>
                                </div>
                                <button id="btn-add-guardian" class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold text-xs shadow-lg shadow-blue-500/20 transition-transform active:scale-95">
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            }

            content = `
            <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-900 relative">
                <div class="flex-1 flex overflow-hidden">
                    <!-- LEFT: TREE (Fixed Width with Scroll) -->
                    <div class="w-1/3 md:w-72 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-y-auto overflow-x-auto custom-scrollbar p-3 pb-24 shrink-0">
                        <div class="mb-4 px-2">
                            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest">Map</h4>
                        </div>
                        ${treeHtml}
                    </div>
                    
                    <!-- RIGHT: DETAILS -->
                    <div class="flex-1 bg-slate-50 dark:bg-slate-900 overflow-hidden relative flex flex-col min-w-0">
                        ${detailsHtml}
                    </div>
                </div>

                ${isDirty ? `
                <div class="absolute bottom-6 right-6 z-40 animate-in slide-in-from-bottom-4 bounce-in">
                    <button id="btn-save-gov" class="bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-full font-black shadow-2xl transition-all flex items-center gap-3 transform hover:scale-105 active:scale-95 ring-4 ring-white dark:ring-slate-800">
                        <span>💾</span> ${ui.adminSaveGov || "Save Rules"}
                    </button>
                </div>
                ` : ''}
            </div>`;
        }

        // --- TAB: FACULTY ---
        else if (adminTab === 'faculty') {
            content = `
            <div class="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
                <div class="max-w-3xl mx-auto">
                    <div class="flex justify-between items-center mb-8">
                        <div>
                            <h3 class="font-black text-xl text-slate-800 dark:text-white uppercase">Faculty</h3>
                            <p class="text-xs text-slate-500 mt-1">Contributors</p>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${adminData.users.map(u => `
                            <div class="flex items-center gap-4 p-5 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                                <img src="${u.avatar}" class="w-14 h-14 rounded-xl border-2 border-slate-100 dark:border-slate-600 shadow-sm">
                                <div>
                                    <h4 class="font-bold text-slate-800 dark:text-white text-base">@${u.login}</h4>
                                    <span class="text-[10px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded-md uppercase tracking-wide mt-1 inline-block">${u.role}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>`;
        }

        // --- TAB: PROPOSALS ---
        else if (adminTab === 'proposals') {
            content = `<div class="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 dark:bg-slate-900">
                ${adminData.prs.length === 0 ? `
                    <div class="flex flex-col items-center justify-center h-64 text-slate-400">
                        <span class="text-6xl mb-4 opacity-20">📭</span>
                        <p class="font-bold">Inbox Zero</p>
                    </div>
                ` : 
                adminData.prs.map(pr => `
                    <div class="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex justify-between items-center shadow-sm hover:shadow-md transition-shadow group">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-xl flex flex-col items-center justify-center font-bold text-xs border border-blue-100 dark:border-blue-800">
                                <span>PR</span>
                                <span class="text-sm">#${pr.number}</span>
                            </div>
                            <div>
                                <h4 class="font-bold text-sm text-slate-800 dark:text-white group-hover:text-blue-600 transition-colors">${pr.title}</h4>
                                <div class="flex items-center gap-2 mt-1">
                                    <img src="${pr.user.avatar_url}" class="w-4 h-4 rounded-full">
                                    <p class="text-xs text-slate-500 font-medium">@${pr.user.login}</p>
                                </div>
                            </div>
                        </div>
                        <a href="${pr.html_url}" target="_blank" class="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-xs shadow-lg hover:opacity-90 transition-all active:scale-95">Review</a>
                    </div>
                `).join('')}
            </div>`;
        }

        // --- TAB: ARCHIVES ---
        else if (adminTab === 'archives') {
            content = `
            <div class="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950/50">
                    <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Create Archive Version</label>
                    <div class="flex gap-2 max-w-lg">
                        <input id="inp-version" type="text" placeholder="e.g. v2.0" class="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white font-mono" value="${newVersionName}">
                        <button id="btn-create-release" class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg transition-all text-xs uppercase tracking-wider flex items-center gap-2" ${creatingRelease ? 'disabled' : ''}>
                            ${creatingRelease ? '<span class="animate-spin">⏳</span>' : '<span>+ Create</span>'}
                        </button>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
                    <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Version History</h4>
                    ${releasesLoading 
                        ? `<div class="p-12 text-center text-slate-400"><div class="animate-spin text-3xl mb-4 opacity-50">⏳</div></div>` 
                        : (releases.length === 0 
                            ? `<div class="p-8 text-center text-slate-400 italic text-sm">No archives found.</div>`
                            : releases.map(ver => `
                                <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                                    <div class="flex items-center gap-4">
                                        <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 flex items-center justify-center text-lg">📦</div>
                                        <span class="font-black text-lg text-slate-700 dark:text-slate-200 font-mono">${ver}</span>
                                    </div>
                                    <div class="flex gap-2">
                                        <button class="btn-switch-release px-5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white text-slate-600 dark:text-blue-200 text-xs font-bold rounded-xl transition-colors" data-ver="${ver}">Load</button>
                                        <button class="btn-delete-release w-9 h-9 flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors" data-ver="${ver}" title="Delete Archive">🗑️</button>
                                    </div>
                                </div>
                            `).join(''))
                    }
                </div>
            </div>`;
        }

        this.innerHTML = `<div class="flex flex-col h-full overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl">${header}${content}</div>`;
        this.bindEvents();
    }

    bindEvents() {
        const closeBtn = this.querySelector('#btn-close-panel');
        if (closeBtn) closeBtn.onclick = () => store.setModal(null);
        
        const tabs = ['faculty', 'proposals', 'archives', 'access'];
        tabs.forEach(t => {
            const btn = this.querySelector(`#tab-${t}`);
            if(btn) btn.onclick = () => { 
                this.updateState({ adminTab: t }); 
                if(t === 'faculty' || t === 'proposals') this.loadAdminData();
                if(t === 'access') { this.loadAdminData(); this.loadFolderTree(); }
                if(t === 'archives') this.loadReleases();
            };
        });
        
        if (this.state.adminTab === 'access') {
            const btnSave = this.querySelector('#btn-save-gov');
            if(btnSave) btnSave.onclick = () => this.saveGovernance();
            
            const btnAdd = this.querySelector('#btn-add-guardian');
            if(btnAdd) btnAdd.onclick = () => {
                const user = this.querySelector('#inp-new-guardian').value;
                this.addGuardianToSelected(user);
            };
            
            this.querySelectorAll('.btn-revoke').forEach(b => {
                b.onclick = (e) => this.removeGuardianFromSelected(e.currentTarget.dataset.owner);
            });
        }
        
        if (this.state.adminTab === 'archives') {
            const btnCreate = this.querySelector('#btn-create-release');
            if(btnCreate) btnCreate.onclick = () => this.createRelease();
            
            const inp = this.querySelector('#inp-version');
            if(inp) inp.oninput = (e) => this.state.newVersionName = e.target.value;
            
            this.querySelectorAll('.btn-switch-release').forEach(b => {
                b.onclick = (e) => this.switchToVersion(e.currentTarget.dataset.ver);
            });
            
            this.querySelectorAll('.btn-delete-release').forEach(b => {
                b.onclick = (e) => this.deleteRelease(e.currentTarget.dataset.ver);
            });
        }
    }
}
customElements.define('arbor-admin-panel', ArborAdminPanel);
